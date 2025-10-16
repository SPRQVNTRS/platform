import invariant from 'tiny-invariant';
import { OpenAIClient } from './clients/openai-client';
import { AnthropicClient } from './clients/anthropic-client';
import type { LlmClientInterface } from './types/client-interface';

export type LlmProvider = 'openai' | 'anthropic';

export type LlmClientOptions = {
  apiKey?: string;
  /**
   * Enable debug mode for development.
   */
  debug?: boolean;
  /**
   * Some debug/testing contexts need to opt into reasoning endpoints explicitly (OpenAI only).
   */
  useReasoningMode?: boolean;
  /**
   * OpenAI API key for structured formatting (used by Anthropic client).
   * If provided, Anthropic will use OpenAI for reliable structured output formatting.
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
   * Works with both OpenAI and Anthropic providers transparently.
   *
   * @param provider - The LLM provider ('openai' or 'anthropic')
   * @param model - The model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514')
   * @param options - Optional configuration overrides
   * @returns Client implementing LlmClientInterface
   * @example
   * const llm = LLM.getClient('openai', 'gpt-4o');
   * const result = await llm.createStructuredResponse({ prompt, schema });
   */
  static getClient(provider: LlmProvider, model: string, options?: LlmClientOptions): LlmClientInterface {
    switch (provider) {
      case 'openai':
        return this._createOpenAIClient(model, options);
      case 'anthropic':
        return this._createAnthropicClient(model, options);
    }
  }

  /**
   * Create an OpenAI client instance
   */
  private static _createOpenAIClient(model: string, options?: LlmClientOptions): OpenAIClient {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    invariant(apiKey, 'OPENAI_API_KEY is not set');
    return new OpenAIClient(apiKey, model, options?.debug);
  }

  /**
   * Create an Anthropic client instance
   */
  private static _createAnthropicClient(model: string, options?: LlmClientOptions): AnthropicClient {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    invariant(apiKey, 'ANTHROPIC_API_KEY is not set');

    // OpenAI API key is auto-detected from environment in AnthropicClient constructor
    // Can be overridden via options if needed
    const openaiApiKey = options?.openaiApiKey;

    return new AnthropicClient(apiKey, model, openaiApiKey);
  }
}
