---
"@sprqvntrs/llm": minor
---

feat(llm): add automatic retry with exponential backoff for transient errors

All clients now default to 3 retry attempts (up from 1) with exponential backoff for transient errors. Added `isRetryableError()` classifier that retries on timeouts, 5xx server errors, 429 rate limits, and generic transient errors while immediately failing on non-retryable errors (validation, config, truncation, JSON parse, 4xx client errors). Improved error context extraction from SDK errors (errorCode, errorType, providerRequestId). Added missing retry loop to Anthropic client.
