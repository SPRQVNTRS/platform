---
"@sprqvntrs/llm": minor
---

feat(llm): make "reasoning off" expressible via `reasoningEffort: 'none'`

Adds `'none'` to the normalized reasoning effort union and, for the first time,
actually transmits the effort to OpenRouter.

- New shared `ReasoningEffortLevel` type (`'none' | 'low' | 'medium' | 'high'`),
  exported from the package root and used by all three clients plus
  `LlmClientInterface`.
- `OpenRouterClient.createStructuredResponse` now sends
  `reasoning: { effort }` on **both** the streaming and non-streaming request
  paths. Previously the parameter was accepted, logged, and silently discarded.
- The parameter's `'low'` default was removed, so transmission is strictly
  opt-in: omitting `reasoningEffort` sends no `reasoning` field at all and
  leaves the provider default untouched. Without this, every existing
  OpenRouter caller would have started receiving `effort: 'low'`.
- `AnthropicClient` treats `'none'` the same as omitted — extended thinking is
  opt-in there, so no thinking block is sent.
- `OpenAIClient` already spread `reasoning: { effort }` when a value was
  present; only the accepted union widened.

No behaviour changes for existing callers.
