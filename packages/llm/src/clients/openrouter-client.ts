import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod/v3';
import type { LlmClientInterface, BaseLlmClientConfig, StreamChunk } from '../types/client-interface';
import { DEFAULT_SYSTEM_PROMPT } from '../models';
import { DebugLogger } from '../utils/debug';
import {
  generateRequestId,
  wrapSdkError,
  type LlmErrorContext,
} from '../utils/errors';
import { resolveRefs } from '../utils/resolve-refs';
// Use OpenAI SDK's vendored zod-to-json-schema for v3 compatibility
import { zodToJsonSchema } from 'openai/_vendor/zod-to-json-schema/zodToJsonSchema.mjs';

export interface OpenRouterClientConfig extends Omit<BaseLlmClientConfig, 'model'> {
  /**
   * The model to use (e.g., 'openai/gpt-4', 'anthropic/claude-3-opus')
   * Defaults to 'google/gemini-2.5-flash-lite-preview-09-2025' if not specified
   */
  model?: string;

  /**
   * @deprecated OpenAI formatter client is no longer needed. OpenRouter now uses native structured outputs.
   * This parameter is kept for backward compatibility but has no effect.
   */
  openaiApiKey?: string;
}

/**
 * Client for interacting with OpenRouter's API with enhanced functionality
 * for structured responses, batch processing, and multi-provider model access.
 * Implements the unified LlmClientInterface.
 *
 * OpenRouter provides access to 300+ models across multiple providers with
 * zero-downtime routing (ZDR) and flexible provider selection.
 *
 * Uses OpenRouter's native structured outputs feature for reliable JSON generation.
 */
export class OpenRouterClient implements LlmClientInterface {
  private client: OpenRouter;
  private apiKey: string;
  private model: string;
  private logger: DebugLogger;
  private timeout: number;

  /**
   * Creates a new OpenRouterClient instance
   *
   * @param config Configuration options
   * @throws Error if the API key is not configured
   */
  constructor(config: OpenRouterClientConfig) {
    // Use config timeout or default to 120 seconds (2 minutes)
    // OpenRouter acts as a proxy, so we use a more conservative default
    this.timeout = config.timeout ?? 120000;
    this.apiKey = config.apiKey;

    this.client = new OpenRouter({
      apiKey: config.apiKey,
      timeoutMs: this.timeout,
      // Note: OpenRouter SDK doesn't support maxRetries configuration
      // Retry logic is handled by the SDK internally
      // config.maxRetries is accepted for API compatibility but not used
    });
    this.model = config.model || 'google/gemini-2.5-flash-lite-preview-09-2025';
    this.logger = new DebugLogger('OpenRouterClient', { enabled: config.debug });

    // Validate configuration on instantiation
    this.validateConfiguration();
  }

  /**
   * Validates that the client is properly configured
   * @returns true if valid, throws an error with details if not
   */
  validateConfiguration(): boolean {
    // Note: The OpenRouter SDK doesn't expose apiKey directly,
    // so we assume it's valid if the client was constructed
    return true;
  }

  /**
   * Returns true when the configured model is a Google/Gemini model,
   * which requires $ref/$defs inlining and anyOf nullable conversion.
   */
  private isGeminiModel(): boolean {
    return this.model.startsWith('google/');
  }

