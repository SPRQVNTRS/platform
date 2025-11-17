---
'@sprqvntrs/llm': major
---

# Major improvements to error handling, timeout configuration, and streaming support

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
  maxRetries: 3,   // Default: 2
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

Benefits:
- Real-time feedback during long operations
- Lower memory usage for large responses
- Better user experience with progress indication
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

### If you want to use streaming:

```typescript
// Non-streaming (existing behavior unchanged)
const text = await client.createResponse('Generate a story');

// Streaming (new capability)
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
- OpenAI uses `responses.stream()` API
- Anthropic uses `messages.stream()` API
- OpenRouter enables `stream: true` parameter
- Error wrapping preserves original error stack traces
- All timeout configurations are passed through to underlying SDKs

## Testing

All test suites have been updated with comprehensive coverage:

- **Timeout configuration**: Verified custom timeouts work correctly
- **Streaming responses**: Tests for all three clients with chunk counting
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
