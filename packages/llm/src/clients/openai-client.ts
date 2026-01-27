import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod/v3';
import type { LlmClientInterface, BaseLlmClientConfig, StreamChunk } from '../types/client-interface';
import { DEFAULT_MODELS, WEB_SEARCH_TOOLS, DEFAULT_SYSTEM_PROMPT } from '../models';
import { DebugLogger } from '../utils/debug';
import {
  generateRequestId,
  wrapSdkError,
  type LlmErrorContext,
} from '../utils/errors';

export interface OpenAIClientConfig extends Omit<BaseLlmClientConfig, 'model'> {
  /**
   * The model to use (default: DEFAULT_MODELS.OPENAI_DEFAULT.model)
   */
  model?: OpenAI.AllModels;
}

/**
 * Client for interacting with OpenAI's API with enhanced functionality
 * for structured responses, batch processing, and embeddings.
 * Implements the unified LlmClientInterface.
 */
export class OpenAIClient implements LlmClientInterface {
  private openai: OpenAI;
  private model: string;
  private logger: DebugLogger;
  private timeout: number;
  private maxRetries: number;

  /**
   * Creates a new OpenAIClient instance
   *
   * @param config Configuration options
   * @throws Error if the API key is not configured
   */
  constructor(config: OpenAIClientConfig) {
    // Use config timeout or default to 120 seconds (2 minutes)
    this.timeout = config.timeout ?? 120000;
    this.maxRetries = config.maxRetries ?? 2;

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    });
    this.model = config.model || DEFAULT_MODELS.OPENAI_DEFAULT.model;
    this.logger = new DebugLogger('OpenAIClient', { enabled: config.debug });

    // Validate configuration on instantiation
    this.validateConfiguration();
  }

  /**
   * Validates that the client is properly configured
   * @returns true if valid, throws an error with details if not
   */
  validateConfiguration(): boolean {
    if (!this.openai.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    return true;
  }

  /**
   * Creates a response from OpenAI's API and returns the text content
   * Uses the responses API which is stateless
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
   * Creates a raw response from OpenAI's API and returns the full response object
   * Use this when you need access to metadata like usage stats, finish reason, etc.
   *
   * @param prompt The prompt to send to the model
   * @param options Optional configuration
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The raw response from OpenAI
   */
  async createRawResponse(prompt: string, options?: { timeout?: number }): Promise<unknown> {
    const effectiveTimeout = options?.timeout ?? this.timeout;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new OpenAI({
          apiKey: this.openai.apiKey,
          timeout: effectiveTimeout,
          maxRetries: this.maxRetries,
        })
      : this.openai;

    const response = await client.responses.create({
      input: prompt,
      model: this.model,
    });
    return response;
  }

  /**
   * Extracts text content from a raw OpenAI response object
   * OpenAI's responses API returns responses with an 'output_text' field
   *
   * @param response The raw response from OpenAI
   * @returns The text content as a string
   * @throws Error if there is no content in the response
   */
  private extractContentFromResponse(response: unknown): string {
    const typedResponse = response as OpenAI.Responses.Response;
    const text = typedResponse.output_text;
    if (!text) {
      throw new Error('No response content');
    }
    return text;
  }

  /**
   * Creates a response with a prediction to guide the model's response
   *
   * Note: The responses API does not support predictions. This method will log a warning
   * and fall back to the standard createResponse method.
   *
   * @param prompt The prompt to send to the model
   * @param prediction The prediction content to guide the model's response (not used with responses API)
   * @returns The text content as a string
   * @deprecated Predictions are not supported by the responses API. Use createResponse instead.
   */
  async createResponseWithPrediction(
    prompt: string,
    prediction: OpenAI.Chat.ChatCompletionPredictionContent,
  ): Promise<string> {
    this.logger.log('Warning: Predictions are not supported by the responses API. Ignoring prediction parameter.', {
      predictionProvided: !!prediction,
    });
    return this.createResponse(prompt);
  }

  /**
   * Creates a streaming response from OpenAI's API
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
        ? new OpenAI({
            apiKey: this.openai.apiKey,
            timeout: effectiveTimeout,
            maxRetries: this.maxRetries,
          })
        : this.openai;

      const stream = client.responses.stream({
        model: this.model,
        input: prompt,
      });

      let accumulatedText = '';
      let usage: StreamChunk['usage'] | undefined;

      for await (const chunk of stream) {
        // Handle text delta events
        if (chunk.type === 'response.output_text.delta' && 'delta' in chunk) {
          const text = (chunk as any).delta;
          if (text) {
            accumulatedText += text;

            yield {
              text,
              isComplete: false,
              accumulatedText,
            };
          }
        }

        // Capture usage from response.completed event
        if (chunk.type === 'response.completed' && 'response' in chunk) {
          const response = (chunk as any).response;
          if (response?.usage) {
            usage = {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            };
          }
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
        clientType: 'openai',
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
   * Creates a structured response using OpenAI's structured outputs API with Zod schema validation
   * Includes built-in retry logic, execution time tracking, and error handling
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
   * @param options.timeout Request timeout in milliseconds (overrides client default)
   * @returns The structured and validated response according to the provided schema
   * @throws Error if the response cannot be parsed or if the model refuses to respond
   */
  async createStructuredResponse<T extends z.ZodType>({
    prompt,
    schema,
    formatGuidance,
    reasoningEffort,
    maxAttempts = 1,
    logExecutionTime = false,
    responseInstructions,
    useWebSearch = false,
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
        (formatGuidance ? `${formatGuidance}\n\n${responseInstructions}` : responseInstructions)
      : formatGuidance;

    const effectiveTimeout = timeout ?? this.timeout;
    const requestId = generateRequestId();
    let attempts = 0;
    let lastError: unknown;

    // Create a client with the effective timeout if different from instance timeout
    const client = effectiveTimeout !== this.timeout
      ? new OpenAI({
          apiKey: this.openai.apiKey,
          timeout: effectiveTimeout,
          maxRetries: this.maxRetries,
        })
      : this.openai;

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
          stream,
          requestId,
          timeout: effectiveTimeout,
        });

        // Create text format using zodTextFormat
        const textFormat = zodTextFormat(schema, 'structuredResponse');

        // Build tools array if web search is enabled
        const tools = useWebSearch ? [WEB_SEARCH_TOOLS.OPENAI] : undefined;

        let parsedOutput: any;

        if (stream) {
          // Use streaming for better observability - accumulate the response then parse
          this.logger.log('Using streaming generation for observability');
          let accumulatedText = '';
          let lastLoggedLength = 0;

          // Stream the response with structured output format
          const streamResponse = client.responses.stream({
            model: this.model,
            ...(reasoningEffort && { reasoning: { effort: reasoningEffort } }),
            instructions:
              DEFAULT_SYSTEM_PROMPT +
              '\n\nRespond with valid data matching the provided schema.' +
              (effectiveFormatGuidance ? `\n\n${effectiveFormatGuidance}` : ''),
            input: prompt,
            text: {
              format: textFormat,
            },
            ...(tools && { tools }),
          });

          for await (const chunk of streamResponse) {
            if (chunk.type === 'response.output_text.delta' && 'delta' in chunk) {
              const text = (chunk as any).delta;
              if (text) {
                accumulatedText += text;

                // Log progress every 100 characters for observability
                if (accumulatedText.length - lastLoggedLength >= 100) {
                  this.logger.log(`Streaming progress: ${accumulatedText.length} chars`);
                  lastLoggedLength = accumulatedText.length;
                }
              }
            }
          }

          this.logger.log(`Streaming completed, total: ${accumulatedText.length} chars, parsing...`);

          // Parse the accumulated JSON response
          try {
            parsedOutput = JSON.parse(accumulatedText);
          } catch (parseError) {
            throw new Error(`Failed to parse streamed response as JSON: ${parseError}`);
          }
        } else {
          // Non-streaming path using responses.parse API
          const response = await client.responses.parse({
            model: this.model,
            ...(reasoningEffort && { reasoning: { effort: reasoningEffort } }),
            instructions:
              DEFAULT_SYSTEM_PROMPT +
              '\n\nRespond with valid data matching the provided schema.' +
              (effectiveFormatGuidance ? `\n\n${effectiveFormatGuidance}` : ''),
            input: prompt,
            text: {
              format: textFormat,
            },
            ...(tools && { tools }),
          });

          this.logger.logUsage(response.usage || {});
          parsedOutput = response.output_parsed;

          if (!parsedOutput) {
            throw new Error('No parsed output in response');
          }
        }

        // Validate with the schema (for extra safety)
        const validatedContent = schema.parse(parsedOutput);

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
          clientType: 'openai',
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
   * @param value The text to generate an embedding for
   * @returns An array of numbers representing the embedding vector
   */
  async generateEmbedding(value: string): Promise<number[]> {
    const input = value.replaceAll('\n', ' ');
    const { data } = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input,
    });
    const embedding = data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }
    return embedding;
  }
}
