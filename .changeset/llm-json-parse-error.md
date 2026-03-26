---
"@sprqvntrs/llm": minor
---

feat(llm): add LlmJsonParseError for silent JSON truncation detection

New `LlmJsonParseError` class surfaces when models return invalid JSON despite `finish_reason: 'stop'`. Includes raw content, content length, and finish reason metadata for debugging. Retries are skipped for these errors since the same prompt produces the same truncation.
