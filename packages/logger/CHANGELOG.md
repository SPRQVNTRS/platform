# @sprqvntrs/logger

## 0.3.0

### Minor Changes

- 01841d1: Add buffered logger feature with flush destinations for capturing and exporting logs during operation execution.

  Features:
  - `createBufferedLogger()`: Wraps any logger to both log normally and buffer entries
  - Child loggers share parent's buffer for comprehensive operation-level logging
  - Optional auto-flush when buffer reaches maximum size
  - `jsonDestination()`: Serialize buffered logs to JSON with ISO timestamps
  - Support for custom flush destinations

  This enables workflow execution logging where logs are captured in-memory and can be flushed to storage on failure.

## 0.2.0

### Minor Changes

- 1b87a0a: Add @sprqvntrs/logger package - TypeScript logging built on Pino with structured logging, request tracing, AsyncLocalStorage context propagation, HTTP middleware, and testing utilities
