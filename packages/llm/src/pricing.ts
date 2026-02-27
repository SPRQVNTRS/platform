import pricingData from './pricing-data.json';
import type { LlmUsageCost } from './types/client-interface';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = pricingData.models;

export function calculateUsageCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens?: number,
): LlmUsageCost | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;

  const cached = cachedTokens ?? 0;
  const nonCachedInput = promptTokens - cached;

  const inputCost = (nonCachedInput / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  const cachedInputCost = pricing.cachedInputPerMillion
    ? (cached / 1_000_000) * pricing.cachedInputPerMillion
    : 0;

  return {
    input: inputCost,
    output: outputCost,
    cachedInput: cachedInputCost,
    total: inputCost + cachedInputCost + outputCost,
  };
}
