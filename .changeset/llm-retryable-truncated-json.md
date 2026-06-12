---
"@sprqvntrs/llm": minor
---

feat(llm): treat truncated/empty-response JSON parse errors as retryable

`LlmJsonParseError` now exposes `isLikelyTruncation`; `isRetryableError()` returns true for parse errors that look like transient truncation (finish_reason missing/unknown and the content is empty or fails with "Unexpected end of JSON input"). Complete-but-malformed responses (`finish_reason: stop`) remain non-retryable.