  /**
   * Converts a Zod schema to OpenRouter-compatible JSON Schema format
   * Uses the same zodToJsonSchema approach as OpenAI SDK for v3 compatibility
   *
   * @param schema The Zod schema to convert
   * @param name The name for the schema (used by OpenRouter)
   * @param description Optional description for the schema
   * @returns OpenRouter-compatible JSON schema config
   */
  private zodToOpenRouterSchema<T extends z.ZodType>(
    schema: T,
    name: string,
    description?: string
  ): { name: string; schema: any; strict: boolean; description?: string } {
    try {
      // Use OpenAI SDK's vendored zod-to-json-schema for v3 compatibility
      // This is the same approach OpenAI SDK uses internally
      let jsonSchema = zodToJsonSchema(schema, {
        openaiStrictMode: true,
        name,
        nameStrategy: 'duplicate-ref',
        $refStrategy: 'extract-to-root',
        nullableStrategy: 'property',
      });

      // Gemini models do not support $ref/$defs in JSON Schema.
      // Inline all references and convert anyOf nullable patterns.
      if (this.isGeminiModel()) {
        this.logger.log('Resolving $ref/$defs for Gemini model compatibility', {
          model: this.model,
        });
        jsonSchema = resolveRefs(jsonSchema as Record<string, unknown>);
      }

      return {
        name,
        schema: jsonSchema,
        strict: true,
        description,
      };
    } catch (error) {
      this.logger.logWarning('Failed to convert Zod schema to JSON Schema', { error });
      throw new Error(`Schema conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates a response from OpenRouter's API and returns the text content
   * Uses the chat API which is stateless when used without conversation history.
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The text content as a string
   */
  async createResponse(prompt: string, options?: { timeout?: number }): Promise<string> {
    const response = await this.createRawResponse(prompt, options);
    return this.extractContentFromResponse(response);
  }

  /**
   * Creates a raw response from OpenRouter's API and returns the full response object
   * Use this when you need access to metadata like usage stats, finish reason, etc.
   * Uses the chat API which is stateless when used without conversation history.
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The complete chat completion response from OpenRouter
   */
  async createRawResponse(prompt: string, options?: { timeout?: number }): Promise<unknown> {
    const effectiveTimeout = options?.timeout ?? this.timeout;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new OpenRouter({
          apiKey: this.apiKey,
          timeoutMs: effectiveTimeout,
        })
      : this.client;

    const response = await client.chat.send({
      chatGenerationParams: {
        model: this.model,
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        stream: false,
      },
    });

    return response;
  }

  /**
   * Extracts text content from a raw OpenRouter response object
   * OpenRouter's chat API returns responses with a 'message.content' field in choices
   *
   * @param response The raw response from OpenRouter
   * @returns The text content as a string
   * @throws Error if there is no content in the response
   */
  private extractContentFromResponse(response: unknown): string {
    const typedResponse = response as any;
    const content = typedResponse.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenRouter response');
    }
    return typeof content === 'string' ? content : JSON.stringify(content);
  }

  /**
   * Creates a streaming response from OpenRouter's API
   * Returns an async iterator that yields chunks of text as they arrive
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns An async iterable of stream chunks
   */
  async *createStreamingResponse(
    prompt: string,
    options?: { timeout?: number }
  ): AsyncIterable<StreamChunk> {
    yield* this.createStreamingResponseInternal(prompt, undefined, options?.timeout);
  }

  /**
   * Internal streaming response method with support for structured outputs
   *
   * @param prompt The prompt to send to the model
   * @param responseFormat Optional structured output format configuration
   * @param timeout Optional timeout in milliseconds
   * @param systemPrompt Optional custom system prompt (defaults to DEFAULT_SYSTEM_PROMPT)
   * @returns An async iterable of stream chunks
   */
  private async *createStreamingResponseInternal(
    prompt: string,
    responseFormat?: {
      type: 'json_schema';
      jsonSchema: {
        name: string;
        schema: any;
        strict?: boolean;
        description?: string;
      };
    },
    timeout?: number,
    systemPrompt: string = DEFAULT_SYSTEM_PROMPT
  ): AsyncIterable<StreamChunk> {
    const effectiveTimeout = timeout ?? this.timeout;
    const requestId = generateRequestId();
    const startTime = Date.now();

    this.logger.log('createStreamingResponse called', {
      modelUsed: this.model,
      requestId,
      hasResponseFormat: !!responseFormat,
      timeout: effectiveTimeout,
    });

    try {
      // Create a client with the effective timeout if different from instance timeout
      const client = effectiveTimeout !== this.timeout
        ? new OpenRouter({
            apiKey: this.apiKey,
            timeoutMs: effectiveTimeout,
          })
        : this.client;

      const stream = await client.chat.send({
        chatGenerationParams: {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          stream: true,
          ...(responseFormat && { responseFormat }),
        },
      });

      let accumulatedText = '';
      let usage: StreamChunk['usage'] | undefined;

      for await (const chunk of stream as any) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          accumulatedText += content;

          yield {
            text: content,
            isComplete: false,
            accumulatedText,
          };
        }

        // Capture usage from chunk when present (OpenRouter includes it in final chunk)
        // Note: OpenRouter SDK returns camelCase properties (promptTokens, completionTokens, totalTokens)
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.promptTokens,
            completionTokens: chunk.usage.completionTokens,
            totalTokens: chunk.usage.totalTokens,
          };
        }
      }

      // Final chunk with usage
      const elapsedMs = Date.now() - startTime;
      this.logger.log(`Streaming completed in ${elapsedMs}ms`);
      if (usage) {
        this.logger.logUsage(usage);
      }

      yield {
        text: '',
        isComplete: true,
        accumulatedText,
        usage,
      };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const context: LlmErrorContext = {
        clientType: 'openrouter',
        model: this.model,
        elapsedMs,
        timeoutMs: effectiveTimeout,
        operation: 'createStreamingResponse',
        requestId,
        metadata: {
          promptSize: prompt.length,
          hasResponseFormat: !!responseFormat,
        },
      };

      const wrappedError = wrapSdkError(error, context);
      this.logger.logError('Streaming failed', wrappedError, wrappedError.context);
      throw wrappedError;
    }
  }

  /**
   * Creates a structured response using OpenRouter's native structured outputs feature.
   * Uses Zod schema conversion to JSON Schema and OpenRouter's response_format parameter
   * to enforce schema compliance at the model level.
   *
   * @param options Configuration options for the structured response
   * @param options.prompt The prompt to send to the model
   * @param options.schema The Zod schema to validate the response against
   * @param options.formatGuidance Optional guidance for formatting the response
   * @param options.reasoningEffort Normalized reasoning effort level ('low' | 'medium' | 'high') - not used by OpenRouter
   * @param options.maxAttempts Maximum number of retry attempts (default: 1, no retries)
   * @param options.logExecutionTime Whether to log execution time warnings (default: false)
   * @param options.responseInstructions Additional instructions to append to the prompt (deprecated, use formatGuidance)
   * @param options.useWebSearch Whether to enable web search for this request (default: false)
   * @param options.stream Whether to use streaming for the generation phase (default: true)
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The structured and validated response according to the provided schema
   * @throws Error if the response cannot be parsed or if the model refuses to respond
   */
  async createStructuredResponse<T extends z.ZodType>({
    prompt,
    schema,
    formatGuidance,
    reasoningEffort = 'low',
    maxAttempts = 1,
    logExecutionTime = false,
    responseInstructions,
    stream = true,
    timeout,
  }: {
    prompt: string;
    schema: T;
    formatGuidance?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    maxAttempts?: number;
    logExecutionTime?: boolean;
    responseInstructions?: string;
    useWebSearch?: boolean;
    stream?: boolean;
    timeout?: number;
  }): Promise<z.infer<T>> {
    // Handle deprecated responseInstructions parameter
    const effectiveFormatGuidance =
      responseInstructions ?
        formatGuidance ? `${formatGuidance}\n\n${responseInstructions}`
        : responseInstructions
      : formatGuidance;

    const effectiveTimeout = timeout ?? this.timeout;
    const requestId = generateRequestId();
    let attempts = 0;
    let lastError: unknown;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new OpenRouter({
          apiKey: this.apiKey,
          timeoutMs: effectiveTimeout,
        })
      : this.client;

    while (attempts < maxAttempts) {
      attempts++;
      const startTime = Date.now();

      try {
        this.logger.log('createStructuredResponse called', {
          modelUsed: this.model,
          schemaType: typeof schema,
          schemaConstructor: schema?.constructor?.name,
          reasoningEffort,
          attempt: `${attempts}/${maxAttempts}`,
          usingNativeStructuredOutputs: true,
          stream,
          requestId,
          timeout: effectiveTimeout,
        });

        // Convert Zod schema to OpenRouter JSON Schema format
        const responseFormat = {
          type: 'json_schema' as const,
          jsonSchema: this.zodToOpenRouterSchema(
            schema,
            'structuredResponse',
            effectiveFormatGuidance
          ),
        };

        // Build the system prompt with instructions
        const systemPrompt =
          DEFAULT_SYSTEM_PROMPT +
          '\n\nRespond with valid JSON data matching the provided schema.' +
          (effectiveFormatGuidance ? `\n\n${effectiveFormatGuidance}` : '');

        let contentString: string;

        if (stream) {
          // Use streaming with structured output format
          this.logger.log('Using streaming generation with native structured outputs');
          let accumulatedText = '';
          let lastLoggedLength = 0;

          for await (const chunk of this.createStreamingResponseInternal(prompt, responseFormat, effectiveTimeout, systemPrompt)) {
            if (!chunk.isComplete) {
              accumulatedText += chunk.text;

              // Log progress every 100 characters for observability
              if (accumulatedText.length - lastLoggedLength >= 100) {
                this.logger.log(`Streaming progress: ${accumulatedText.length} chars`);
                lastLoggedLength = accumulatedText.length;
              }
            }
          }

          this.logger.log(`Streaming completed, total: ${accumulatedText.length} chars`);
          contentString = accumulatedText;
        } else {
          // Non-streaming path with structured outputs
          const response = await client.chat.send({
            chatGenerationParams: {
              model: this.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
              stream: false,
              responseFormat,
            },
          });

          this.logger.logUsage((response as any).usage || {});
          contentString = this.extractContentFromResponse(response);
        }

        // Parse and validate the response
        // OpenRouter should return valid JSON matching the schema
        this.logger.log('Parsing and validating structured response');

        const parsed = JSON.parse(contentString);
        const validatedContent = schema.parse(parsed);

        // Log execution time
        const executionTime = Date.now() - startTime;
        if (logExecutionTime || this.logger.isEnabled()) {
          this.logger.logExecutionTime('createStructuredResponse', executionTime);
        }

        return validatedContent;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - startTime;

        const context: LlmErrorContext = {
          clientType: 'openrouter',
          model: this.model,
          elapsedMs,
          timeoutMs: effectiveTimeout,
          operation: 'createStructuredResponse',
          requestId,
          metadata: {
            promptSize: prompt.length,
            schemaComplexity: typeof schema,
            attempt: attempts,
            maxAttempts,
            usingNativeStructuredOutputs: true,
          },
        };

        const wrappedError = wrapSdkError(error, context);

        this.logger.log(`Failed attempt ${attempts}/${maxAttempts}`, {
          error: wrappedError.message,
          elapsedMs,
        });

        if (attempts === maxAttempts) {
          this.logger.logError(
            'createStructuredResponse failed after all attempts',
            wrappedError,
            wrappedError.context,
          );
          throw wrappedError;
        }

        // Wait before retrying (exponential backoff)
        if (attempts < maxAttempts) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          this.logger.log(`Retrying after ${backoffMs}ms backoff...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('Failed to get structured response from LLM');
  }

  /**
   * Process a batch of items with an LLM using parallel processing
   */
  async processBatchWithLLM<T, R>({
    items,
    processFn,
    batchSize = 5,
  }: {
    items: T[];
    processFn: (batch: T[]) => Promise<R[]>;
    batchSize?: number;
  }): Promise<R[]> {
    // Split items into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process all batches in parallel
    const results = await Promise.all(batches.map(processFn));

    // Flatten the results array
    return results.flat();
  }

  /**
   * Generates an embedding vector for the provided text
   *
   * Note: OpenRouter does not have a native embeddings endpoint.
   * This method throws an error and directs users to use OpenAI directly.
   *
   * @param _value The text to generate an embedding for
   * @throws Error indicating embeddings are not supported
   */
  async generateEmbedding(_value: string): Promise<number[]> {
    throw new Error('OpenRouter does not support embeddings. Use OpenAI client directly for embeddings.');
  }
}
