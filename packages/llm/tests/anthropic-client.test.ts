import 'dotenv/config';
import { z } from 'zod/v4';
import { AnthropicClient } from '../src/clients/anthropic-client.js';
import { LlmError, isTimeoutError } from '../src/utils/errors.js';

/**
 * Test script for AnthropicClient
 *
 * Run with: pnpm tsx tests/anthropic-client.test.ts
 *
 * Requirements:
 * - ANTHROPIC_API_KEY in .env file
 * - OPENAI_API_KEY in .env file (for structured output formatting)
 */

async function testAnthropicClient() {
  console.log('=== Testing AnthropicClient ===\n');

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not found in environment variables');
  }

  if (!openaiKey) {
    console.warn('WARNING: OPENAI_API_KEY not found. Structured outputs will be less reliable.\n');
  }

  // Initialize client with custom timeout
  console.log('1. Initializing AnthropicClient with custom config...');
  const client = new AnthropicClient({
    apiKey: anthropicKey,
    model: 'claude-haiku-4-5-20251001',
    openaiApiKey: openaiKey,
    debug: false, // Disable debug for tests
    timeout: 60000, // 60 seconds
    maxRetries: 2,
  });
  console.log('✓ Client initialized successfully');
  console.log('  Timeout: 60s, Max Retries: 2\n');

  // Test 1: Basic raw response
  console.log('2. Testing basic raw response...');
  try {
    const textResponse = await client.createResponse('What is the capital of France? Answer briefly.');

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
    reasoning: z.string(),
  });

  try {
    const result = await client.createStructuredResponse({
      prompt: 'What is 15 * 23? Explain your calculation.',
      schema,
      logExecutionTime: true,
    });

    console.log('✓ Response:', result);
    console.log();
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }

  // Test 3: With reasoning effort (to test thinking mode)
  console.log('4. Testing with reasoning effort (thinking mode)...');
  try {
    const reasoningResult = await client.createStructuredResponse({
      prompt: 'List two benefits of TypeScript.',
      schema: z.object({
        benefits: z.array(z.string()),
      }),
      reasoningEffort: 'medium',
      logExecutionTime: true,
    });

    console.log('✓ Reasoning response:', reasoningResult);
    console.log();
  } catch (error) {
    console.error('✗ Reasoning test failed:', error);
    throw error;
  }

  // Test 4: Streaming response with usage tracking
  console.log('5. Testing streaming response with usage tracking...');
  try {
    let fullText = '';
    let chunkCount = 0;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    for await (const chunk of client.createStreamingResponse('Tell me a short joke.')) {
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

  // Test 5: Error handling
  console.log('6. Testing error handling with invalid API key...');
  try {
    const badClient = new AnthropicClient({
      apiKey: 'invalid-key-12345',
      model: 'claude-haiku-4-5-20251001',
      openaiApiKey: openaiKey,
      timeout: 5000,
    });

    await badClient.createResponse('Test');
    console.error('✗ Should have thrown an error');
  } catch (error) {
    if (error instanceof LlmError) {
      console.log('✓ Caught LlmError with context');
      console.log('  Client Type:', error.context.clientType);
      console.log('  Model:', error.context.model);
      console.log('  Request ID:', error.context.requestId);
    } else {
      console.log('✓ Error caught:', error.constructor.name);
    }
    console.log();
  }

  // Test 6: Verify streaming is used by default in structured responses
  console.log('7. Testing streaming in createStructuredResponse (default behavior)...');
  try {
    // Create client with debug enabled to see streaming logs
    const debugClient = new AnthropicClient({
      apiKey: anthropicKey,
      model: 'claude-haiku-4-5-20251001',
      openaiApiKey: openaiKey,
      debug: true,
      timeout: 60000,
      maxRetries: 2,
    });

    const streamResult = await debugClient.createStructuredResponse({
      prompt: 'What is 7+3?',
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

  // Test 7: Request correlation IDs
  console.log('8. Testing request correlation IDs...');
  try {
    console.log('  Making multiple requests to verify unique IDs...');
    const promises = [
      client.createResponse('Say hi'),
      client.createResponse('Say hello'),
    ];

    await Promise.all(promises);
    console.log('✓ Multiple requests completed (check logs for correlation IDs)');
    console.log();
  } catch (error) {
    console.error('✗ Correlation ID test failed:', error);
    throw error;
  }

  console.log('=== All AnthropicClient tests passed! ===');
}

// Run tests
testAnthropicClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
