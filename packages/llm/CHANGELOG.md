# @sprqvntrs/llm

## 3.2.0

### Minor Changes

- 2dc7b28: Add consistent DEFAULT_SYSTEM_PROMPT across all LLM clients (Anthropic, OpenAI, OpenRouter) to ensure uniform behavior that generates content directly without asking clarifying questions

## 3.1.1

### Patch Changes

- 15c021c: Replace tiny-invariant dependency with inline error checking

  Removed the `tiny-invariant` external dependency and replaced its usage with inline error checks. This reduces bundle size and external dependencies without changing any functionality.

## 3.1.0

### Minor Changes

- df9b319: Enhance LLM clients with configurable timeouts, retries, and native structured outputs
  - Add timeout and maxRetries support to all LLM clients with per-request override capabilities
  - AnthropicClient: Add extended thinking support with budget_tokens configuration
  - OpenRouterClient: Migrate to native structured outputs using Zod-to-JSON-Schema conversion
  - OpenAIClient: Enhanced streaming with retry logic and execution time tracking
  - Improve error context tracking with timeout and operation metadata

## 3.0.0

### Major Changes

- e0f7b6d: # Major improvements to error handling, timeout configuration, and streaming support

  ## Breaking Changes
  - **Default timeout reduced from 240s to 120s (2 minutes)**: This more conservative default prevents long-hanging requests. You can configure the timeout via the `timeout` config option if needed.
  - **New required dependencies**: The error handling system now requires additional imports if you're catching and handling LLM errors directly.

  ## New Features

  ### 1. Configurable Timeout & Retries

  All clients now support configurable timeout and retry settings:

  ```typescript
  const client = new OpenAIClient({
    apiKey: 'your-api-key',
    timeout: 180000, // 3 minutes
    maxRetries: 3, // Default: 2
  });
  ```

  - **Default timeout**: 120 seconds (2 minutes) - down from 240s
  - **Default retries**: 2 attempts
  - OpenRouterClient now has timeout configured (previously missing)

  ### 2. Streaming Support

  All clients now support streaming responses via the new `createStreamingResponse()` method:

  ```typescript
  const client = new OpenAIClient({ apiKey: 'your-api-key' });

  for await (const chunk of client.createStreamingResponse('Tell me a story')) {
    if (!chunk.isComplete) {
      process.stdout.write(chunk.text); // Stream tokens as they arrive
    }
  }
  ```

  **NEW: Streaming now enabled by default in `createStructuredResponse()`** for better observability:

  ```typescript
  // Streaming is now enabled by default (stream: true)
  const result = await client.createStructuredResponse({
    prompt: 'Analyze this data',
    schema: mySchema,
    // stream defaults to true - logs progress during generation
  });

  // You can opt out if needed
  const result = await client.createStructuredResponse({
    prompt: 'Analyze this data',
    schema: mySchema,
    stream: false, // Disable streaming
  });
  ```

  Benefits:
  - Real-time feedback during long operations
  - Lower memory usage for large responses
  - Better user experience with progress indication
  - **Better debuggability**: See exactly where requests hang, even for structured outputs
  - Ability to handle partial responses on timeout

  ### 3. Enhanced Error Handling

  New error classes with rich debugging context:

  ```typescript
  import { LlmTimeoutError, LlmApiError, isTimeoutError } from '@sprqvntrs/llm';

  try {
    const result = await client.createStructuredResponse({ prompt, schema });
  } catch (error) {
    if (error instanceof LlmTimeoutError) {
      console.error('Request timed out:', error.getDetailedMessage());
      console.error('Context:', error.context);
      // {
      //   clientType: 'openai',
      //   model: 'gpt-4',
      //   elapsedMs: 120000,
      //   timeoutMs: 120000,
      //   operation: 'createStructuredResponse',
      //   requestId: '1731842400000-abc123',
      //   metadata: { promptSize: 1500, attempt: 1, maxAttempts: 1 }
      // }
    }
  }
  ```

  Error types:
  - `LlmTimeoutError`: Request exceeded timeout limit
  - `LlmApiError`: API returned an error status code
  - `LlmValidationError`: Response failed schema validation
  - `LlmConfigurationError`: Invalid client configuration
  - `LlmError`: Base class for all LLM errors

  All errors include:
  - Client type and model name
  - Elapsed time and timeout configuration
  - Request correlation ID for tracking
  - Operation context (prompt size, attempt number, etc.)
  - Original error stack traces

  ### 4. Production Error Logging

  Errors and warnings now log in production (not just development):

  ```typescript
  // These now log even in production
  logger.logError('Request failed', error, context);
  logger.logWarning('Approaching timeout threshold', { progress: '75%' });

  // Debug logs still only in development
  logger.log('Debug info', { details });
  ```

  ### 5. Exponential Backoff on Retries

  Failed requests now use exponential backoff before retrying:
  - Attempt 1 fails → wait 1 second
  - Attempt 2 fails → wait 2 seconds
  - Attempt 3 fails → wait 4 seconds
  - Maximum backoff: 10 seconds

  ### 6. Request Correlation IDs

  All operations now generate unique request IDs for debugging:

  ```
  [2025-11-17T10:30:07.627Z] [OpenAIClient] createStructuredResponse called
  {
    "modelUsed": "gpt-4",
    "requestId": "1731842407627-kj2n9f8d",
    "attempt": "1/1"
  }
  ```

  ## Improvements
  - **Better timeout error messages**: Errors now show elapsed time, timeout limit, and progress percentage
  - **Consistent error handling** across all clients (OpenAI, Anthropic, OpenRouter)
  - **Request metadata tracking**: Prompt size, schema complexity, and attempt counters in all error contexts
  - **Improved logging** with structured context in all environments

  ## Migration Guide

  ### If you were relying on the 240s timeout:

  ```typescript
  // Before (implicit 240s timeout)
  const client = new OpenAIClient({ apiKey: 'key' });

  // After (explicit 240s timeout)
  const client = new OpenAIClient({
    apiKey: 'key',
    timeout: 240000, // Keep old behavior
  });
  ```

  ### If you catch and handle errors:

  ```typescript
  // Before
  try {
    await client.createStructuredResponse({ prompt, schema });
  } catch (error) {
    console.error('Error:', error.message);
  }

  // After (with enhanced error context)
  import { LlmTimeoutError, isTimeoutError } from '@sprqvntrs/llm';

  try {
    await client.createStructuredResponse({ prompt, schema });
  } catch (error) {
    if (isTimeoutError(error)) {
      // Handle timeout specifically
      console.error('Timeout:', error.context.elapsedMs, 'ms');
    } else {
      console.error('Error:', error.message);
    }
  }
  ```

  ### If you want to disable streaming in structured responses:

  ```typescript
  // Before (streaming wasn't available)
  const result = await client.createStructuredResponse({
    prompt: 'Analyze data',
    schema,
  });

  // After (streaming is now default, but you can disable it)
  const result = await client.createStructuredResponse({
    prompt: 'Analyze data',
    schema,
    stream: false, // Explicitly disable streaming
  });

  // To use raw streaming responses:
  for await (const chunk of client.createStreamingResponse('Generate a story')) {
    if (!chunk.isComplete) {
      process.stdout.write(chunk.text);
    } else {
      console.log('\nStreaming complete!');
    }
  }
  ```

  ## Implementation Notes
  - Streaming is implemented using native SDK streaming APIs where available
  - OpenAI uses `responses.stream()` API for both raw streaming and structured responses
  - Anthropic uses `messages.stream()` API for generation phase of structured responses
  - OpenRouter uses streaming via the native SDK for both raw and structured responses
  - **Structured responses**: When `stream: true` (default), the generation phase is streamed for observability, then the accumulated response is parsed/validated
  - Error wrapping preserves original error stack traces
  - All timeout configurations are passed through to underlying SDKs
  - Progress is logged every 100 characters during streaming (when debug enabled)

  ## Testing

  All test suites have been updated with comprehensive coverage:
  - **Timeout configuration**: Verified custom timeouts work correctly
  - **Streaming responses**: Tests for all three clients with chunk counting
  - **Streaming in structured responses**: New tests verify streaming is used by default in `createStructuredResponse()`
  - **Error handling**: Tests for enriched error context and error types
  - **Timeout detection**: Validates `isTimeoutError()` helper function
  - **Retry logic**: Confirms exponential backoff works as expected
  - **Request correlation**: Verifies unique request IDs are generated
  - **Invalid credentials**: Tests error handling with bad API keys

  Run tests with:

  ```bash
  pnpm test              # Run all tests
  pnpm test:openai       # Test OpenAI client only
  pnpm test:anthropic    # Test Anthropic client only
  pnpm test:openrouter   # Test OpenRouter client only
  ```

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
