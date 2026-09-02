# @sprqvntrs/llm

## 3.13.1

### Patch Changes

- 8a7a9e5: Relicensed to MIT and published to npmjs.com via trusted publishing; no code change.

## 3.13.0

### Minor Changes

- 3a50c75: feat(llm): make "reasoning off" expressible via `reasoningEffort: 'none'`

  Adds `'none'` to the normalized reasoning effort union and, for the first time,
  actually transmits the effort to OpenRouter.
  - New shared `ReasoningEffortLevel` type (`'none' | 'low' | 'medium' | 'high'`),
    exported from the package root and used by all three clients plus
    `LlmClientInterface`.
  - `OpenRouterClient.createStructuredResponse` now sends
    `reasoning: { effort }` on **both** the streaming and non-streaming request
    paths. Previously the parameter was accepted, logged, and silently discarded.
  - The parameter's `'low'` default was removed, so transmission is strictly
    opt-in: omitting `reasoningEffort` sends no `reasoning` field at all and
    leaves the provider default untouched. Without this, every existing
    OpenRouter caller would have started receiving `effort: 'low'`.
  - `AnthropicClient` treats `'none'` the same as omitted — extended thinking is
    opt-in there, so no thinking block is sent.
  - `OpenAIClient` already spread `reasoning: { effort }` when a value was
    present; only the accepted union widened.

  No behaviour changes for existing callers.

## 3.12.0

### Minor Changes

