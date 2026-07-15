import type { ChatModel as OpenAIChatModel } from 'openai/resources/shared';
import type { Model as AnthropicModelType } from '@anthropic-ai/sdk/resources/messages/messages';

/**
 * OpenAI models released after the SDK's ChatModel union was last cut.
 * Keep here until `openai` ships an SDK that includes them in `ChatModel`,
 * then drop these literals.
 */
type OpenAINewerModel =
  | 'gpt-5.5'
  | 'gpt-5.5-pro'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-terra-pro'
  | 'gpt-5.6-luna'
  | 'gpt-5.6-luna-pro'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-sol-pro';

/**
 * OpenAI model types from the official SDK, plus newer models not yet in the
 * SDK's `ChatModel` union and the embedding models we use directly.
 */
export type OpenAIModel =
  | OpenAIChatModel
  | OpenAINewerModel
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

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
