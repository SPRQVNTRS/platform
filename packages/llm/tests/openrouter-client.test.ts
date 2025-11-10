import 'dotenv/config';
import { z } from 'zod/v3';
import { OpenRouterClient } from '../src/clients/openrouter-client.js';

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

  // Initialize client
  console.log('1. Initializing OpenRouterClient...');
  const client = new OpenRouterClient(
    openrouterKey,
    'openai/gpt-5-mini',
    true, // debug mode
    openaiKey,
  );
  console.log('✓ Client initialized successfully\n');

  // Test 1: Basic structured response
  console.log('2. Testing basic structured response...');
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

  // Test 2: Structured output with array
  console.log('3. Testing structured output with array...');
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

  console.log('=== All OpenRouterClient tests passed! ===');
}

// Run tests
testOpenRouterClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
