import { OpenAIClient } from './clients/openai-client';
import { AnthropicClient } from './clients/anthropic-client';
import { OpenRouterClient } from './clients/openrouter-client';
import type { LlmClientInterface } from './types/client-interface';
import type { AnthropicModel } from './model-types';

export type LlmProvider = 'openai' | 'anthropic' | 'openrouter';

export type LlmClientOptions = {
  apiKey?: string;
  /**
   * Enable debug mode for development.
   * - If true: always log debug messages
   * - If false: never log debug messages
   * - If undefined: auto-detect based on NODE_ENV (enabled in development)
   */
  debug?: boolean;
  /**
   * Some debug/testing contexts need to opt into reasoning endpoints explicitly (OpenAI only).
   */
  useReasoningMode?: boolean;
  /**
   * OpenAI API key for structured formatting (used by Anthropic and OpenRouter clients).
   * If provided, these clients will use OpenAI for reliable structured output formatting.
   */
  openaiApiKey?: string;
};

/**
 * Unified LLM client factory for all AI model interactions.
 * Returns a client that implements the unified LlmClientInterface,
 * providing consistent API across different providers.
 */
export class LLM {
  /**
   * Get an LLM client that implements the unified interface.
   * Works with OpenAI, Anthropic, and OpenRouter providers transparently.
   *
   * @param provider - The LLM provider ('openai', 'anthropic', or 'openrouter')
   * @param model - The model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514', 'openai/gpt-4o-mini')
   * @param options - Optional configuration overrides
   * @returns Client implementing LlmClientInterface
   * @example
   * const llm = LLM.getClient('openai', 'gpt-4o');
   * const llm2 = LLM.getClient('openrouter', 'openai/gpt-4o-mini');
   * const result = await llm.createStructuredResponse({ prompt, schema });
   */
  static getClient(provider: LlmProvider, model: string, options?: LlmClientOptions): LlmClientInterface {
    switch (provider) {
      case 'openai':
        return this._createOpenAIClient(model, options);
      case 'anthropic':
        return this._createAnthropicClient(model, options);
      case 'openrouter':
        return this._createOpenRouterClient(model, options);
    }
  }

  /**
   * Create an OpenAI client instance
   */
  private static _createOpenAIClient(model: string, options?: LlmClientOptions): OpenAIClient {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return new OpenAIClient({
      apiKey,
      model,
      debug: options?.debug,
    });
  }

  /**
   * Create an Anthropic client instance
   */
  private static _createAnthropicClient(model: string, options?: LlmClientOptions): AnthropicClient {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    return new AnthropicClient({
      apiKey,
      model: model as AnthropicModel,
      openaiApiKey: options?.openaiApiKey,
      debug: options?.debug,
    });
  }

  /**
   * Create an OpenRouter client instance
   */
  private static _createOpenRouterClient(model: string, options?: LlmClientOptions): OpenRouterClient {
    const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    return new OpenRouterClient({
      apiKey,
      model,
      openaiApiKey: options?.openaiApiKey,
      debug: options?.debug,
    });
  }
}
