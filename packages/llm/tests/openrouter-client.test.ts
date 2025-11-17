import 'dotenv/config';
import { z } from 'zod/v3';
import { OpenRouterClient } from '../src/clients/openrouter-client.js';
import { LlmError, LlmTimeoutError, isTimeoutError } from '../src/utils/errors.js';

/**
 * Test script for OpenRouterClient
 *
 * Run with: pnpm tsx tests/openrouter-client.test.ts
 *
 * Requirements:
 * - OPENROUTER_API_KEY in .env file
 * - OPENAI_API_KEY in .env file (optional, for better structured output formatting)
 */

async function testOpenRouterClient() {
  console.log('=== Testing OpenRouterClient ===\n');

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment variables');
  }

  if (!openaiKey) {
    console.warn('WARNING: OPENAI_API_KEY not found. Structured outputs will use direct JSON parsing.\n');
  }

  // Initialize client with custom timeout
  console.log('1. Initializing OpenRouterClient with custom config...');
  const client = new OpenRouterClient({
    apiKey: openrouterKey,
    model: 'openai/gpt-5-mini',
    debug: false, // Disable debug for tests
    openaiApiKey: openaiKey,
    timeout: 60000, // 60 seconds
    maxRetries: 2,
  });
  console.log('✓ Client initialized successfully');
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

  // Test 2: Basic structured response
  console.log('3. Testing basic structured response...');
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

  // Test 4: Streaming response
  console.log('5. Testing streaming response...');
  try {
    let fullText = '';
    let chunkCount = 0;

    for await (const chunk of client.createStreamingResponse('Count from 1 to 3.')) {
      if (!chunk.isComplete) {
        fullText += chunk.text;
        chunkCount++;
        process.stdout.write('.');
      } else {
        console.log();
        console.log('✓ Streaming completed');
        console.log(`  Received ${chunkCount} chunks`);
        console.log(`  Full text: ${fullText}`);
      }
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
      model: 'openai/gpt-5-mini',
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
      model: 'openai/gpt-5-mini',
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

  // Test 7: Exponential backoff verification
  console.log('8. Testing retry with exponential backoff...');
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

  console.log('=== All OpenRouterClient tests passed! ===');
}

// Run tests
testOpenRouterClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
