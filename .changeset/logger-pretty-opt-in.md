---
"@sprqvntrs/logger": major
---

fix(logger)!: make pretty printing opt-in instead of auto-enabled in dev (#13)

**Breaking change.** `createLogger` (and the `createServerLogger` / `createWorkerLogger` presets) no longer auto-enables the `pino-pretty` transport when `NODE_ENV !== 'production'`. The `pretty` option now defaults to `false`, and consumers who want pretty output must:

1. Install `pino-pretty` as a dev dependency in their application
2. Pass `pretty: true` explicitly (e.g. `pretty: process.env.NODE_ENV !== 'production'`)

This resolves the mismatch where `pino-pretty` was declared as an *optional* peer dependency but was *required* by the default code path — causing `Error: unable to determine transport target for "pino-pretty"` whenever a consumer's package manager hadn't incidentally hoisted it (#13).

**Migration:** if you relied on automatic pretty output in development, add `pino-pretty` to your devDependencies and pass `pretty: true` in your logger setup. Otherwise no change is needed — JSON output continues to work everywhere.
