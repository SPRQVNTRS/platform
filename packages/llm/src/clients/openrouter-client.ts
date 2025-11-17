import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod/v3';
import type { LlmClientInterface, BaseLlmClientConfig, StreamChunk } from '../types/client-interface';
import { DEFAULT_MODELS } from '../models';
import { OpenAIClient } from './openai-client';
import { DebugLogger } from '../utils/debug';
import {
  generateRequestId,
  wrapSdkError,
  type LlmErrorContext,
} from '../utils/errors';

export interface OpenRouterClientConfig extends Omit<BaseLlmClientConfig, 'model'> {
  /**
   * The model to use (e.g., 'openai/gpt-4', 'anthropic/claude-3-opus')
   * Defaults to 'openai/gpt-5-mini' if not specified
   */
  model?: string;

  /**
   * Optional OpenAI API key for structured output formatting
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
 */
export class OpenRouterClient implements LlmClientInterface {
  private client: OpenRouter;
  private model: string;
  private logger: DebugLogger;
  private formatterClient?: OpenAIClient;
  private timeout: number;
  private maxRetries: number;

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
    this.maxRetries = config.maxRetries ?? 2;

    this.client = new OpenRouter({
      apiKey: config.apiKey,
      timeoutMs: this.timeout,
      // Note: OpenRouter SDK doesn't support maxRetries configuration
      // Retry logic is handled by the SDK internally
    });
    this.model = config.model || 'google/gemini-2.5-flash-lite-preview-09-2025';
    this.logger = new DebugLogger('OpenRouterClient', { enabled: config.debug });

    // Auto-detect OpenAI API key from environment if not explicitly provided
    const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;

    // Initialize formatter client if OpenAI API key is available
    if (openaiKey) {
      this.formatterClient = new OpenAIClient({
        apiKey: openaiKey,
        model: DEFAULT_MODELS.STRUCTURED_FORMATTER.model,
        debug: config.debug,
        timeout: this.timeout,
        maxRetries: this.maxRetries,
      });
    } else {
      this.logger.logWarning(
        'No OpenAI API key provided. Structured responses will attempt direct JSON generation. ' +
        'Set OPENAI_API_KEY environment variable for better structured output.'
      );
    }

    // Validate configuration on instantiation
    this.validateConfiguration();
  }

