import 'dotenv/config';
import { AnthropicClient } from '../src/clients/anthropic-client.js';
import { OpenAIClient } from '../src/clients/openai-client.js';
import { OpenRouterClient } from '../src/clients/openrouter-client.js';

const PROMPT = 'Reply with exactly the single word: pong.';

async function probe(label: string, fn: () => Promise<string>): Promise<void> {
  process.stdout.write(`${label} ... `);
  try {
    const out = await fn();
    console.log(`✓ "${out.trim().slice(0, 60)}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${message.slice(0, 200)}`);
  }
}

async function main(): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!anthropicKey || !openaiKey || !openrouterKey) {
    throw new Error('Missing one of ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY in env');
  }

  console.log('--- Anthropic native ---');
  for (const model of ['claude-opus-4-7', 'claude-sonnet-4-6'] as const) {
    const client = new AnthropicClient({ apiKey: anthropicKey, model, timeout: 30000, maxRetries: 0 });
    await probe(model, () => client.createResponse(PROMPT));
  }

  console.log('\n--- OpenAI native ---');
  for (const model of ['gpt-5.5', 'gpt-5.5-pro'] as const) {
    const client = new OpenAIClient({ apiKey: openaiKey, model, timeout: 60000, maxRetries: 0 });
    await probe(model, () => client.createResponse(PROMPT));
  }

  console.log('\n--- OpenRouter (provider/model form) ---');
  for (const model of [
    'anthropic/claude-opus-4.7',
    'anthropic/claude-sonnet-4.6',
    'openai/gpt-5.5',
    'openai/gpt-5.5-pro',
  ]) {
    const client = new OpenRouterClient({ apiKey: openrouterKey, model, timeout: 60000, maxRetries: 0 });
    await probe(model, () => client.createResponse(PROMPT));
  }
}

main().catch((error: unknown) => {
  console.error('Fatal:', error);
  process.exit(1);
});
