---
"@sprqvntrs/llm": minor
---

feat(llm): bump SDKs and add support for gpt-5.5, gpt-5.5-pro, claude-opus-4-7, claude-sonnet-4-6

- Bump `@anthropic-ai/sdk` to 0.91.1 — `claude-opus-4-7` and `claude-sonnet-4-6` are now exposed via `AnthropicModel`.
- Bump `openai` to 6.35.0. The SDK has not yet added `gpt-5.5` / `gpt-5.5-pro` to `ChatModel`, so `OpenAIModel` is extended with literal types until they ship.
- Bump `@openrouter/sdk` to 0.12.22. Adapt the OpenRouter client to the new SDK shape (`chatGenerationParams` → `chatRequest`) and wire `maxRetries` through to the SDK's `retryConfig` so small `timeoutMs` values are no longer masked by default backoff retries.
- Refresh `pricing-data.json` and add the new model IDs to the sync map.
