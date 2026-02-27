/**
 * Fetches model pricing from OpenRouter and writes src/pricing-data.json.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-pricing.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
}

interface OpenRouterModel {
  id: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

interface PricingDataFile {
  $schema: string;
  updatedAt: string;
  models: Record<string, ModelPricing>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

/** Maps native SDK model IDs to their OpenRouter equivalents. */
const MODEL_MAP: Record<string, string> = {
  // OpenAI
  'gpt-5-nano-2025-08-07': 'openai/gpt-5-nano',
  'gpt-5-mini-2025-08-07': 'openai/gpt-5-mini',
  'gpt-5.2-2025-12-11': 'openai/gpt-5.2',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  // Anthropic
  'claude-opus-4-6': 'anthropic/claude-opus-4.6',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
  'claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-4.5',
  'claude-opus-4-5-20251101': 'anthropic/claude-opus-4.5',
  'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
};

/** Pricing for models not available on OpenRouter. */
const MANUAL_OVERRIDES: Record<string, ModelPricing> = {
  'text-embedding-3-large': { inputPerMillion: 0.13, outputPerMillion: 0 },
};

// Build a reverse map: OpenRouter ID -> native ID(s)
const REVERSE_MAP = new Map<string, string[]>();
for (const [nativeId, openRouterId] of Object.entries(MODEL_MAP)) {
  const existing = REVERSE_MAP.get(openRouterId) ?? [];
  existing.push(nativeId);
  REVERSE_MAP.set(openRouterId, existing);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePricing(model: OpenRouterModel): ModelPricing | undefined {
  const p = model.pricing;
  if (!p?.prompt || !p?.completion) return undefined;

  const inputPerMillion = parseFloat(p.prompt) * 1_000_000;
  const outputPerMillion = parseFloat(p.completion) * 1_000_000;

  if (Number.isNaN(inputPerMillion) || Number.isNaN(outputPerMillion)) {
    return undefined;
  }

  const pricing: ModelPricing = { inputPerMillion, outputPerMillion };

  if (p.input_cache_read) {
    const cached = parseFloat(p.input_cache_read) * 1_000_000;
    if (!Number.isNaN(cached) && cached > 0) {
      pricing.cachedInputPerMillion = cached;
    }
  }

  return pricing;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Fetching models from ${OPENROUTER_API_URL} ...`);

  const response = await fetch(OPENROUTER_API_URL);
  if (!response.ok) {
    throw new Error(
      `OpenRouter API returned ${response.status}: ${response.statusText}`,
    );
  }

  const body = (await response.json()) as OpenRouterResponse;
  const openRouterModels = body.data;

  if (!Array.isArray(openRouterModels)) {
    throw new Error('Unexpected API response: data is not an array');
  }

  console.log(`Received ${openRouterModels.length} models from OpenRouter.`);

  // Index OpenRouter models by ID for fast lookup
  const openRouterById = new Map<string, OpenRouterModel>();
  for (const model of openRouterModels) {
    openRouterById.set(model.id, model);
  }

  const models: Record<string, ModelPricing> = {};
  let mappedCount = 0;
  let allOpenRouterCount = 0;

  // 1. Write all OpenRouter models under their OpenRouter ID
  for (const model of openRouterModels) {
    const pricing = parsePricing(model);
    if (!pricing) continue;

    models[model.id] = pricing;
    allOpenRouterCount++;
  }

  // 2. Write MODEL_MAP entries: for each native ID, look up the OpenRouter
  //    model and write the same pricing under the native key.
  for (const [nativeId, openRouterId] of Object.entries(MODEL_MAP)) {
    const orModel = openRouterById.get(openRouterId);
    if (!orModel) {
      console.warn(
        `  WARN: OpenRouter model "${openRouterId}" not found (native: "${nativeId}")`,
      );
      continue;
    }

    const pricing = parsePricing(orModel);
    if (!pricing) {
      console.warn(
        `  WARN: No pricing data for "${openRouterId}" (native: "${nativeId}")`,
      );
      continue;
    }

    models[nativeId] = pricing;
    mappedCount++;
  }

  // 3. Apply manual overrides
  for (const [id, pricing] of Object.entries(MANUAL_OVERRIDES)) {
    models[id] = pricing;
  }

  const totalCount = Object.keys(models).length;

  // Build output
  const output: PricingDataFile = {
    $schema: 'Generated by scripts/sync-pricing.ts — do not edit manually',
    updatedAt: new Date().toISOString(),
    models,
  };

  // Resolve output path relative to this script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const outputPath = resolve(__dirname, '..', 'src', 'pricing-data.json');

  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  console.log(`\nWritten ${outputPath}`);
  console.log(
    `  ${allOpenRouterCount} OpenRouter models, ${mappedCount} native-mapped, ${Object.keys(MANUAL_OVERRIDES).length} manual overrides`,
  );
  console.log(`  ${totalCount} total entries`);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
