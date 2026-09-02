# @sprqvntrs/logger

## 1.0.1

### Patch Changes

- 8a7a9e5: Relicensed to MIT and published to npmjs.com via trusted publishing; no code change.

## 1.0.0

### Major Changes

- b7a801a: fix(logger)!: make pretty printing opt-in instead of auto-enabled in dev (#13)

  **Breaking change.** `createLogger` (and the `createServerLogger` / `createWorkerLogger` presets) no longer auto-enables the `pino-pretty` transport when `NODE_ENV !== 'production'`. The `pretty` option now defaults to `false`, and consumers who want pretty output must:
  1. Install `pino-pretty` as a dev dependency in their application
  2. Pass `pretty: true` explicitly (e.g. `pretty: process.env.NODE_ENV !== 'production'`)

  This resolves the mismatch where `pino-pretty` was declared as an _optional_ peer dependency but was _required_ by the default code path — causing `Error: unable to determine transport target for "pino-pretty"` whenever a consumer's package manager hadn't incidentally hoisted it (#13).

  **Migration:** if you relied on automatic pretty output in development, add `pino-pretty` to your devDependencies and pass `pretty: true` in your logger setup. Otherwise no change is needed — JSON output continues to work everywhere.

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
