import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod/v3';
import type { LlmClientInterface, BaseLlmClientConfig } from '../types/client-interface';
import { DEFAULT_MODELS } from '../models';
import { OpenAIClient } from './openai-client';
import { DebugLogger } from '../utils/debug';

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

  /**
   * Creates a new OpenRouterClient instance
   *
   * @param config Configuration options
   * @throws Error if the API key is not configured
   */
  constructor(config: OpenRouterClientConfig) {
    this.client = new OpenRouter({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'google/gemini-2.5-flash-lite-preview-09-2025';
    this.logger = new DebugLogger('OpenRouterClient', { enabled: config.debug });

    // Initialize formatter client if OpenAI API key is provided
    if (config.openaiApiKey) {
      this.formatterClient = new OpenAIClient({
        apiKey: config.openaiApiKey,
        model: DEFAULT_MODELS.STRUCTURED_FORMATTER.model,
        debug: config.debug,
      });
    } else {
      this.logger.log('⚠️  No OpenAI API key provided. Structured responses will attempt direct JSON generation.');
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
   * Creates a raw response from OpenRouter's API without structured output
   *
   * @param prompt The prompt to send to the model
   * @returns The raw chat completion response from OpenRouter
   */
  async createResponse(prompt: string): Promise<unknown> {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });
    return response;
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
        const startTime = Date.now();

        this.logger.log('createStructuredResponse called', {
          modelUsed: this.model,
          schemaType: typeof schema,
          schemaConstructor: schema?.constructor?.name,
          reasoningEffort,
          attempt: `${attempts}/${maxAttempts}`,
          hasFormatter: !!this.formatterClient,
        });

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

        this.logger.logUsage(response.usage || {});

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
          this.logger.log('Using OpenAI formatter for structured output');

          validatedContent = await this.formatterClient.createStructuredResponse({
            prompt: `Format the following content according to the schema:\n\n${contentString}`,
            schema,
            formatGuidance: effectiveFormatGuidance,
            maxAttempts: 1,
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
        if (logExecutionTime || this.logger.isEnabled()) {
          const executionTime = Date.now() - startTime;
          this.logger.logExecutionTime('createStructuredResponse', executionTime);
        }

        return validatedContent;
      } catch (error) {
        lastError = error;

        this.logger.log(`Failed attempt ${attempts}/${maxAttempts}`, {
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempts === maxAttempts) {
          this.logger.log('createStructuredResponse error', {
            error: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.constructor.name : typeof error,
            errorStack: error instanceof Error ? error.stack : undefined,
          });

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
