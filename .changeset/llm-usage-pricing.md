---
"@sprqvntrs/llm": minor
---

feat(llm): enrich lastUsage with model name and calculated cost

Added auto-generated pricing data from OpenRouter's API and enriched `LlmTokenUsage` with `model` (string) and `cost` (LlmUsageCost | null) fields. Consumers can now access `client.lastUsage.cost.total` directly instead of maintaining their own pricing tables. New exports: `MODEL_PRICING`, `calculateUsageCost`, `ModelPricing`, `LlmUsageCost`.
