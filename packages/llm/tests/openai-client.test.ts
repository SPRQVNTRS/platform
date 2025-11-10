import 'dotenv/config';
import { z } from 'zod/v3';
import { OpenAIClient } from '../src/clients/openai-client.js';

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

  // Initialize client
  console.log('1. Initializing OpenAIClient...');
  const client = new OpenAIClient(
    openaiKey,
    'gpt-4o-mini',
    true // debug mode
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

  // Test 2: Structured output with nested objects
  console.log('3. Testing structured output with nested objects...');
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

  console.log('=== All OpenAIClient tests passed! ===');
}

// Run tests
testOpenAIClient().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
