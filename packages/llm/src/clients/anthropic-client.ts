import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import type {
  LlmClientInterface,
  BaseLlmClientConfig,
  StreamChunk,
  LlmTokenUsage,
  ReasoningEffortLevel,
} from '../types/client-interface';
import { DEFAULT_MODELS, ANTHROPIC_MAX_TOKENS, WEB_SEARCH_TOOLS, DEFAULT_SYSTEM_PROMPT } from '../models';
import { calculateUsageCost } from '../pricing';
import { OpenAIClient } from './openai-client';
import type { AnthropicModel } from '../model-types';
import { DebugLogger } from '../utils/debug';
import {
  generateRequestId,
  wrapSdkError,
  isRetryableError,
  type LlmErrorContext,
} from '../utils/errors';

export interface AnthropicClientConfig extends Omit<BaseLlmClientConfig, 'model'> {
  /**
   * The Anthropic model to use
   */
  model: AnthropicModel;

  /**
   * Optional OpenAI API key for structured formatting (auto-detected from env if not provided)
   */
  openaiApiKey?: string;
}

/**
 * Client for interacting with Anthropic's API.
 * Implements the unified LlmClientInterface.
 * Uses OpenAI for structured output formatting when needed.
 */
export class AnthropicClient implements LlmClientInterface {
  private client: Anthropic;
  private model: AnthropicModel;
  private formatterClient?: OpenAIClient;
  private logger: DebugLogger;
  private timeout: number;
  private maxRetries: number;
  private _lastUsage: LlmTokenUsage | null = null;

  get lastUsage(): LlmTokenUsage | null {
    return this._lastUsage;
  }

