import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v3';
import type { LlmClientInterface } from '../types/client-interface';
import { DEFAULT_MODELS, ANTHROPIC_MAX_TOKENS, WEB_SEARCH_TOOLS } from '../models';
import { OpenAIClient } from './openai-client';
import { AnthropicModel } from '../model-types';

/**
 * Client for interacting with Anthropic's API.
 * Implements the unified LlmClientInterface.
 * Uses OpenAI for structured output formatting when needed.
 */
export class AnthropicClient implements LlmClientInterface {
  private client: Anthropic;
  private model: AnthropicModel;
  private formatterClient?: OpenAIClient;

  /**
   * Creates a new AnthropicClient instance
   *
   * @param apiKey Your Anthropic API key
   * @param model The model to use
   * @param openaiApiKey Optional OpenAI API key for structured formatting (auto-detected from env if not provided)
   * @throws Error if the Anthropic API key is not configured
   */
  constructor(apiKey: string, model: AnthropicModel, openaiApiKey?: string) {
    this.client = new Anthropic({
      apiKey,
      timeout: 240000, // 240 seconds (4 minutes) timeout for all requests
      maxRetries: 2, // Retry failed requests up to 2 times
    });
    this.model = model;

    // Auto-detect OpenAI API key from environment if not explicitly provided
    const openaiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    // Initialize OpenAI formatter if API key is available
    if (openaiKey) {
      this.formatterClient = new OpenAIClient(openaiKey, DEFAULT_MODELS.STRUCTURED_FORMATTER.model);
    }

    // Validate configuration on instantiation
    this.validateConfiguration();
  }

  /**
   * Set the OpenAI formatter client for structured output
   *
   * @param openaiApiKey OpenAI API key
   */
  setFormatterClient(openaiApiKey: string): void {
    this.formatterClient = new OpenAIClient(openaiApiKey, DEFAULT_MODELS.STRUCTURED_FORMATTER.model);
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
      console.warn(
        'OpenAI API key not found. Anthropic will attempt direct JSON generation (less reliable). ' +
          'Set OPENAI_API_KEY environment variable for better structured output.',
      );
    }

    return true;
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
   * Transforms reasoning effort level into Anthropic's thinking mode configuration
   *
   * @param reasoningEffort The normalized reasoning effort level
   * @returns Thinking mode object with appropriate budget_tokens, or undefined if not needed
   *
   * Budget guidelines based on Anthropic's documentation:
   * - low: 1,024 tokens (minimum threshold for basic reasoning)
   * - medium: 8,192 tokens (moderate complexity tasks)
   * - high: 16,384 tokens (complex tasks requiring comprehensive reasoning)
   *
   * @see https://docs.claude.com/en/docs/build-with-claude/extended-thinking
   */
  private getThinkingConfig(
    reasoningEffort?: 'low' | 'medium' | 'high',
  ): { type: 'enabled'; budget_tokens: number } | undefined {
    if (!reasoningEffort) {
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
   * @param options.reasoningEffort Normalized reasoning effort level ('low' | 'medium' | 'high') - enables extended thinking mode
   * @param options.maxAttempts Maximum number of retry attempts (default: 1, no retries)
   * @param options.logExecutionTime Whether to log execution time warnings (default: false)
   * @param options.responseInstructions Additional instructions to append to the prompt (deprecated, use formatGuidance)
   * @param options.useWebSearch Whether to enable web search for this request (default: false)
   * @returns The structured and validated response according to the provided schema
   * @throws Error if no OpenAI formatter is configured
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

    const startTime = logExecutionTime ? Date.now() : 0;

    // Build tools array if web search is enabled
    const tools = useWebSearch ? [WEB_SEARCH_TOOLS.ANTHROPIC] : undefined;

    // Get thinking configuration based on reasoning effort
    const thinking = this.getThinkingConfig(reasoningEffort);

    // Calculate max_tokens: must be greater than thinking budget
    // If thinking is enabled, we need max_tokens > budget_tokens
    // Otherwise, use the default ANTHROPIC_MAX_TOKENS
    const maxTokens = thinking ? Math.max(ANTHROPIC_MAX_TOKENS, thinking.budget_tokens + 4096) : ANTHROPIC_MAX_TOKENS;

    // Step 1: Generate content with Anthropic
    const anthropicResponse = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(tools && { tools }), // Only include tools if web search is enabled
      ...(thinking && { thinking }), // Only include thinking if reasoning effort is specified
    });

    // Extract text content - when thinking mode is enabled, response may have multiple content blocks
    // Find the text block (skip thinking blocks)
    const textContent = anthropicResponse.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      // Log the actual response structure for debugging
      console.error('[AnthropicClient] Unexpected response structure:', {
        contentBlocks: anthropicResponse.content.map((block) => ({ type: block.type })),
      });
      throw new Error('Expected text response from Anthropic');
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[AnthropicClient] Anthropic generated content:', {
        responseLength: textContent.text.length,
        responsePreview: textContent.text.substring(0, 500),
      });
    }

    // Step 2: Use OpenAI to format the response into the required schema
    const formattedResponse = await this.formatterClient.createStructuredResponse({
      prompt: textContent.text,
      schema,
      formatGuidance: effectiveFormatGuidance,
      reasoningEffort: 'low', // Formatting doesn't need high reasoning
      maxAttempts, // Pass through retry logic to formatter
      logExecutionTime: false, // We'll log our own execution time
    });

    // Log execution time if it's too long
    if (logExecutionTime) {
      const executionTime = Date.now() - startTime;
      if (executionTime > 20000) {
        console.log(`Long execution time for LLM completion: ${executionTime}ms`);
      }
    }

    return formattedResponse;
  }

  /**
   * Process a batch of items with parallel processing
   */
  async processBatchWithLLM<T, R>(
    items: T[],
    processFn: (batch: T[]) => Promise<R[]>,
    batchSize: number = 5,
  ): Promise<R[]> {
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
