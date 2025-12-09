import type { ModelConfig } from './model-types';

/**
 * Default model configurations for LLM operations
 * These are used internally by the LLM package for formatting and structure operations
 */
export const DEFAULT_MODELS = {
  /**
   * Model used for converting unstructured content into structured format
   * This is typically used when an Anthropic response needs to be formatted
   */
  STRUCTURED_FORMATTER: {
    provider: 'openai',
    model: 'gpt-5-mini-2025-08-07',
  } as ModelConfig<'openai'>,

  /**
   * Model used for language detection and validation
   */
  LANGUAGE_DETECTOR: {
    provider: 'openai',
    model: 'gpt-5-nano-2025-08-07',
  } as ModelConfig<'openai'>,

  /**
   * Default Anthropic model for generation tasks
   */
  ANTHROPIC_DEFAULT: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
  } as ModelConfig<'anthropic'>,

  /**
   * Default OpenAI model for generation tasks
   */
  OPENAI_DEFAULT: {
    provider: 'openai',
    model: 'gpt-5-mini-2025-08-07',
  } as ModelConfig<'openai'>,
} as const;

/**
 * Maps reasoning effort levels to provider-specific parameters
 * Note: Only OpenAI supports reasoning_effort currently (for o1 models)
 */
export const REASONING_EFFORT_MAP = {
  openai: {
    low: undefined, // OpenAI doesn't use reasoning_effort for low
    medium: 'medium' as const,
    high: 'high' as const,
  },
} as const;

/**
 * Base max tokens for Anthropic responses
 * When using thinking mode, actual max_tokens will be: max(ANTHROPIC_MAX_TOKENS, budget_tokens + 4096)
 * to ensure max_tokens > thinking.budget_tokens as required by the API
 */
export const ANTHROPIC_MAX_TOKENS = 4096;

/**
 * Default system prompt used across all LLM clients
 * Instructs the model to generate content directly without asking clarifying questions
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert assistant.

When given a task, produce the requested output directly:
- Do NOT ask clarifying questions
- Do NOT present multiple options or menus for the user to choose from
- Do NOT include meta-commentary about the task
- Make reasonable assumptions when details are unspecified`;

/**
 * Web search tool configurations for different providers
 */
export const WEB_SEARCH_TOOLS = {
  /**
   * Anthropic web search tool configuration
   * See: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
   */
  ANTHROPIC: {
    type: 'web_search_20250305',
    name: 'web_search',
  },

  /**
   * OpenAI web search tool configuration for Responses API
   * See: https://cookbook.openai.com/examples/responses_api/responses_example
   */
  OPENAI: {
    type: 'web_search',
  },
} as const;
