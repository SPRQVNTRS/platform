import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod/v3';
import type { LlmClientInterface } from '../types/client-interface';
import { DEFAULT_MODELS, WEB_SEARCH_TOOLS } from '../models';

/**
 * Client for interacting with OpenAI's API with enhanced functionality
 * for structured responses, batch processing, and embeddings.
 * Implements the unified LlmClientInterface.
 */
export class OpenAIClient implements LlmClientInterface {
  private openai: OpenAI;
  private model: string;
  private debug: boolean;

  /**
   * Creates a new OpenAIClient instance
   *
   * @param openApiKey Your OpenAI API key
   * @param model The model to use (default: DEFAULT_MODELS.OPENAI_DEFAULT.model)
   * @param debug Whether to log debug information (default: false)
   * @throws Error if the API key is not configured
   */
  constructor(openApiKey: string, model?: OpenAI.AllModels, debug?: boolean) {
    this.openai = new OpenAI({
      apiKey: openApiKey,
      timeout: 240000, // 240 seconds (4 minutes) timeout for all requests
      maxRetries: 2, // Retry failed requests up to 2 times
    });
    this.model = model || DEFAULT_MODELS.OPENAI_DEFAULT.model;
    this.debug = debug || false;

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
   * Creates a response with the specified prompt
   *
   * @param prompt The prompt to send to the model
   * @returns The raw response from OpenAI
   */
  async createResponse(prompt: string): Promise<OpenAI.Chat.ChatCompletion> {
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
    };
    const completion = await this.openai.chat.completions.create(params);
    return completion;
  }

  /**
   * Creates a response with a prediction to guide the model's response
   *
   * @param prompt The prompt to send to the model
   * @param prediction The prediction content to guide the model's response
   * @returns The raw response from OpenAI
   */
  async createResponseWithPrediction(
    prompt: string,
    prediction: OpenAI.Chat.ChatCompletionPredictionContent,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
      prediction,
    };
    const completion = await this.openai.chat.completions.create(params);
    return completion;
  }

  /**
   * Extracts the text content from a response
   *
   * @param completion The response from OpenAI
   * @returns The text content of the response
   * @throws Error if there is no content in the response
   */
  extractResponseText(completion: OpenAI.Chat.ChatCompletion): string {
    const message = completion.choices[0]?.message.content;
    if (!message) {
      throw new Error('No response content');
    }
    return message;
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
    useWebSearch = false,
  }: {
    prompt: string;
    schema: T;
    formatGuidance?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    maxAttempts?: number;
    logExecutionTime?: boolean;
    responseInstructions?: string;
    useWebSearch?: boolean;
  }): Promise<z.infer<T>> {
    // Handle deprecated responseInstructions parameter
    const effectiveFormatGuidance =
      responseInstructions ?
        (formatGuidance ? `${formatGuidance}\n\n${responseInstructions}` : responseInstructions)
      : formatGuidance;

    let attempts = 0;
    let lastError: unknown;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const startTime = logExecutionTime ? Date.now() : 0;

        if (this.debug || process.env.NODE_ENV === 'development') {
          console.log('[OpenAIClient] createStructuredResponse called with:', {
            modelUsed: this.model,
            schemaType: typeof schema,
            schemaConstructor: schema?.constructor?.name,
            reasoningEffort,
            attempt: `${attempts}/${maxAttempts}`,
          });
        }

        // Create text format using zodTextFormat
        const textFormat = zodTextFormat(schema, 'structuredResponse');

        // Build tools array if web search is enabled
        const tools = useWebSearch ? [WEB_SEARCH_TOOLS.OPENAI] : undefined;

        // Use the responses.parse API
        const response = await this.openai.responses.parse({
          model: this.model,
          reasoning: { effort: reasoningEffort },
          input: [
            {
              role: 'system',
              content:
                'You are an expert assistant. Respond with valid data matching the provided schema. ' +
                (effectiveFormatGuidance ? `\n${effectiveFormatGuidance}` : ''),
            },
            { role: 'user', content: prompt },
          ],
          text: {
            format: textFormat,
          },
          ...(tools && { tools }), // Only include tools if web search is enabled
        });

        if (this.debug) {
          console.log('[OpenAIClient] Response usage:', response.usage);
        }

        // Get the parsed output
        const parsedOutput = response.output_parsed;

        if (!parsedOutput) {
          throw new Error('No parsed output in response');
        }

        // Validate with the schema (for extra safety)
        const validatedContent = schema.parse(parsedOutput);

        // Log execution time if it's too long
        if (logExecutionTime) {
          const executionTime = Date.now() - startTime;
          if (executionTime > 20000) {
            console.log(`Long execution time for LLM completion: ${executionTime}ms`);
          }
        }

        return validatedContent;
      } catch (error) {
        lastError = error;

        if (this.debug) {
          console.log(`Failed attempt ${attempts}/${maxAttempts}, retrying...`);
          console.log(error);
        }

        if (attempts === maxAttempts) {
          if (this.debug || process.env.NODE_ENV === 'development') {
            console.error('[OpenAIClient] createStructuredResponse error:', {
              error: error instanceof Error ? error.message : String(error),
              errorName: error instanceof Error ? error.constructor.name : typeof error,
              errorStack: error instanceof Error ? error.stack : undefined,
            });
          }

          if (error instanceof Error) {
            throw error;
          } else {
            throw new Error(`Failed to create structured response: ${String(error)}`);
          }
        }
      }
    }

    throw lastError || new Error('Failed to get structured response from LLM');
  }

  /**
   * Process a batch of items with an LLM using parallel processing
   *
   * @param items The items to process
   * @param processFn The function to process each batch
   * @param batchSize The size of each batch (default: 5)
   * @returns The processed results
   */
  async processBatchWithLLM<T, R>(
    items: T[],
    processFn: (batch: T[]) => Promise<R[]>,
    batchSize: number = 5,
  ): Promise<R[]> {
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
