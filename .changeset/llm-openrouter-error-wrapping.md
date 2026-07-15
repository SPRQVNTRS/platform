---
"@sprqvntrs/llm": patch
---

fix(llm): route non-streaming OpenRouter errors through wrapSdkError. `createRawResponse` (and `createResponse`, which delegates to it) now wrap SDK failures in enriched `LlmApiError`/`LlmError` subclasses carrying status code, provider message/code, and full error context instead of leaking the bare `Error: Provider returned error`. Transient provider errors (5xx/429) are correctly classified retryable by `isRetryableError` (fixes #19)
