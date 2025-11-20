---
"@sprqvntrs/llm": minor
---

Enhance LLM clients with configurable timeouts, retries, and native structured outputs

- Add timeout and maxRetries support to all LLM clients with per-request override capabilities
- AnthropicClient: Add extended thinking support with budget_tokens configuration
- OpenRouterClient: Migrate to native structured outputs using Zod-to-JSON-Schema conversion
- OpenAIClient: Enhanced streaming with retry logic and execution time tracking
- Improve error context tracking with timeout and operation metadata
