// Factory class
export { LLM } from './src/llm';
export type { LlmProvider, LlmClientOptions } from './src/llm';

// Client classes
export { OpenAIClient } from './src/clients/openai-client';
export { AnthropicClient } from './src/clients/anthropic-client';
export { OpenRouterClient } from './src/clients/openrouter-client';

// Client configuration types
export type { OpenAIClientConfig } from './src/clients/openai-client';
export type { AnthropicClientConfig } from './src/clients/anthropic-client';
export type { OpenRouterClientConfig } from './src/clients/openrouter-client';

// Interface and base types
export type { LlmClientInterface, BaseLlmClientConfig, BatchProcessOptions, StreamChunk, LlmTokenUsage, LlmUsageCost } from './src/types/client-interface';

// Pricing utilities
export { MODEL_PRICING, calculateUsageCost } from './src/pricing';
export type { ModelPricing } from './src/pricing';

// Model types
export type { ModelConfig, ProviderModelMap, OpenAIModel, AnthropicModel, OpenRouterModel } from './src/model-types';

// Model configurations
export { DEFAULT_MODELS, REASONING_EFFORT_MAP, ANTHROPIC_MAX_TOKENS, WEB_SEARCH_TOOLS } from './src/models';

// Error types and utilities
export {
  LlmError,
  LlmTimeoutError,
  LlmValidationError,
  LlmApiError,
  LlmConfigurationError,
  LlmOutputTruncatedError,
  LlmJsonParseError,
  generateRequestId,
  isTimeoutError,
  isRetryableError,
  wrapSdkError,
} from './src/utils/errors';
export type { LlmErrorContext } from './src/utils/errors';

// Helper functions
export {
  isContentInLanguage,
  formatContentToStructure,
  generateAndFormatWithLanguageCheck,
} from './src/helpers';

// Response normalization utilities
export { stripJsonArtifacts } from './src/utils/strip-json-artifacts';
export type { SanitizationResult } from './src/utils/strip-json-artifacts';
