---
"@sprqvntrs/logger": minor
---

Add buffered logger feature with flush destinations for capturing and exporting logs during operation execution.

Features:
- `createBufferedLogger()`: Wraps any logger to both log normally and buffer entries
- Child loggers share parent's buffer for comprehensive operation-level logging
- Optional auto-flush when buffer reaches maximum size
- `jsonDestination()`: Serialize buffered logs to JSON with ISO timestamps
- Support for custom flush destinations

This enables workflow execution logging where logs are captured in-memory and can be flushed to storage on failure.
