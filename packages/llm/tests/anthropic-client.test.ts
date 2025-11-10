import 'dotenv/config';
import { z } from 'zod/v3';
import { AnthropicClient } from '../src/clients/anthropic-client.js';

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

  // Initialize client
  console.log('1. Initializing AnthropicClient...');
  const client = new AnthropicClient(anthropicKey, 'claude-haiku-4-5-20251001', openaiKey);
  console.log('✓ Client initialized successfully\n');

  // Test 1: Basic structured response
  console.log('2. Testing basic structured response...');
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

  // Test 2: With reasoning effort (to test thinking mode)
  console.log('3. Testing with reasoning effort (thinking mode)...');
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

  console.log('=== All AnthropicClient tests passed! ===');
}

// Run tests
testAnthropicClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
