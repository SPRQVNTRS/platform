#!/usr/bin/env -S npx tsx
/**
 * Test script to verify web search functionality in the LLM package
 */

import { z } from 'zod/v3';
import { LLM, DEFAULT_MODELS } from './index';

// Test schema for web search results
const webSearchTestSchema = z.object({
  searchPerformed: z.boolean(),
  currentInfo: z.string().describe('Current information found through web search'),
  sources: z.array(z.string()).describe('Sources used for the information'),
});

async function testWebSearch() {
  console.log('Testing web search functionality...\n');

  // Test with OpenAI
  if (process.env.OPENAI_API_KEY) {
    console.log('Testing OpenAI with web search...');
    const { provider, model } = DEFAULT_MODELS.OPENAI_DEFAULT;
    const llm = LLM.getClient(provider, model);

    try {
      const result = await llm.createStructuredResponse({
        prompt: 'What are the latest updates about React Router 7 in 2025? Search the web for current information.',
        schema: webSearchTestSchema,
        useWebSearch: true,
        reasoningEffort: 'medium',
      });

      console.log('OpenAI Web Search Result:');
      console.log(JSON.stringify(result, null, 2));
      console.log('✅ OpenAI web search test passed\n');
    } catch (error) {
      console.error('❌ OpenAI web search test failed:', error);
    }
  } else {
    console.log('⚠️  Skipping OpenAI test - OPENAI_API_KEY not set\n');
  }

  // Test with Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('Testing Anthropic with web search...');
    const { provider, model } = DEFAULT_MODELS.ANTHROPIC_DEFAULT;
    const llm = LLM.getClient(provider, model, {
      openaiApiKey: process.env.OPENAI_API_KEY, // For structured output formatting
    });

    try {
      const result = await llm.createStructuredResponse({
        prompt: 'What are the current football injuries for Manchester United? Search the web for the latest information.',
        schema: webSearchTestSchema,
        useWebSearch: true,
      });

      console.log('Anthropic Web Search Result:');
      console.log(JSON.stringify(result, null, 2));
      console.log('✅ Anthropic web search test passed\n');
    } catch (error) {
      console.error('❌ Anthropic web search test failed:', error);
    }
  } else {
    console.log('⚠️  Skipping Anthropic test - ANTHROPIC_API_KEY not set\n');
  }

  console.log('Test completed!');
}

// Run the test if this file is executed directly
if (import.meta.url === import.meta.resolve('./test-web-search.ts')) {
  testWebSearch().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}