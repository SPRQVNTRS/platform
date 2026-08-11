---
name: llm-pkg-verification-commands
description: Verified typecheck/test commands for @sprqvntrs/llm, and the tsx-e2e vs vitest split that makes `pnpm test` ≠ `pnpm test:unit`
metadata:
  type: project
---

In `packages/llm` there is **no `typecheck` script**. Use:
`toolbox run -c ts-dev env CI=true npx tsc --noEmit` (tsconfig `include` is `src/**/*` only, tests excluded).

`pnpm test` and `pnpm test:unit` are different suites and NOT interchangeable:
- `pnpm test:unit` → vitest, offline, safe to run any time.
- `pnpm test` → `tsx tests/*-client.test.ts`, **live upstream API calls** needing keys in `packages/llm/.env`. Costs money.

`vitest.config.ts` uses an explicit allow-list `include`, not a glob. A new vitest file is
**silently not run** until added to that list — the run still reports green.

**Why:** the tsx e2e scripts call `process.exit` and have no describe/it, so vitest counts them
as failures; the allow-list is deliberate (comment in the config says so).

**How to apply:** when adding unit tests here, add the filename to `vitest.config.ts` `include`
and confirm the file appears in the per-file `✓ tests/...` output — a passing summary alone
does not prove your file ran. Never reach for `pnpm test` to verify a type-level change.

Related: [[llm-openrouter-reasoning-effort]]
