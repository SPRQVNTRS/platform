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
   * Creates a raw response from the provider's API without structured output
   * Returns the raw completion object from the provider
   *
   * @param prompt The prompt to send to the model
   * @returns The raw response from the provider
   */
  createResponse(prompt: string): Promise<unknown>;

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
