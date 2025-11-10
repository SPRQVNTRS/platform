# @sprqvntrs/llm

## 1.1.0

### Minor Changes

- 36da6a1: Refactor LLM clients to use unified config-based constructor pattern
  - Add DebugLogger utility for consistent logging across all providers
  - Introduce BaseLlmClientConfig for standardized client configuration
  - Add BatchProcessOptions interface for batch processing parameters
  - Refactor OpenAI, Anthropic, and OpenRouter clients to use config objects
  - Update LLM factory methods for the new constructor signatures
  - Improve type safety and consistency across all client implementations
  - Update all client tests to use new configuration pattern

## 1.0.3

### Patch Changes

- 59d29ef: Upgrade @anthropic-ai/sdk to 0.67.0 and resolve to 1.22.11

## 1.0.2

### Patch Changes

- f972787: Created comprehensive README.md documentation for @sprqvntrs/llm package with complete API reference and usage examples

## 1.0.1

### Patch Changes

- 4749352: Add GitHub Packages publishing infrastructure with changesets, workflows, and repository metadata
