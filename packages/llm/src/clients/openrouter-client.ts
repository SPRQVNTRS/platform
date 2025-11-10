import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod/v3';
import type { LlmClientInterface } from '../types/client-interface';
import { DEFAULT_MODELS } from '../models';
import { OpenAIClient } from './openai-client';

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
  private debug: boolean;
  private formatterClient?: OpenAIClient;

  /**
   * Creates a new OpenRouterClient instance
   *
   * @param apiKey Your OpenRouter API key
   * @param model The model to use (e.g., 'openai/gpt-4', 'anthropic/claude-3-opus')
   * @param debug Whether to log debug information (default: false)
   * @param openaiApiKey Optional OpenAI API key for structured output formatting
   * @throws Error if the API key is not configured
   */
  constructor(apiKey: string, model?: string, debug?: boolean, openaiApiKey?: string) {
    this.client = new OpenRouter({
      apiKey,
      ...(debug && { debugLogger: console }),
    });
    this.model = model || 'openai/gpt-5-mini';
    this.debug = debug || false;

    // Initialize formatter client if OpenAI API key is provided
    if (openaiApiKey) {
      this.formatterClient = new OpenAIClient(openaiApiKey, DEFAULT_MODELS.STRUCTURED_FORMATTER.model, debug);
    } else if (this.debug || process.env.NODE_ENV === 'development') {
      console.warn(
        '[OpenRouterClient] No OpenAI API key provided. Structured responses will attempt direct JSON generation.',
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
  setFormatterClient(openaiApiKey: string): void {
    this.formatterClient = new OpenAIClient(openaiApiKey, DEFAULT_MODELS.STRUCTURED_FORMATTER.model, this.debug);
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
        formatGuidance ? `${formatGuidance}\n\n${responseInstructions}`
        : responseInstructions
      : formatGuidance;

    let attempts = 0;
    let lastError: unknown;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const startTime = logExecutionTime ? Date.now() : 0;

        if (this.debug || process.env.NODE_ENV === 'development') {
          console.log('[OpenRouterClient] createStructuredResponse called with:', {
            modelUsed: this.model,
            schemaType: typeof schema,
            schemaConstructor: schema?.constructor?.name,
            reasoningEffort,
            attempt: `${attempts}/${maxAttempts}`,
            hasFormatter: !!this.formatterClient,
          });
        }

        // Build the system message
        const systemMessage =
          'You are an expert assistant. Respond with valid JSON data matching the provided schema. ' +
          (effectiveFormatGuidance ? `\n${effectiveFormatGuidance}` : '');

        // Map reasoning effort to OpenRouter's reasoning parameter
        const reasoningConfig = this.mapReasoningEffort(reasoningEffort);

        // Step 1: Generate response from OpenRouter
        const response = await this.client.chat.send({
          model: this.model,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
          ],
          ...(reasoningConfig && { reasoning: reasoningConfig }),
          stream: false,
        });

        if (this.debug) {
          console.log('[OpenRouterClient] Response usage:', response.usage);
        }

        // Extract the content
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in OpenRouter response');
        }

        // Ensure content is a string
        const contentString = typeof content === 'string' ? content : JSON.stringify(content);

        // Step 2: Format and validate the response
        let validatedContent: z.infer<T>;

        if (this.formatterClient) {
          // Use OpenAI formatter for structured output
          if (this.debug) {
            console.log('[OpenRouterClient] Using OpenAI formatter for structured output');
          }

          validatedContent = await this.formatterClient.createStructuredResponse({
            prompt: `Format the following content according to the schema:\n\n${contentString}`,
            schema,
            formatGuidance: effectiveFormatGuidance,
            maxAttempts: 1,
          });
        } else {
          // Try to parse directly as JSON
          if (this.debug) {
            console.log('[OpenRouterClient] Attempting direct JSON parsing');
          }

          // Try to extract JSON from the response
          const jsonMatch = contentString.match(/```json\s*([\s\S]*?)\s*```/) || contentString.match(/\{[\s\S]*\}/);
          const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : contentString;

          const parsed = JSON.parse(jsonString);
          validatedContent = schema.parse(parsed);
        }

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
            console.error('[OpenRouterClient] createStructuredResponse error:', {
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
   * Maps normalized reasoning effort levels to OpenRouter's reasoning configuration
   *
   * @param effort The normalized effort level
   * @returns OpenRouter reasoning config or undefined if not applicable
   */
  private mapReasoningEffort(
    effort: 'low' | 'medium' | 'high',
  ): { effort: 'minimal' | 'low' | 'medium' | 'high' } | undefined {
    // Only apply reasoning for models that support it (like o1 models)
    if (this.model.includes('o1') || this.model.includes('reasoning')) {
      const effortMap: Record<string, 'minimal' | 'low' | 'medium' | 'high'> = {
        low: 'minimal',
        medium: 'medium',
        high: 'high',
      };
      return { effort: effortMap[effort] || 'low' };
    }
    return undefined;
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
