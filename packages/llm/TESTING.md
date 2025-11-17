# Testing Guide for @sprqvntrs/llm

This document describes how to test the new features added in v2.1.0 (timeout configuration, streaming, and enhanced error handling).

## Prerequisites

Create a `.env` file in the `packages/llm` directory with your API keys:

```env
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENROUTER_API_KEY=your-openrouter-key
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Individual Test Suites
```bash
pnpm test:openai       # Test OpenAI client
pnpm test:anthropic    # Test Anthropic client
pnpm test:openrouter   # Test OpenRouter client
```

## Test Coverage

### 1. Timeout Configuration Tests
- **What it tests**: Custom timeout and retry configuration
- **Expected result**: Clients initialize with specified timeout/retry values
- **Files**: All three test files

### 2. Streaming Response Tests
- **What it tests**: `createStreamingResponse()` method
- **Expected result**: Receives chunks of text in real-time, counts chunks correctly
- **Example output**:
  ```
  ✓ Streaming completed
    Received 47 chunks
    Total text length: 234 chars
  ```

### 3. Error Handling Tests
- **What it tests**: Enriched error context with LlmError classes
- **Expected result**: Errors include client type, model, request ID, elapsed time, timeout config
- **Example output**:
  ```
  ✓ Caught LlmError with context
    Client Type: openai
    Model: gpt-4o-mini
    Operation: createResponse
    Request ID: 1731842407631-abc123
    Elapsed: 1234ms
  ```

### 4. Timeout Detection Tests
- **What it tests**: `isTimeoutError()` helper and LlmTimeoutError class
- **Expected result**: Correctly identifies timeout errors and provides detailed info
- **Note**: Uses 1ms timeout to force timeout

### 5. Retry Logic Tests
- **What it tests**: Exponential backoff on retries
- **Expected result**: Retries with increasing delays (1s → 2s → 4s → etc)
- **Note**: Most tests succeed on first try, but retry logic is configured

### 6. Request Correlation Tests
- **What it tests**: Unique request IDs for tracking
- **Expected result**: Multiple concurrent requests have different IDs
- **Note**: Check debug logs to see correlation IDs

### 7. Structured Response Tests
- **What it tests**: Existing functionality still works with new error handling
- **Expected result**: Structured outputs validated against schemas

## Test Output Examples

### Successful Test Run
```
=== Testing OpenAIClient ===

1. Initializing OpenAIClient with custom config...
✓ Client initialized successfully
  Timeout: 60s, Max Retries: 2

2. Testing basic raw response...
✓ Raw response received
  Message: 4

3. Testing basic structured response...
✓ Response: { answer: 'Jupiter', confidence: 0.99 }

5. Testing streaming response...
..................................................
✓ Streaming completed
  Received 47 chunks
  Total text length: 234 chars

6. Testing error handling with invalid API key...
✓ Caught LlmError with context
  Client Type: openai
  Model: gpt-4o-mini
  Operation: createResponse
  Request ID: 1731842407631-abc123
  Elapsed: 234ms

=== All OpenAIClient tests passed! ===
```

### Expected Timeout Test
```
7. Testing timeout error detection...
✓ Timeout detected successfully
  Detailed message: [OPENAI] Request timed out after 1ms (timeout: 1ms)
  Model: gpt-4o-mini
  Elapsed: 1ms
  Timeout: 1ms
  Progress: 100.0% of timeout
  Request ID: 1731842410000-xyz789
```

## Debugging Failed Tests

### Timeout Errors
If tests timeout unexpectedly:
1. Check your internet connection
2. Increase timeout in test file (currently 60s)
3. Verify API keys are correct and have quota

### Streaming Errors
If streaming tests fail:
1. Ensure you're using latest SDK versions
2. Check if the model supports streaming
3. Look for TypeScript errors in chunk handling

### Error Handling Tests
If error tests don't catch expected errors:
1. Verify bad API key is actually invalid
2. Check error instance types match expected classes
3. Review error wrapping logic

## Manual Testing

You can also test features manually:

```typescript
import { OpenAIClient, LlmTimeoutError, isTimeoutError } from '@sprqvntrs/llm';

// Test timeout configuration
const client = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY!,
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  debug: true, // Enable debug logs
});

// Test streaming
for await (const chunk of client.createStreamingResponse('Tell me a joke')) {
  if (!chunk.isComplete) {
    process.stdout.write(chunk.text);
  }
}

// Test error handling
try {
  await client.createStructuredResponse({ /* ... */ });
} catch (error) {
  if (error instanceof LlmTimeoutError) {
    console.error('Timeout!', error.getDetailedMessage());
    console.error('Context:', JSON.stringify(error.context, null, 2));
  }
}
```

## Performance Notes

- Streaming tests make real API calls and may take 5-30 seconds
- Timeout tests intentionally fail fast (1ms timeout)
- Error handling tests make invalid API calls (may take 2-5 seconds to fail)
- Total test suite runtime: ~1-2 minutes per client

## Known Issues

1. **TypeScript warnings in dependencies**: The SDK dependencies have TypeScript errors related to private identifiers. These don't affect runtime behavior.

2. **OpenRouter retry config**: The OpenRouter SDK doesn't expose a `maxRetries` parameter, so it handles retries internally.

3. **Streaming chunk counts**: Chunk counts vary between runs depending on model behavior and network conditions.

## Adding New Tests

To add a new test case:

1. Add test function to appropriate test file
2. Follow existing test structure (try/catch with descriptive logs)
3. Use `.test.ts` extension
4. Update this document with test description
5. Run typecheck: `pnpm exec tsc --noEmit tests/*.test.ts`
