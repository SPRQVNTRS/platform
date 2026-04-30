import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod/v4';
import type { LlmClientInterface, BaseLlmClientConfig, StreamChunk, LlmTokenUsage } from '../types/client-interface';
import { DEFAULT_SYSTEM_PROMPT } from '../models';
import { calculateUsageCost } from '../pricing';
import { DebugLogger } from '../utils/debug';
import {
  generateRequestId,
  wrapSdkError,
  isRetryableError,
  LlmOutputTruncatedError,
  LlmJsonParseError,
  type LlmErrorContext,
} from '../utils/errors';
import { normalizeNullStrings } from '../utils/normalize-null-strings';
import { resolveRefs } from '../utils/resolve-refs';

/**
 * Post-processes a JSON Schema to enforce strict mode for OpenAI/OpenRouter structured outputs.
 * Recursively finds all object schemas and adds `additionalProperties: false` plus ensures all
 * property keys are listed in `required`.
 */
function toStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  function processNode(node: unknown): unknown {
    if (node === null || typeof node !== 'object') {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map(processNode);
    }

    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      result[key] = processNode(value);
    }

    const isObjectSchema =
      result['type'] === 'object' || ('properties' in result && result['properties'] !== null);

    if (isObjectSchema) {
      result['additionalProperties'] = false;
      const properties = result['properties'];
      if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
        const allKeys = Object.keys(properties as Record<string, unknown>);
        const existingRequired = Array.isArray(result['required']) ? (result['required'] as string[]) : [];
        const requiredSet = new Set([...existingRequired, ...allKeys]);
        result['required'] = Array.from(requiredSet);
      }
    }

    return result;
  }

  return processNode(schema) as Record<string, unknown>;
}

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
type OpenRouterRetryConfig =
  | { strategy: 'none' }
  | { strategy: 'backoff'; retryConnectionErrors?: boolean };

export class OpenRouterClient implements LlmClientInterface {
  private client: OpenRouter;
  private apiKey: string;
  private model: string;
  private logger: DebugLogger;
  private timeout: number;
  private retryConfig: OpenRouterRetryConfig;
  private _lastUsage: LlmTokenUsage | null = null;

  get lastUsage(): LlmTokenUsage | null {
    return this._lastUsage;
  }

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
    // The OpenRouter SDK's default backoff retries can mask `timeoutMs` for
    // small values and consume long deadlines. Honor maxRetries=0 by disabling
    // retries entirely; otherwise let the SDK use its default backoff.
    this.retryConfig =
      config.maxRetries === 0
        ? { strategy: 'none' }
        : { strategy: 'backoff', retryConnectionErrors: true };

