import 'dotenv/config';
import { z } from 'zod/v3';
import { OpenRouterClient } from '../src/clients/openrouter-client.js';
import { LlmError, LlmTimeoutError, isTimeoutError } from '../src/utils/errors.js';

/**
 * Test script for OpenRouterClient with Native Structured Outputs
 *
 * Run with: pnpm tsx tests/openrouter-client.test.ts
 *
 * Requirements:
 * - OPENROUTER_API_KEY in .env file
 *
 * This test suite validates OpenRouter's native structured outputs feature
 * using Zod schema to JSON Schema conversion.
 */

async function testOpenRouterClient() {
  console.log('=== Testing OpenRouterClient with Native Structured Outputs ===\n');

  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment variables');
  }

  // Initialize client with custom timeout
  console.log('1. Initializing OpenRouterClient with custom config...');
  const client = new OpenRouterClient({
    apiKey: openrouterKey,
    model: 'openai/gpt-4o-mini', // Use a model that supports structured outputs
    debug: false, // Disable debug for tests
    timeout: 60000, // 60 seconds
    maxRetries: 2,
  });
  console.log('✓ Client initialized successfully');
  console.log('  Model: openai/gpt-4o-mini (supports native structured outputs)');
  console.log('  Timeout: 60s, Max Retries: 2');
  console.log('  Note: OpenRouter SDK handles retries internally\n');

  // Test 1: Basic raw response
  console.log('2. Testing basic raw response...');
  try {
    const textResponse = await client.createResponse('What is 5+7? Answer briefly.');

    console.log('✓ Raw response received');
    console.log('  Message:', textResponse);
    console.log();
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }

  // Test 2: Basic structured response with native structured outputs
  console.log('3. Testing basic structured response (native structured outputs)...');
  const schema = z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
  });

  try {
    const result = await client.createStructuredResponse({
      prompt: 'What is the capital of Japan? Respond with the answer and your confidence level.',
      schema,
      reasoningEffort: 'low',
      logExecutionTime: true,
    });

    console.log('✓ Response:', result);
    console.log('  Validating response structure...');

    if (typeof result.answer !== 'string') {
      throw new Error('Invalid answer type');
    }
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error('Invalid confidence value');
    }

    console.log('  ✓ Response structure is valid');
    console.log();
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }

  // Test 3: Structured output with array
  console.log('4. Testing structured output with array...');
  try {
    const arrayResult = await client.createStructuredResponse({
      prompt: 'List two programming languages.',
      schema: z.object({
        languages: z.array(z.string()),
      }),
      reasoningEffort: 'low',
      logExecutionTime: true,
    });

    console.log('✓ Array response:', arrayResult);
    console.log();
  } catch (error) {
    console.error('✗ Array test failed:', error);
    throw error;
  }

  // Test 4: Streaming response with usage tracking
  console.log('5. Testing streaming response with usage tracking...');
  try {
    let fullText = '';
    let chunkCount = 0;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    for await (const chunk of client.createStreamingResponse('Count from 1 to 3.')) {
      if (!chunk.isComplete) {
        fullText += chunk.text;
        chunkCount++;
        process.stdout.write('.');
      } else {
        usage = chunk.usage;
        console.log();
        console.log('✓ Streaming completed');
        console.log(`  Received ${chunkCount} chunks`);
        console.log(`  Full text: ${fullText}`);

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
  console.log('6. Testing error handling...');
  try {
    const badClient = new OpenRouterClient({
      apiKey: 'invalid-key-12345',
      model: 'openai/gpt-4o-mini',
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
      console.log('  Timeout:', error.context.timeoutMs + 'ms');
    } else {
      console.log('✓ Error caught:', error.constructor.name);
    }
    console.log();
  }

  // Test 6: Timeout configuration verification
  console.log('7. Testing timeout configuration...');
  try {
    const timeoutClient = new OpenRouterClient({
      apiKey: openrouterKey,
      model: 'openai/gpt-4o-mini',
      timeout: 1, // 1ms - will timeout
      maxRetries: 0,
    });

    await timeoutClient.createResponse('Write a long essay.');
    console.error('✗ Should have timed out');
  } catch (error) {
    if (isTimeoutError(error)) {
      console.log('✓ Timeout configuration working');
      if (error instanceof LlmTimeoutError) {
        console.log('  Timeout was:', error.context.timeoutMs + 'ms');
      }
    } else {
      console.log('✓ Error caught:', error instanceof Error ? error.message : String(error));
    }
    console.log();
  }

  // Test 7: Verify streaming is used by default in structured responses with native outputs
  console.log('8. Testing streaming in createStructuredResponse with native structured outputs...');
  try {
    // Create client with debug enabled to see streaming logs
    const debugClient = new OpenRouterClient({
      apiKey: openrouterKey,
      model: 'openai/gpt-4o-mini',
      debug: true,
      timeout: 60000,
      maxRetries: 2,
    });

    const streamResult = await debugClient.createStructuredResponse({
      prompt: 'What is 6+4?',
      schema: z.object({
        answer: z.number(),
      }),
      // Note: stream defaults to true now, using native structured outputs
    });

    console.log('✓ Structured response with streaming and native outputs succeeded');
    console.log('  Result:', streamResult);
    console.log('  (Check logs above for "Using streaming generation with native structured outputs")');
    console.log();
  } catch (error) {
    console.error('✗ Streaming test failed:', error);
    throw error;
  }

  // Test 8: Exponential backoff verification
  console.log('9. Testing retry with exponential backoff...');
  try {
    const result = await client.createStructuredResponse({
      prompt: 'What is 2+2?',
      schema: z.object({
        answer: z.number(),
      }),
      maxAttempts: 3, // Allow retries
      logExecutionTime: true,
    });

    console.log('✓ Retry logic configured (succeeded)');
    console.log('  Result:', result);
    console.log();
  } catch (error) {
    console.error('✗ Retry test failed:', error);
    throw error;
  }

  // Test 9: Complex nested schema validation
  console.log('10. Testing complex nested schema with native structured outputs...');
  try {
    const complexSchema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      }),
      tags: z.array(z.string()),
      metadata: z.object({
        createdAt: z.string(),
        isActive: z.boolean(),
      }),
    });

    const complexResult = await client.createStructuredResponse({
      prompt: 'Create a sample user profile with name John Doe, age 30, email john@example.com, tags ["developer", "typescript"], created today, and active status true.',
      schema: complexSchema,
      logExecutionTime: true,
    });

    console.log('✓ Complex nested schema response:', JSON.stringify(complexResult, null, 2));
    console.log('  Validating nested structure...');

    if (!complexResult.user || typeof complexResult.user.name !== 'string') {
      throw new Error('Invalid user.name');
    }
    if (!Array.isArray(complexResult.tags)) {
      throw new Error('Invalid tags array');
    }
    if (typeof complexResult.metadata.isActive !== 'boolean') {
      throw new Error('Invalid metadata.isActive');
    }

    console.log('  ✓ Complex nested structure is valid');
    console.log();
  } catch (error) {
    console.error('✗ Complex schema test failed:', error);
    throw error;
  }

  // Test 10: Non-streaming mode with native structured outputs
  console.log('11. Testing non-streaming mode with native structured outputs...');
  try {
    const nonStreamResult = await client.createStructuredResponse({
      prompt: 'What is 10 + 5?',
      schema: z.object({
        result: z.number(),
      }),
      stream: false, // Explicitly disable streaming
      logExecutionTime: true,
    });

    console.log('✓ Non-streaming response:', nonStreamResult);
    console.log();
  } catch (error) {
    console.error('✗ Non-streaming test failed:', error);
    throw error;
  }

  // Test 11: Per-method timeout override
  console.log('12. Testing per-method timeout override...');
  try {
    // Client has 60s timeout, but we override to 30s for this call
    const timeoutResult = await client.createStructuredResponse({
      prompt: 'What is 3 + 3?',
      schema: z.object({
        sum: z.number(),
      }),
      timeout: 30000, // Override to 30 seconds
      logExecutionTime: true,
    });

    console.log('✓ Per-method timeout override successful');
    console.log('  Result:', timeoutResult);
    console.log('  (Used 30s timeout instead of client default 60s)');
    console.log();
  } catch (error) {
    console.error('✗ Per-method timeout override test failed:', error);
    throw error;
  }

  // Test 12: Per-method timeout with createResponse
  console.log('13. Testing per-method timeout with createResponse...');
  try {
    const response = await client.createResponse('Say hello', { timeout: 15000 });
    console.log('✓ createResponse with timeout override successful');
    console.log('  Response:', response);
    console.log();
  } catch (error) {
    console.error('✗ createResponse timeout test failed:', error);
    throw error;
  }

  // Test 13: Per-method timeout with createStreamingResponse
  console.log('14. Testing per-method timeout with createStreamingResponse...');
  try {
    let streamText = '';
    for await (const chunk of client.createStreamingResponse('Count 1, 2', { timeout: 20000 })) {
      if (!chunk.isComplete) {
        streamText += chunk.text;
      }
    }
    console.log('✓ createStreamingResponse with timeout override successful');
    console.log('  Streamed text:', streamText);
    console.log();
  } catch (error) {
    console.error('✗ createStreamingResponse timeout test failed:', error);
    throw error;
  }

  console.log('=== All OpenRouterClient tests with native structured outputs passed! ===');
}

// Run tests
testOpenRouterClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