  /**
   * Sets or updates the OpenAI formatter client for structured outputs
   *
   * @param openaiApiKey The OpenAI API key to use for formatting
   */
  setFormatterClient(openaiApiKey: string, debug?: boolean): void {
    this.formatterClient = new OpenAIClient({
      apiKey: openaiApiKey,
      model: DEFAULT_MODELS.STRUCTURED_FORMATTER.model,
      debug,
    });
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
   * Creates a response from OpenRouter's API and returns the text content
   * Uses the chat API which is stateless when used without conversation history.
   *
   * @param prompt The prompt to send to the model
   * @returns The text content as a string
   */
  async createResponse(prompt: string): Promise<string> {
    const response = await this.createRawResponse(prompt);
    return this.extractContentFromResponse(response);
  }

  /**
   * Creates a raw response from OpenRouter's API and returns the full response object
   * Use this when you need access to metadata like usage stats, finish reason, etc.
   * Uses the chat API which is stateless when used without conversation history.
   *
   * @param prompt The prompt to send to the model
   * @returns The complete chat completion response from OpenRouter
   */
  async createRawResponse(prompt: string): Promise<unknown> {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
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
   * @returns An async iterable of stream chunks
   */
  async *createStreamingResponse(prompt: string): AsyncIterable<StreamChunk> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    this.logger.log('createStreamingResponse called', {
      modelUsed: this.model,
      requestId,
    });

    try {
      const stream = await this.client.chat.send({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      let accumulatedText = '';

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
      }

      // Final chunk
      const elapsedMs = Date.now() - startTime;
      this.logger.log(`Streaming completed in ${elapsedMs}ms`);

      yield {
        text: '',
        isComplete: true,
        accumulatedText,
      };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const context: LlmErrorContext = {
        clientType: 'openrouter',
        model: this.model,
        elapsedMs,
        timeoutMs: this.timeout,
        operation: 'createStreamingResponse',
        requestId,
        metadata: {
          promptSize: prompt.length,
        },
      };

      const wrappedError = wrapSdkError(error, context);
      this.logger.logError('Streaming failed', wrappedError, wrappedError.context);
      throw wrappedError;
    }
  }

  /**
   * Creates a structured response using OpenRouter with hybrid formatting approach
   * Similar to AnthropicClient, this uses OpenRouter for generation and optionally
   * OpenAI for structured output formatting when available.
   *
   * @param options Configuration options for the structured response
   * @param options.prompt The prompt to send to the model
   * @param options.schema The Zod schema to validate the response against
   * @param options.formatGuidance Optional guidance for formatting the response
   * @param options.reasoningEffort Normalized reasoning effort level ('low' | 'medium' | 'high')
   * @param options.maxAttempts Maximum number of retry attempts (default: 1, no retries)
   * @param options.logExecutionTime Whether to log execution time warnings (default: false)
   * @param options.responseInstructions Additional instructions to append to the prompt (deprecated, use formatGuidance)
   * @param options.useWebSearch Whether to enable web search for this request (default: false)
   * @param options.stream Whether to use streaming for the generation phase (default: true)
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
  }): Promise<z.infer<T>> {
    // Handle deprecated responseInstructions parameter
    const effectiveFormatGuidance =
      responseInstructions ?
        formatGuidance ? `${formatGuidance}\n\n${responseInstructions}`
        : responseInstructions
      : formatGuidance;

    const requestId = generateRequestId();
    let attempts = 0;
    let lastError: unknown;

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
          hasFormatter: !!this.formatterClient,
          stream,
          requestId,
        });

        // Build the full prompt with system instructions for completions API
        const systemInstructions =
          'You are an expert assistant. Respond with valid JSON data matching the provided schema. ' +
          (effectiveFormatGuidance ? `\n${effectiveFormatGuidance}` : '');

        const fullPrompt = `${systemInstructions}\n\nUser request: ${prompt}`;

        let contentString: string;

        if (stream) {
          // Step 1: Generate response using streaming for observability
          this.logger.log('Using streaming generation for observability');
          let accumulatedText = '';
          let lastLoggedLength = 0;

          for await (const chunk of this.createStreamingResponse(fullPrompt)) {
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
          // Non-streaming path
          // Note: We use createRawResponse to access usage stats for logging
          const response = await this.createRawResponse(fullPrompt);
          this.logger.logUsage((response as any).usage || {});
          contentString = this.extractContentFromResponse(response);
        }

        // Step 3: Format and validate the response
        let validatedContent: z.infer<T>;

        if (this.formatterClient) {
          // Use OpenAI formatter for structured output
          this.logger.log('Using OpenAI formatter for structured output');

          validatedContent = await this.formatterClient.createStructuredResponse({
            prompt: `Format the following content according to the schema:\n\n${contentString}`,
            schema,
            formatGuidance: effectiveFormatGuidance,
            maxAttempts: 1,
            stream: false, // Don't stream the formatting step, only the generation
          });
        } else {
          // Try to parse directly as JSON
          this.logger.log('Attempting direct JSON parsing');

          // Try to extract JSON from the response
          const jsonMatch = contentString.match(/```json\s*([\s\S]*?)\s*```/) || contentString.match(/\{[\s\S]*\}/);
          const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : contentString;

          const parsed = JSON.parse(jsonString);
          validatedContent = schema.parse(parsed);
        }

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
          timeoutMs: this.timeout,
          operation: 'createStructuredResponse',
          requestId,
          metadata: {
            promptSize: prompt.length,
            schemaComplexity: typeof schema,
            attempt: attempts,
            maxAttempts,
            hasFormatter: !!this.formatterClient,
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