  /**
   * Creates a new AnthropicClient instance
   *
   * @param config Configuration options
   * @throws Error if the Anthropic API key is not configured
   */
  constructor(config: AnthropicClientConfig) {
    // Use config timeout or default to 120 seconds (2 minutes)
    this.timeout = config.timeout ?? 120000;
    this.maxRetries = config.maxRetries ?? 2;

    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    });
    this.model = config.model;
    this.logger = new DebugLogger('AnthropicClient', { enabled: config.debug });

    // Auto-detect OpenAI API key from environment if not explicitly provided
    const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;

    // Initialize OpenAI formatter if API key is available
    if (openaiKey) {
      this.formatterClient = new OpenAIClient({
        apiKey: openaiKey,
        model: DEFAULT_MODELS.STRUCTURED_FORMATTER.model,
        debug: config.debug,
        timeout: this.timeout,
        maxRetries: this.maxRetries,
      });
    }

    // Validate configuration on instantiation
    this.validateConfiguration();
  }

  /**
   * Set the OpenAI formatter client for structured output
   *
   * @param openaiApiKey OpenAI API key
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
    if (!this.client.apiKey) {
      throw new Error('Anthropic API key is not configured');
    }

    // Warn if OpenAI formatter is not available (but don't throw - fallback exists)
    if (!this.formatterClient) {
      this.logger.log(
        '⚠️  OpenAI API key not found. Anthropic will attempt direct JSON generation (less reliable). ' +
          'Set OPENAI_API_KEY environment variable for better structured output.',
      );
    }

    return true;
  }

  /**
   * Creates a response from Anthropic's API and returns the text content
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
   * Creates a raw response from Anthropic's API and returns the full response object
   * Use this when you need access to metadata like usage stats, finish reason, etc.
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The raw message response from Anthropic
   */
  async createRawResponse(prompt: string, options?: { timeout?: number }): Promise<unknown> {
    const effectiveTimeout = options?.timeout ?? this.timeout;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new Anthropic({
          apiKey: this.client.apiKey,
          timeout: effectiveTimeout,
          maxRetries: this.maxRetries,
        })
      : this.client;

    const response = await client.messages.create({
      model: this.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    return response;
  }

  /**
   * Extracts text content from a raw Anthropic response object
   * Anthropic's messages API returns responses with content blocks
   *
   * @param response The raw response from Anthropic
   * @returns The text content as a string
   * @throws Error if there is no content in the response
   */
  private extractContentFromResponse(response: unknown): string {
    const typedResponse = response as Anthropic.Message;
    const textBlock = typedResponse.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Anthropic response');
    }
    return textBlock.text;
  }

  /**
   * Get the underlying Anthropic SDK client
   * This allows access to all native Anthropic SDK methods
   */
  get sdk(): Anthropic {
    return this.client;
  }

  /**
   * Get the model being used
   */
  get currentModel(): string {
    return this.model;
  }

  /**
   * Creates a streaming response from Anthropic's API
   * Returns an async iterator that yields chunks of text as they arrive
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns An async iterable of stream chunks
   */
  async *createStreamingResponse(prompt: string, options?: { timeout?: number }): AsyncIterable<StreamChunk> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const effectiveTimeout = options?.timeout ?? this.timeout;

    this.logger.log('createStreamingResponse called', {
      modelUsed: this.model,
      requestId,
      timeout: effectiveTimeout,
    });

    try {
      // Create a client with the effective timeout if different from instance timeout
      const client = effectiveTimeout !== this.timeout
        ? new Anthropic({
            apiKey: this.client.apiKey,
            timeout: effectiveTimeout,
            maxRetries: this.maxRetries,
          })
        : this.client;

      const stream = client.messages.stream({
        model: this.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: DEFAULT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      let accumulatedText = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text;
          accumulatedText += text;

          yield {
            text,
            isComplete: false,
            accumulatedText,
          };
        }
      }

      // Get final message with usage data
      const finalMessage = await stream.finalMessage();
      let usage: StreamChunk['usage'] | undefined;

      if (finalMessage.usage) {
        usage = {
          promptTokens: finalMessage.usage.input_tokens,
          completionTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        };
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
        clientType: 'anthropic',
        model: this.model,
        elapsedMs,
        timeoutMs: effectiveTimeout,
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
   * Transforms reasoning effort level into Anthropic's thinking mode configuration
   *
   * @param reasoningEffort The normalized reasoning effort level
   * @returns Thinking mode object with appropriate budget_tokens, or undefined if not needed
   *
   * Budget guidelines based on Anthropic's documentation:
   * - none: extended thinking disabled (no thinking block sent)
   * - low: 1,024 tokens (minimum threshold for basic reasoning)
   * - medium: 8,192 tokens (moderate complexity tasks)
   * - high: 16,384 tokens (complex tasks requiring comprehensive reasoning)
   *
   * @see https://docs.claude.com/en/docs/build-with-claude/extended-thinking
   */
  private getThinkingConfig(
    reasoningEffort?: ReasoningEffortLevel,
  ): { type: 'enabled'; budget_tokens: number } | undefined {
    // Anthropic has no "off" switch — extended thinking is opt-in, so both an
    // omitted effort and an explicit 'none' mean "send no thinking block".
    if (!reasoningEffort || reasoningEffort === 'none') {
      return undefined;
    }

    const budgetMap = {
      low: 1024, // Minimum budget for basic reasoning
      medium: 8192, // Moderate complexity tasks
      high: 16384, // Complex tasks with comprehensive reasoning
    };

    return {
      type: 'enabled',
      budget_tokens: budgetMap[reasoningEffort],
    };
  }

  /**
   * Creates a structured response using Anthropic for generation and OpenAI for formatting
   *
   * Since Anthropic doesn't support structured outputs, this method:
   * 1. Generates content with Anthropic (with optional extended thinking)
   * 2. Passes it to OpenAI's createStructuredResponse for formatting and validation
   *
   * @param options Configuration options
   * @param options.prompt The prompt to send to the model
   * @param options.schema The Zod schema to validate the response against
   * @param options.formatGuidance Optional guidance for formatting the response
   * @param options.reasoningEffort Normalized reasoning effort level ('none' | 'low' | 'medium' | 'high') -
   *   'low' | 'medium' | 'high' enable extended thinking mode; 'none' (or omitted) leaves it off
   * @param options.maxAttempts Maximum number of retry attempts (default: 1, no retries)
   * @param options.logExecutionTime Whether to log execution time warnings (default: false)
   * @param options.responseInstructions Additional instructions to append to the prompt (deprecated, use formatGuidance)
   * @param options.useWebSearch Whether to enable web search for this request (default: false)
   * @param options.stream Whether to use streaming for the generation phase (default: true)
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The structured and validated response according to the provided schema
   * @throws Error if no OpenAI formatter is configured
   */
  async createStructuredResponse<T extends z.ZodType>({
    prompt,
    schema,
    formatGuidance,
    reasoningEffort,
    maxAttempts = 3,
    logExecutionTime = false,
    responseInstructions,
    useWebSearch = false,
    stream = true,
    timeout,
  }: {
    prompt: string;
    schema: T;
    formatGuidance?: string;
    reasoningEffort?: ReasoningEffortLevel;
    maxAttempts?: number;
    logExecutionTime?: boolean;
    responseInstructions?: string;
    useWebSearch?: boolean;
    stream?: boolean;
    timeout?: number;
  }): Promise<z.infer<T>> {
    if (!this.formatterClient) {
      throw new Error(
        'OpenAI formatter not configured. Anthropic does not support structured outputs natively. ' +
          'Please provide an OpenAI API key when creating the AnthropicClient, or set OPENAI_API_KEY environment variable.',
      );
    }

    // Handle deprecated responseInstructions parameter
    const effectiveFormatGuidance =
      responseInstructions ?
        formatGuidance ? `${formatGuidance}\n\n${responseInstructions}`
        : responseInstructions
      : formatGuidance;

    const effectiveTimeout = timeout ?? this.timeout;
    this._lastUsage = null;
    const requestId = generateRequestId();
    let attempts = 0;
    let lastError: unknown;

    // Build tools array if web search is enabled
    const tools = useWebSearch ? [WEB_SEARCH_TOOLS.ANTHROPIC] : undefined;

    // Get thinking configuration based on reasoning effort
    const thinking = this.getThinkingConfig(reasoningEffort);

    // Calculate max_tokens: must be greater than thinking budget
    // If thinking is enabled, we need max_tokens > budget_tokens
    // Otherwise, use the default ANTHROPIC_MAX_TOKENS
    const maxTokens = thinking ? Math.max(ANTHROPIC_MAX_TOKENS, thinking.budget_tokens + 4096) : ANTHROPIC_MAX_TOKENS;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new Anthropic({
          apiKey: this.client.apiKey,
          timeout: effectiveTimeout,
          maxRetries: this.maxRetries,
        })
      : this.client;

    while (attempts < maxAttempts) {
      attempts++;
      const startTime = Date.now();

      try {
        this.logger.log('createStructuredResponse called', {
          modelUsed: this.model,
          reasoningEffort,
          stream,
          attempt: `${attempts}/${maxAttempts}`,
          requestId,
          timeout: effectiveTimeout,
        });

        let textContent: string;

        if (stream) {
          // Step 1: Generate content with Anthropic using streaming for observability
          this.logger.log('Using streaming generation for observability');
          let accumulatedText = '';
          let lastLoggedLength = 0;

          const messageStream = client.messages.stream({
            model: this.model,
            max_tokens: maxTokens,
            system: DEFAULT_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            ...(tools && { tools }),
            ...(thinking && { thinking }),
          });

          for await (const chunk of messageStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const text = chunk.delta.text;
              accumulatedText += text;

              // Log progress every 100 characters for observability
              if (accumulatedText.length - lastLoggedLength >= 100) {
                this.logger.log(`Streaming progress: ${accumulatedText.length} chars`);
                lastLoggedLength = accumulatedText.length;
              }
            }
          }

          this.logger.log(`Streaming completed, total: ${accumulatedText.length} chars`);
          textContent = accumulatedText;

          // Capture usage from the stream's final message
          const finalMessage = await messageStream.finalMessage();
          if (finalMessage.usage) {
            const promptTokens = finalMessage.usage.input_tokens ?? 0;
            const completionTokens = finalMessage.usage.output_tokens ?? 0;
            const cachedTokens: number | undefined = (finalMessage.usage as any).cache_read_input_tokens ?? undefined;
            this._lastUsage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
              cachedTokens,
              model: this.model,
              cost: calculateUsageCost(this.model, promptTokens, completionTokens, cachedTokens),
            };
          }
        } else {
          // Non-streaming path
          const anthropicResponse = await client.messages.create({
            model: this.model,
            max_tokens: maxTokens,
            system: DEFAULT_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            ...(tools && { tools }),
            ...(thinking && { thinking }),
          });

          // Extract text content - when thinking mode is enabled, response may have multiple content blocks
          // Find the text block (skip thinking blocks)
          const textBlock = anthropicResponse.content.find((block) => block.type === 'text');
          if (!textBlock || textBlock.type !== 'text') {
            // Log the actual response structure for debugging
            this.logger.logError('Unexpected response structure', undefined, {
              contentBlocks: anthropicResponse.content.map((block) => ({ type: block.type })),
            });
            throw new Error('Expected text response from Anthropic');
          }

          textContent = textBlock.text;

          // Capture usage from the non-streaming response
          if (anthropicResponse.usage) {
            const promptTokens = anthropicResponse.usage.input_tokens ?? 0;
            const completionTokens = anthropicResponse.usage.output_tokens ?? 0;
            const cachedTokens: number | undefined = (anthropicResponse.usage as any).cache_read_input_tokens ?? undefined;
            this._lastUsage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
              cachedTokens,
              model: this.model,
              cost: calculateUsageCost(this.model, promptTokens, completionTokens, cachedTokens),
            };
          }
        }

        this.logger.logResponsePreview(textContent);

        // Step 2: Use OpenAI to format the response into the required schema
        const formattedResponse = await this.formatterClient.createStructuredResponse({
          prompt: textContent,
          schema,
          formatGuidance: effectiveFormatGuidance,
          reasoningEffort: 'low', // Formatting doesn't need high reasoning
          maxAttempts, // Pass through retry logic to formatter
          logExecutionTime: false, // We'll log our own execution time
          stream: false, // Don't stream the formatting step, only the generation
        });

        // Log execution time
        const executionTime = Date.now() - startTime;
        if (logExecutionTime || this.logger.isEnabled()) {
          this.logger.logExecutionTime('createStructuredResponse', executionTime);
        }

        return formattedResponse;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - startTime;

        const context: LlmErrorContext = {
          clientType: 'anthropic',
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
            reasoningEffort,
          },
        };

        const wrappedError = wrapSdkError(error, context);
        const retryable = isRetryableError(wrappedError);

        this.logger.log(`Failed attempt ${attempts}/${maxAttempts}`, {
          error: wrappedError.message,
          errorType: wrappedError.name,
          retryable,
          elapsedMs,
          ...(wrappedError.context.metadata?.errorCode && { errorCode: wrappedError.context.metadata.errorCode }),
          ...(wrappedError.context.metadata?.providerRequestId && { providerRequestId: wrappedError.context.metadata.providerRequestId }),
        });

        if (!retryable || attempts === maxAttempts) {
          this.logger.logError(
            `createStructuredResponse failed${retryable ? ' after all attempts' : ' (non-retryable)'}`,
            wrappedError,
            wrappedError.context,
          );
          throw wrappedError;
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
   * Process a batch of items with parallel processing
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
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results = await Promise.all(batches.map(processFn));
    return results.flat();
  }

  /**
   * Generates an embedding vector for the provided text
   * Note: Anthropic doesn't provide embeddings API yet
   * This would need to be implemented using a different service
   */
  async generateEmbedding(_value: string): Promise<number[]> {
    throw new Error('Anthropic does not support embeddings. Use OpenAI for embeddings.');
  }
}
