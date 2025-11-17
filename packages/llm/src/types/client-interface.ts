import { z } from 'zod/v3';

/**
 * Base configuration for all LLM clients
 */
export interface BaseLlmClientConfig {
  /**
   * API key for the provider
   */
  apiKey: string;

  /**
   * The model to use
   */
  model: string;

  /**
   * Debug logging configuration
   * - If true: always log debug messages
   * - If false: never log debug messages
   * - If undefined: auto-detect based on NODE_ENV (enabled in development)
   */
  debug?: boolean;

  /**
   * Request timeout in milliseconds
   * - Default: 120000 (120 seconds / 2 minutes)
   * - Maximum recommended: 600000 (10 minutes)
   * - Set to 0 to disable timeout (not recommended)
   */
  timeout?: number;

  /**
   * Maximum number of retries for failed requests
   * - Default: 2
   * - Set to 0 to disable retries
   */
  maxRetries?: number;
}

/**
 * Options for batch processing
 */
export interface BatchProcessOptions<T, R> {
  /**
   * The items to process
   */
  items: T[];

  /**
   * The function to process each batch
   */
  processFn: (batch: T[]) => Promise<R[]>;

  /**
   * The size of each batch (default: 5)
   */
  batchSize?: number;
}

/**
 * Streaming chunk from an LLM response
 */
export interface StreamChunk {
  /**
   * The text content of this chunk
   */
  text: string;

  /**
   * Whether this is the final chunk
   */
  isComplete: boolean;

  /**
   * Accumulated text so far (including this chunk)
   */
  accumulatedText?: string;

  /**
   * Optional usage information (only present in final chunk for some providers)
   */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Unified interface that all LLM clients must implement
 * This ensures consistent API across different providers
 */
export interface LlmClientInterface {
  /**
   * Validates that the client is properly configured
   * @returns true if valid, throws an error with details if not
   */
  validateConfiguration(): boolean;

  /**
   * Creates a raw response from the provider's API and returns the text content
   * This is a simple, stateless method that extracts text automatically
   *
   * @param prompt The prompt to send to the model
   * @returns The text content as a string
   */
  createResponse(prompt: string): Promise<string>;

  /**
   * Creates a raw response from the provider's API and returns the full response object
   * Use this when you need access to metadata like usage stats, finish reason, etc.
   *
   * @param prompt The prompt to send to the model
   * @returns The raw response object from the provider
   */
  createRawResponse(prompt: string): Promise<unknown>;

  /**
   * Creates a streaming response from the provider's API
   * Returns an async iterator that yields chunks of text as they arrive
   *
   * @param prompt The prompt to send to the model
   * @returns An async iterable of stream chunks
   */
  createStreamingResponse(prompt: string): AsyncIterable<StreamChunk>;

  /**
   * Creates a structured response using the provider's API with Zod schema validation
   * Includes built-in retry logic, execution time tracking, and error handling
   *
   * @param options.prompt The prompt to send to the model
   * @param options.schema The Zod schema to validate the response against
   * @param options.formatGuidance Optional guidance for formatting the response
   * @param options.reasoningEffort Normalized reasoning effort level ('low' | 'medium' | 'high')
   * @param options.maxAttempts Maximum number of retry attempts (default: 1, no retries)
   * @param options.logExecutionTime Whether to log execution time warnings (default: false)
   * @param options.responseInstructions Additional instructions to append to the prompt (deprecated, use formatGuidance)
   * @param options.useWebSearch Whether to enable web search for this request (default: false)
   * @param options.stream Whether to use streaming for the generation phase (default: false)
   */
  createStructuredResponse<T extends z.ZodType>(options: {
    prompt: string;
    schema: T;
    formatGuidance?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    maxAttempts?: number;
    logExecutionTime?: boolean;
    responseInstructions?: string;
    useWebSearch?: boolean;
    stream?: boolean;
  }): Promise<z.infer<T>>;

  /**
   * Process a batch of items with parallel processing
   */
  processBatchWithLLM<T, R>(options: BatchProcessOptions<T, R>): Promise<R[]>;

  /**
   * Generates an embedding vector for the provided text
   */
  generateEmbedding(value: string): Promise<number[]>;
}