    this.client = new OpenRouter({
      apiKey: config.apiKey,
      timeoutMs: this.timeout,
      retryConfig: this.retryConfig,
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
      let jsonSchema = toStrictJsonSchema(z.toJSONSchema(schema) as Record<string, unknown>);

      // Gemini models do not support $ref/$defs in JSON Schema.
      // Inline all references and convert anyOf nullable patterns.
      if (this.isGeminiModel()) {
        this.logger.log('Resolving $ref/$defs for Gemini model compatibility', {
          model: this.model,
        });
        jsonSchema = resolveRefs(jsonSchema);
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
          retryConfig: this.retryConfig,
        })
      : this.client;

    const response = await client.chat.send({
      chatRequest: {
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
            retryConfig: this.retryConfig,
          })
        : this.client;

      const stream = await client.chat.send({
        chatRequest: {
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
      let finishReason: string | undefined;

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

        // Capture finish_reason from chunks (present in the final chunk)
        const chunkFinishReason = chunk.choices?.[0]?.finish_reason;
        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
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

      // Final chunk with usage and finish reason
      const elapsedMs = Date.now() - startTime;
      this.logger.log(`Streaming completed in ${elapsedMs}ms`, { finishReason });
      if (usage) {
        this.logger.logUsage(usage);
      }

      yield {
        text: '',
        isComplete: true,
        accumulatedText,
        usage,
        finishReason,
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
    maxAttempts = 3,
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

    this._lastUsage = null;

    const effectiveTimeout = timeout ?? this.timeout;
    const requestId = generateRequestId();
    let attempts = 0;
    let lastError: unknown;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new OpenRouter({
          apiKey: this.apiKey,
          timeoutMs: effectiveTimeout,
          retryConfig: this.retryConfig,
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
        let lastFinishReason: string | undefined;

        if (stream) {
          // Use streaming with structured output format
          this.logger.log('Using streaming generation with native structured outputs');
          let accumulatedText = '';
          let lastLoggedLength = 0;
          let finishReason: string | undefined;

          for await (const chunk of this.createStreamingResponseInternal(prompt, responseFormat, effectiveTimeout, systemPrompt)) {
            if (!chunk.isComplete) {
              accumulatedText += chunk.text;

              // Log progress every 100 characters for observability
              if (accumulatedText.length - lastLoggedLength >= 100) {
                this.logger.log(`Streaming progress: ${accumulatedText.length} chars`);
                lastLoggedLength = accumulatedText.length;
              }
            }

            // Capture finish reason and usage from the final chunk
            if (chunk.finishReason) {
              finishReason = chunk.finishReason;
            }
            if (chunk.usage) {
              const promptTokens = chunk.usage.promptTokens ?? 0;
              const completionTokens = chunk.usage.completionTokens ?? 0;
              this._lastUsage = {
                promptTokens,
                completionTokens,
                totalTokens: chunk.usage.totalTokens ?? 0,
                model: this.model,
                cost: calculateUsageCost(this.model, promptTokens, completionTokens),
              };
            }
          }

          this.logger.log(`Streaming completed, total: ${accumulatedText.length} chars`);

          // Check for output truncation before attempting to parse
          if (finishReason === 'length') {
            throw new LlmOutputTruncatedError(
              {
                clientType: 'openrouter',
                model: this.model,
                elapsedMs: Date.now() - startTime,
                timeoutMs: effectiveTimeout,
                operation: 'createStructuredResponse',
                requestId,
                metadata: {
                  promptSize: prompt.length,
                  contentLength: accumulatedText.length,
                  finishReason,
                },
              },
              accumulatedText.length,
            );
          }

          contentString = accumulatedText;
          lastFinishReason = finishReason;
        } else {
          // Non-streaming path with structured outputs
          const response = await client.chat.send({
            chatRequest: {
              model: this.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
              stream: false,
              responseFormat,
            },
          });

          const typedResponse = response as any;
          const rawUsage = typedResponse.usage;
          if (rawUsage) {
            const promptTokens = rawUsage.prompt_tokens ?? rawUsage.promptTokens ?? 0;
            const completionTokens = rawUsage.completion_tokens ?? rawUsage.completionTokens ?? 0;
            this._lastUsage = {
              promptTokens,
              completionTokens,
              totalTokens: rawUsage.total_tokens ?? rawUsage.totalTokens ?? 0,
              model: this.model,
              cost: calculateUsageCost(this.model, promptTokens, completionTokens),
            };
          }
          this.logger.logUsage(rawUsage || {});

          // Check for output truncation before attempting to parse
          const finishReason = typedResponse.choices?.[0]?.finish_reason;
          if (finishReason === 'length') {
            const content = typedResponse.choices?.[0]?.message?.content ?? '';
            throw new LlmOutputTruncatedError(
              {
                clientType: 'openrouter',
                model: this.model,
                elapsedMs: Date.now() - startTime,
                timeoutMs: effectiveTimeout,
                operation: 'createStructuredResponse',
                requestId,
                metadata: {
                  promptSize: prompt.length,
                  contentLength: typeof content === 'string' ? content.length : 0,
                  finishReason,
                },
              },
              typeof content === 'string' ? content.length : 0,
            );
          }

          contentString = this.extractContentFromResponse(response);
          lastFinishReason = typedResponse.choices?.[0]?.finish_reason;
        }

        // Parse and validate the response
        // OpenRouter should return valid JSON matching the schema
        this.logger.log('Parsing and validating structured response');

        let parsed: unknown;
        try {
          parsed = JSON.parse(contentString);
        } catch (parseError) {
          throw new LlmJsonParseError(
            {
              clientType: 'openrouter',
              model: this.model,
              elapsedMs: Date.now() - startTime,
              timeoutMs: effectiveTimeout,
              operation: 'createStructuredResponse',
              requestId,
              metadata: {
                promptSize: prompt.length,
                contentLength: contentString.length,
                contentPreview: contentString.slice(-200),
                finishReason: lastFinishReason,
              },
            },
            contentString,
            parseError as SyntaxError,
          );
        }

        // Gemini models return the literal string "null" for nullable fields.
        // Normalize before Zod validation to prevent silent data corruption.
        if (this.isGeminiModel()) {
          this.logger.log('Normalizing Gemini null-string values for nullable schema fields');
          normalizeNullStrings(parsed, schema);
        }

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
        const retryable = isRetryableError(error instanceof LlmJsonParseError ? error : wrappedError);

        this.logger.log(`Failed attempt ${attempts}/${maxAttempts}`, {
          error: wrappedError.message,
          errorType: wrappedError.name,
          retryable,
          elapsedMs,
          ...(wrappedError.context.metadata?.errorCode && { errorCode: wrappedError.context.metadata.errorCode }),
          ...(wrappedError.context.metadata?.providerRequestId && { providerRequestId: wrappedError.context.metadata.providerRequestId }),
        });

        if (!retryable || attempts === maxAttempts) {
          const reason = !retryable ? ' (non-retryable)' : ' after all attempts';
          this.logger.logError(
            `createStructuredResponse failed${reason}`,
            wrappedError,
            wrappedError.context,
          );
          throw error instanceof LlmJsonParseError || error instanceof LlmOutputTruncatedError
            ? error
            : wrappedError;
        }

        // Wait before retrying (exponential backoff)
        const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
        this.logger.log(`Retrying after ${backoffMs}ms backoff (attempt ${attempts + 1}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
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
