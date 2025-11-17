import type { ChatModel as OpenAIChatModel } from 'openai/resources/shared';
import type { Model as AnthropicModelType } from '@anthropic-ai/sdk/resources/messages/messages';

/**
 * OpenAI model types from the official SDK
 */
export type OpenAIModel = OpenAIChatModel | 'text-embedding-3-large' | 'text-embedding-ada-002';

/**
 * Anthropic model types from the official SDK
 */
export type AnthropicModel = AnthropicModelType;

/**
 * OpenRouter model types
 * OpenRouter provides access to 300+ models across multiple providers
 * Models are specified in the format 'provider/model-name'
 * Examples: 'openai/gpt-4', 'anthropic/claude-3-opus', 'google/gemini-2.5-flash-lite-preview-09-2025'
 */
export type OpenRouterModel = string;

/**
 * Map of provider to their available models
 */
export type ProviderModelMap = {
  openai: OpenAIModel;
  anthropic: AnthropicModel;
  openrouter: OpenRouterModel;
};

/**
 * Provider-specific model configuration with automatic model type inference
 * When you set provider: 'openai', the model field will autocomplete with OpenAI models
 * When you set provider: 'anthropic', the model field will autocomplete with Anthropic models
 */
export type ModelConfig<P extends keyof ProviderModelMap = keyof ProviderModelMap> = {
  [K in P]: {
    provider: K;
    model: ProviderModelMap[K];
  };
}[P];
