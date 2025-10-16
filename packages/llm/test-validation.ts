#!/usr/bin/env tsx
/**
 * Test script to verify API key auto-detection and validation
 */

import { LLM } from './src/llm';
import { z } from 'zod/v3';

const TestSchema = z.object({
  message: z.string(),
  valid: z.boolean(),
});

async function testValidation() {
  console.log('Testing LLM client validation and auto-detection...\n');

  // Test 1: OpenAI client validation
  console.log('1. Testing OpenAI client validation:');
  try {
    const openaiClient = LLM.getClient('openai', 'gpt-4o-mini-2024-07-18');
    const isValid = openaiClient.validateConfiguration();
    console.log(`   ✅ OpenAI client validated: ${isValid}`);
  } catch (error) {
    console.error(`   ❌ OpenAI validation failed: ${error}`);
  }

  // Test 2: Anthropic client validation with auto-detection
  console.log('\n2. Testing Anthropic client with auto-detected OpenAI key:');
  try {
    const anthropicClient = LLM.getClient('anthropic', 'claude-3-5-sonnet-20241022');
    const isValid = anthropicClient.validateConfiguration();
    console.log(`   ✅ Anthropic client validated: ${isValid}`);
    console.log('   Note: Check console for warnings about OpenAI formatter availability');
  } catch (error) {
    console.error(`   ❌ Anthropic validation failed: ${error}`);
  }

  // Test 3: Test structured output with Anthropic
  console.log('\n3. Testing Anthropic structured output (requires both API keys):');
  if (process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) {
    try {
      const anthropicClient = LLM.getClient('anthropic', 'claude-3-5-sonnet-20241022');
      const result = await anthropicClient.createStructuredResponse({
        prompt: 'Generate a simple test message saying "API keys are properly configured"',
        schema: TestSchema,
        reasoningEffort: 'low',
      });
      console.log(`   ✅ Structured output successful:`, result);
    } catch (error) {
      console.error(`   ❌ Structured output failed:`, error);
    }
  } else {
    console.log('   ⚠️  Skipping test - requires both ANTHROPIC_API_KEY and OPENAI_API_KEY');
  }

  // Test 4: Check environment variables
  console.log('\n4. Environment variable status:');
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`);
}

// Run tests
testValidation().catch(console.error);