- 2cbbe59: feat(llm): add the gpt-5.6 family (terra/luna/sol plus their pro variants) to `OpenAINewerModel` and to pricing under both bare and `openai/`-prefixed keys, and refresh `pricing-data.json` from OpenRouter. gpt-5.4-mini pricing is regression-tested (fixes #20; #12)

### Patch Changes

- 2cbbe59: fix(llm): route non-streaming OpenRouter errors through wrapSdkError. `createRawResponse` (and `createResponse`, which delegates to it) now wrap SDK failures in enriched `LlmApiError`/`LlmError` subclasses carrying status code, provider message/code, and full error context instead of leaking the bare `Error: Provider returned error`. Transient provider errors (5xx/429) are correctly classified retryable by `isRetryableError` (fixes #19)

## 3.11.0

### Minor Changes

- 50f3377: feat(llm): treat truncated/empty-response JSON parse errors as retryable

  `LlmJsonParseError` now exposes `isLikelyTruncation`; `isRetryableError()` returns true for parse errors that look like transient truncation (finish_reason missing/unknown and the content is empty or fails with "Unexpected end of JSON input"). Complete-but-malformed responses (`finish_reason: stop`) remain non-retryable.

## 3.10.0

### Minor Changes

- b836394: feat(llm): surface upstream provider error message in `LlmApiError`

  Non-2xx provider failures previously surfaced as a bare `API error (status <code>)` with no actionable reason — the provider's structured error body was dropped by the error-wrapping layer. `wrapSdkError` now extracts the upstream message and threads it into `LlmApiError`:
  - `LlmApiError` gains `providerMessage`, `providerCode`, and raw `body` fields, and includes the provider message in `.message` (e.g. `API error (status 403): Key limit exceeded (monthly limit)`).
  - New exported `extractProviderError()` helper and `LlmApiErrorDetails` interface pull the reason from common SDK shapes (`@openrouter/sdk` typed subclasses, raw JSON `body`, axios-style `response.data`).
  - No breaking change: the existing `statusCode` contract and error class hierarchy are unchanged; the new constructor argument is optional.

## 3.9.0

### Minor Changes

- 623d59f: feat(llm): add stripJsonArtifacts() utility and wire into OpenRouterClient.createResponse

  Promotes the delphi-local JSON artifact sanitizer into the shared @sprqvntrs/llm package.
  stripJsonArtifacts() strips 8 categories of LLM output artifacts (markdown fences, JSON
  fragments, serialization noise, PMID placeholders, structural labels, INVALID\_\* tokens,
  meta-commentary, and XML-like closing tags) from prose responses. Wired into
  OpenRouterClient.createResponse() by default; opt out per call via skipArtifactStripping: true.
  createStructuredResponse() is unaffected. SanitizationResult type exported for caller telemetry.

## 3.8.0

### Minor Changes

- 0b93a3a: feat(llm): bump SDKs and add support for gpt-5.5, gpt-5.5-pro, claude-opus-4-7, claude-sonnet-4-6
  - Bump `@anthropic-ai/sdk` to 0.91.1 — `claude-opus-4-7` and `claude-sonnet-4-6` are now exposed via `AnthropicModel`.
  - Bump `openai` to 6.35.0. The SDK has not yet added `gpt-5.5` / `gpt-5.5-pro` to `ChatModel`, so `OpenAIModel` is extended with literal types until they ship.
  - Bump `@openrouter/sdk` to 0.12.22. Adapt the OpenRouter client to the new SDK shape (`chatGenerationParams` → `chatRequest`) and wire `maxRetries` through to the SDK's `retryConfig` so small `timeoutMs` values are no longer masked by default backoff retries.
  - Refresh `pricing-data.json` and add the new model IDs to the sync map.

## 3.7.0

### Minor Changes

- 4829c4a: feat(llm): add automatic retry with exponential backoff for transient errors

  All clients now default to 3 retry attempts (up from 1) with exponential backoff for transient errors. Added `isRetryableError()` classifier that retries on timeouts, 5xx server errors, 429 rate limits, and generic transient errors while immediately failing on non-retryable errors (validation, config, truncation, JSON parse, 4xx client errors). Improved error context extraction from SDK errors (errorCode, errorType, providerRequestId). Added missing retry loop to Anthropic client.

## 3.6.0

### Minor Changes

- 2fa51db: feat(llm): add LlmJsonParseError for silent JSON truncation detection

  New `LlmJsonParseError` class surfaces when models return invalid JSON despite `finish_reason: 'stop'`. Includes raw content, content length, and finish reason metadata for debugging. Retries are skipped for these errors since the same prompt produces the same truncation.

## 3.5.2

### Patch Changes

- 4211ec0: fix(llm): detect output truncation via finish_reason before JSON parsing

  OpenRouterClient.createStructuredResponse now checks finish_reason === 'length' in both streaming and non-streaming paths, throwing a descriptive LlmOutputTruncatedError instead of a confusing SyntaxError from truncated JSON. Adds finishReason field to StreamChunk interface.

## 3.5.1

### Patch Changes

- 4a0ac12: fix(llm): normalize Gemini "null" string responses for nullable schema fields

## 3.5.0

### Minor Changes

- c484f00: feat(llm): bump default models to gpt-5.4 and claude-sonnet-4-6, update OpenAI SDK to 6.27.0, refresh pricing data

## 3.4.1

### Patch Changes

- 68b5a0a: fix(llm): fix structured output JSON schema generation by migrating to zod v4

  All source files now import from `zod/v4` instead of the v3 compat shim, giving schemas the `_zod` property required by the OpenAI SDK's v4 detection. The vendored `zodToJsonSchema` import in `openrouter-client.ts` is replaced with native `z.toJSONSchema()` plus a `toStrictJsonSchema` post-processor that recursively enforces `additionalProperties: false` and `required` on all object schemas. Both OpenAI and OpenRouter paths now send proper JSON schemas for structured output enforcement.

## 3.4.0

### Minor Changes

- bdfcd11: feat(llm): bump upstream SDK dependencies (anthropic 0.78, openai 6.25, openrouter 0.9.11)
- e1fc995: feat(llm): add lastUsage property to all LLM clients for token usage tracking
- 86323ee: feat(llm): enrich lastUsage with model name and calculated cost

  Added auto-generated pricing data from OpenRouter's API and enriched `LlmTokenUsage` with `model` (string) and `cost` (LlmUsageCost | null) fields. Consumers can now access `client.lastUsage.cost.total` directly instead of maintaining their own pricing tables. New exports: `MODEL_PRICING`, `calculateUsageCost`, `ModelPricing`, `LlmUsageCost`.

## 3.3.2

### Patch Changes

- b0049f7: fix(llm): resolve JSON Schema $ref/$defs for Gemini models

  Gemini models do not support `$ref`/`$defs` in JSON Schema, causing structured output
  requests to fail with "reference to undefined schema" errors when Zod schemas contain
  shared object references. Added a post-processing step that inlines all `$ref` pointers
  and converts `anyOf` nullable patterns to `{ nullable: true }` for Gemini compatibility.
  Non-Gemini models are unaffected.

## 3.3.1

### Patch Changes

- 9250d23: Move zod to peerDependencies and upgrade @openrouter/sdk to 0.5.1.

  Since z.ZodType is exposed in the public API via LlmClientInterface, zod
  should be a peerDependency to ensure consumers share the same instance
  and avoid type mismatches. @openrouter/sdk upgraded from 0.1.3 (Jan 2024)
  to 0.5.1 (Feb 2026) for bug fixes and improvements.

## 3.3.0

### Minor Changes

- Add streaming usage tracking to all LLM clients

  The `StreamChunk.usage` field is now populated with token counts from streaming responses:
  - **OpenAI**: Captures usage from `response.completed` event
  - **Anthropic**: Uses `stream.finalMessage()` to retrieve usage after streaming completes
  - **OpenRouter**: Captures `chunk.usage` from the final streaming chunk

  Usage data is included in the final `StreamChunk` (where `isComplete: true`) with the following fields:
  - `promptTokens`: Input token count
  - `completionTokens`: Output token count
  - `totalTokens`: Sum of input and output tokens

  This enables downstream applications to track costs without sacrificing streaming performance.

## 3.2.1

### Patch Changes

- d5db3d4: Update OpenAI SDK to version 6.15.0 and update default OpenAI model to gpt-5.2-2025-12-11

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
