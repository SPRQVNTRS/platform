#!/usr/bin/env tsx
/**
 * Simple test to verify the refactored LLM implementation
 */

import { z } from 'zod/v4';
import { LLM } from './src/llm';
import { OpenAIClient } from './src/clients/openai-client';
import { AnthropicClient } from './src/clients/anthropic-client';

// Test schema
const TestSchema = z.object({
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
});

async function testOpenAIClient() {
  console.log('Testing OpenAI Client...');

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.log('OPENAI_API_KEY not set, skipping OpenAI test');
    return;
  }

  const client = new OpenAIClient(openaiKey, 'gpt-4o-mini-2024-07-18');

  try {
    // Test with low reasoning effort
    const resultLow = await client.createStructuredResponse({
      prompt: 'Generate a user profile for John Doe who is 30 years old and active',
      schema: TestSchema,
      reasoningEffort: 'low',
    });
    console.log('OpenAI Low effort result:', resultLow);

    // Test with high reasoning effort and retry logic (should work for compatible models)
    const resultHigh = await client.createStructuredResponse({
      prompt: 'Generate a user profile for Jane Smith who is 25 years old and inactive',
      schema: TestSchema,
      reasoningEffort: 'high',
      maxAttempts: 3,
    });
    console.log('OpenAI High effort result:', resultHigh);

    console.log('✅ OpenAI Client tests passed');
  } catch (error) {
    console.error('❌ OpenAI Client test failed:', error);
  }
}

async function testAnthropicClient() {
  console.log('\nTesting Anthropic Client...');

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey) {
    console.log('ANTHROPIC_API_KEY not set, skipping Anthropic test');
    return;
  }

  const client = new AnthropicClient(
    anthropicKey,
    'claude-3-5-sonnet-20241022',
    openaiKey, // Optional: use OpenAI for formatting
  );

  try {
    // Test with medium reasoning effort
    const result = await client.createStructuredResponse({
      prompt: 'Generate a user profile for Bob Johnson who is 45 years old and active',
      schema: TestSchema,
      reasoningEffort: 'medium',
    });
    console.log('Anthropic result:', result);

    // Test with retry logic
    const resultWithRetry = await client.createStructuredResponse({
      prompt: 'Generate a user profile for Alice Brown who is 35 years old and inactive',
      schema: TestSchema,
      reasoningEffort: 'high',
      maxAttempts: 2,
    });
    console.log('Anthropic with retry result:', resultWithRetry);

    console.log('✅ Anthropic Client tests passed');
  } catch (error) {
    console.error('❌ Anthropic Client test failed:', error);
  }
}

async function testLLMFactory() {
  console.log('\nTesting LLM Factory...');

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.log('OPENAI_API_KEY not set, skipping factory test');
    return;
  }

  try {
    const client = LLM.getClient('openai', 'gpt-4o-mini-2024-07-18');

    const result = await client.createStructuredResponse({
      prompt: 'Generate a user profile for Charlie Davis who is 28 years old and active',
      schema: TestSchema,
      reasoningEffort: 'low',
    });

    console.log('Factory result:', result);
    console.log('✅ LLM Factory tests passed');
  } catch (error) {
    console.error('❌ LLM Factory test failed:', error);
  }
}

async function main() {
  console.log('Starting LLM package refactor tests...\n');

  await testOpenAIClient();
  await testAnthropicClient();
  await testLLMFactory();

  console.log('\n✅ All tests completed');
}

// Run tests
main().catch(console.error);
