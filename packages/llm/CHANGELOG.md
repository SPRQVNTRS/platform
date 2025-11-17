# @sprqvntrs/llm

## 2.1.0

### Minor Changes

- 28bbdb0: feat(model): add OpenRouter model type for accessing 300+ models across providers

## 2.0.1

### Patch Changes

- 49746e0: chore(dependencies): update openai version to ^6.9.0

## 2.0.0

### Major Changes

- a8251c7: Refactor: split createResponse into text and raw response methods
  - Change createResponse to return extracted text as string instead of raw response
  - Add createRawResponse method to return full response object for metadata access
  - Add private extractContentFromResponse helper method to each client
  - Update interface to reflect new return types

  This improves the API by providing a clear separation of concerns:
  - Use createResponse for simple text extraction
  - Use createRawResponse when you need usage stats, finish reasons, etc.

## 1.2.0

### Minor Changes

- f1dea09: Add createResponse method for raw API responses to all LLM clients (Anthropic, OpenAI, OpenRouter). This new method allows consumers to get raw responses without structured output validation. Also update OpenRouter default model to google/gemini-2.5-flash-lite-preview-09-2025.

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
