---
"@sprqvntrs/llm": minor
---

feat(llm): surface upstream provider error message in `LlmApiError`

Non-2xx provider failures previously surfaced as a bare `API error (status <code>)` with no actionable reason — the provider's structured error body was dropped by the error-wrapping layer. `wrapSdkError` now extracts the upstream message and threads it into `LlmApiError`:

- `LlmApiError` gains `providerMessage`, `providerCode`, and raw `body` fields, and includes the provider message in `.message` (e.g. `API error (status 403): Key limit exceeded (monthly limit)`).
- New exported `extractProviderError()` helper and `LlmApiErrorDetails` interface pull the reason from common SDK shapes (`@openrouter/sdk` typed subclasses, raw JSON `body`, axios-style `response.data`).
- No breaking change: the existing `statusCode` contract and error class hierarchy are unchanged; the new constructor argument is optional.
