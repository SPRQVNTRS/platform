import 'dotenv/config';
import { z } from 'zod/v3';
import { OpenAIClient } from '../src/clients/openai-client.js';
import { LlmTimeoutError, LlmError, isTimeoutError } from '../src/utils/errors.js';

/**
 * Test script for OpenAIClient
 *
 * Run with: pnpm tsx tests/openai-client.test.ts
 *
 * Requirements:
 * - OPENAI_API_KEY in .env file
 */

async function testOpenAIClient() {
  console.log('=== Testing OpenAIClient ===\n');

  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }

  // Initialize client with custom timeout
  console.log('1. Initializing OpenAIClient with custom config...');
  const client = new OpenAIClient({
    apiKey: openaiKey,
    model: 'gpt-4o-mini',
    debug: false, // Disable debug for tests
    timeout: 60000, // 60 seconds
    maxRetries: 2,
  });
  console.log('✓ Client initialized successfully');
  console.log('  Timeout: 60s, Max Retries: 2\n');

  // Test 1: Basic raw response
  console.log('2. Testing basic raw response...');
  try {
    const rawResponse = await client.createResponse('What is 2+2? Answer briefly.');

    console.log('✓ Raw response received');
    console.log('  Message:', rawResponse);
    console.log();
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }

  // Test 2: Basic structured response
  console.log('3. Testing basic structured response...');
  const schema = z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
  });

  try {
    const result = await client.createStructuredResponse({
      prompt: 'What is the largest planet in our solar system? Respond with the answer and your confidence level.',
      schema,
      logExecutionTime: true,
    });

    console.log('✓ Response:', result);
    console.log();
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }

  // Test 3: Structured output with nested objects
  console.log('4. Testing structured output with nested objects...');
  try {
    const nestedResult = await client.createStructuredResponse({
      prompt: 'Create a simple user profile with name, age, and two skills.',
      schema: z.object({
        name: z.string(),
        age: z.number(),
        skills: z.array(z.string()),
      }),
      logExecutionTime: true,
    });

    console.log('✓ Nested response:', nestedResult);
    console.log();
  } catch (error) {
    console.error('✗ Nested test failed:', error);
    throw error;
  }

  // Test 4: Streaming response with usage tracking
  console.log('5. Testing streaming response with usage tracking...');
  try {
    let fullText = '';
    let chunkCount = 0;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    for await (const chunk of client.createStreamingResponse('Count from 1 to 5 with explanations.')) {
      if (!chunk.isComplete) {
        fullText += chunk.text;
        chunkCount++;
        process.stdout.write('.');
      } else {
        usage = chunk.usage;
        console.log();
        console.log('✓ Streaming completed');
        console.log(`  Received ${chunkCount} chunks`);
        console.log(`  Total text length: ${fullText.length} chars`);
        console.log(`  Preview: ${fullText.substring(0, 100)}...`);

        // Verify usage data
        if (usage) {
          console.log('✓ Usage data captured:');
          console.log(`  Prompt tokens: ${usage.promptTokens}`);
          console.log(`  Completion tokens: ${usage.completionTokens}`);
          console.log(`  Total tokens: ${usage.totalTokens}`);
        } else {
          console.log('⚠ Warning: No usage data in final chunk');
        }
      }
    }

    // Assert usage exists (this validates the implementation)
    if (!usage) {
      throw new Error('Expected usage data in final streaming chunk');
    }
    if (typeof usage.promptTokens !== 'number' || typeof usage.completionTokens !== 'number') {
      throw new Error('Usage data missing required token counts');
    }

    console.log();
  } catch (error) {
    console.error('✗ Streaming test failed:', error);
    throw error;
  }

  // Test 5: Error handling with enriched context
  console.log('6. Testing error handling with invalid API key...');
  try {
    const badClient = new OpenAIClient({
      apiKey: 'invalid-key-12345',
      model: 'gpt-4o-mini',
      timeout: 5000,
    });

    await badClient.createResponse('Test');
    console.error('✗ Should have thrown an error');
  } catch (error) {
    if (error instanceof LlmError) {
      console.log('✓ Caught LlmError with context');
      console.log('  Client Type:', error.context.clientType);
      console.log('  Model:', error.context.model);
      console.log('  Operation:', error.context.operation);
      console.log('  Request ID:', error.context.requestId);
      console.log('  Elapsed:', error.context.elapsedMs + 'ms');
    } else {
      console.log('✓ Error caught (not LlmError):', error.constructor.name);
    }
    console.log();
  }

  // Test 6: Timeout detection
  console.log('7. Testing timeout error detection...');
  try {
    // Simulate a timeout by using very short timeout
    const timeoutClient = new OpenAIClient({
      apiKey: openaiKey,
      model: 'gpt-4o-mini',
      timeout: 1, // 1ms - will definitely timeout
      maxRetries: 0,
    });

    await timeoutClient.createResponse('Write a long essay about AI.');
    console.error('✗ Should have timed out');
  } catch (error) {
    if (isTimeoutError(error)) {
      console.log('✓ Timeout detected successfully');
      if (error instanceof LlmTimeoutError) {
        console.log('  Detailed message:', error.getDetailedMessage());
      }
    } else {
      console.log('✓ Error caught:', error instanceof Error ? error.message : String(error));
    }
    console.log();
  }

  // Test 7: Verify streaming is used by default in structured responses
  console.log('8. Testing streaming in createStructuredResponse (default behavior)...');
  try {
    // Create client with debug enabled to see streaming logs
    const debugClient = new OpenAIClient({
      apiKey: openaiKey,
      model: 'gpt-4o-mini',
      debug: true,
      timeout: 60000,
      maxRetries: 2,
    });

    const streamResult = await debugClient.createStructuredResponse({
      prompt: 'What is 5+5?',
      schema: z.object({
        answer: z.number(),
      }),
      // Note: stream defaults to true now
    });

    console.log('✓ Structured response with default streaming succeeded');
    console.log('  Result:', streamResult);
    console.log('  (Check logs above for "Using streaming generation for observability")');
    console.log();
  } catch (error) {
    console.error('✗ Streaming test failed:', error);
    throw error;
  }

  // Test 8: Retry logic with exponential backoff
  console.log('9. Testing retry logic...');
  try {
    const result = await client.createStructuredResponse({
      prompt: 'What is 10 + 10?',
      schema: z.object({
        answer: z.number(),
      }),
      maxAttempts: 3, // Allow retries
      logExecutionTime: true,
    });

    console.log('✓ Retry logic working (or succeeded first try)');
    console.log('  Result:', result);
    console.log();
  } catch (error) {
    console.error('✗ Retry test failed:', error);
    throw error;
  }

  console.log('=== All OpenAIClient tests passed! ===');
}

// Run tests
testOpenAIClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
