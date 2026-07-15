/**
 * Tests for calculateUsageCost pricing lookups (GitHub issues #20 and #12).
 *
 * Verifies that:
 *  - gpt-5.4-mini pricing is present and correct (regression for issue #12)
 *  - the gpt-5.6 family (terra/luna/sol + pro variants) resolves under both the
 *    openai/-prefixed OpenRouter id and the bare native id
 *  - pro variants price identically to their base models
 *  - unknown models return null
 *
 * NOTE: the bare gpt-5.6 keys are materialized in src/pricing-data.json when
 * sync-pricing is re-run after the MODEL_MAP change; these tests assume they exist.
 */

import { describe, it, expect } from 'vitest';
import { calculateUsageCost } from '../src/pricing';
import type { ModelConfig } from '../index';

// ── helper ───────────────────────────────────────────────────────────────────

const ONE_MILLION = 1_000_000;

interface Rates {
  input: number;
  output: number;
  cached: number;
}

/**
 * Resolves the per-million input/output/cached rates for a model by feeding
 * exactly 1M tokens through calculateUsageCost so each cost equals its rate.
 */
function ratesFor(model: string): Rates | null {
  const io = calculateUsageCost(model, ONE_MILLION, ONE_MILLION, 0);
  const cachedOnly = calculateUsageCost(model, ONE_MILLION, 0, ONE_MILLION);
  if (!io || !cachedOnly) return null;
  return { input: io.input, output: io.output, cached: cachedOnly.cachedInput };
}

// ── correct per-million rates per model key ──────────────────────────────────

const CASES: ReadonlyArray<{ model: string; input: number; output: number; cached: number }> = [
  // gpt-5.4-mini regression (issue #12)
  { model: 'openai/gpt-5.4-mini', input: 0.75, output: 4.5, cached: 0.075 },
  // gpt-5.6-terra — prefixed + bare + pro variants
  { model: 'openai/gpt-5.6-terra', input: 2.5, output: 15, cached: 0.25 },
  { model: 'gpt-5.6-terra', input: 2.5, output: 15, cached: 0.25 },
  { model: 'openai/gpt-5.6-terra-pro', input: 2.5, output: 15, cached: 0.25 },
  { model: 'gpt-5.6-terra-pro', input: 2.5, output: 15, cached: 0.25 },
  // gpt-5.6-luna — prefixed + bare + pro variants
  { model: 'openai/gpt-5.6-luna', input: 1, output: 6, cached: 0.1 },
  { model: 'gpt-5.6-luna', input: 1, output: 6, cached: 0.1 },
  { model: 'openai/gpt-5.6-luna-pro', input: 1, output: 6, cached: 0.1 },
  { model: 'gpt-5.6-luna-pro', input: 1, output: 6, cached: 0.1 },
  // gpt-5.6-sol — prefixed + bare + pro variants
  { model: 'openai/gpt-5.6-sol', input: 5, output: 30, cached: 0.5 },
  { model: 'gpt-5.6-sol', input: 5, output: 30, cached: 0.5 },
  { model: 'openai/gpt-5.6-sol-pro', input: 5, output: 30, cached: 0.5 },
  { model: 'gpt-5.6-sol-pro', input: 5, output: 30, cached: 0.5 },
];

describe('calculateUsageCost — gpt-5.4-mini and gpt-5.6 family rates', () => {
  it.each(CASES)(
    '$model → input $input/M, output $output/M, cached $cached/M',
    ({ model, input, output, cached }) => {
      const rates = ratesFor(model);
      expect(rates).not.toBeNull();
      expect(rates!.input).toBeCloseTo(input, 6);
      expect(rates!.output).toBeCloseTo(output, 6);
      expect(rates!.cached).toBeCloseTo(cached, 6);
    },
  );
});

// ── pro variants price identically to their base models ──────────────────────

describe('calculateUsageCost — pro variants match their base models', () => {
  it.each([
    { base: 'openai/gpt-5.6-terra', pro: 'openai/gpt-5.6-terra-pro' },
    { base: 'openai/gpt-5.6-luna', pro: 'openai/gpt-5.6-luna-pro' },
    { base: 'openai/gpt-5.6-sol', pro: 'openai/gpt-5.6-sol-pro' },
  ])('$pro rates equal $base rates', ({ base, pro }) => {
    const baseRates = ratesFor(base);
    const proRates = ratesFor(pro);
    expect(baseRates).not.toBeNull();
    expect(proRates).not.toBeNull();
    expect(proRates!.input).toBeCloseTo(baseRates!.input, 6);
    expect(proRates!.output).toBeCloseTo(baseRates!.output, 6);
    expect(proRates!.cached).toBeCloseTo(baseRates!.cached, 6);
  });
});

// ── unknown model → null ─────────────────────────────────────────────────────

describe('calculateUsageCost — unknown model', () => {
  it('returns null for an unrecognized model id', () => {
    expect(calculateUsageCost('this-model-does-not-exist', 1000, 1000)).toBeNull();
  });
});

// ── type-level: gpt-5.6-terra is a valid OpenAI ModelConfig ───────────────────

// Compile-time assertion (erased at runtime): a consumer configuring the new
// model must typecheck against the package's public ModelConfig surface.
const _gpt56TerraModelConfig = {
  provider: 'openai',
  model: 'gpt-5.6-terra',
} satisfies ModelConfig<'openai'>;
void _gpt56TerraModelConfig;
