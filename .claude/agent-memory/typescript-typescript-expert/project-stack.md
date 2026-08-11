---
name: project-stack
description: Core tech stack and test commands for the platform monorepo
metadata:
  type: project
---

pnpm workspace monorepo. Publishable packages in `packages/`. Main LLM package: `@sprqvntrs/llm`.

**Typecheck command**: `pnpm exec tsc --noEmit -p packages/llm/tsconfig.json` (from repo root). Emits only .npmrc warnings — those are harmless.

**Unit tests**: `pnpm --filter @sprqvntrs/llm exec vitest run` — runs only files in the explicit `include` allow-list in `packages/llm/vitest.config.ts`.

**E2E/integration tests**: `pnpm --filter @sprqvntrs/llm test` — runs tsx scripts against live providers. Requires API keys in `packages/llm/.env`. These are not vitest files; do NOT add them to the vitest include list.

**Why:** The tests/ directory mixes true vitest unit tests and tsx-style e2e scripts. The vitest config uses an explicit allow-list to keep them separate.

**How to apply:** When adding a new vitest test, add it to the `include` array in `packages/llm/vitest.config.ts` by name. Never widen the glob.
