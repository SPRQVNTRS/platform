---
name: vitest-config-pattern
description: The vitest include allow-list in packages/llm is intentional and must stay explicit
metadata:
  type: feedback
---

`packages/llm/vitest.config.ts` uses an explicit `include` array, not a glob. This is intentional.

**Why:** The `tests/` directory contains both real vitest unit tests AND tsx-style e2e integration scripts (e.g., `openrouter-client.test.ts`). The e2e scripts call `process.exit`, have no `describe`/`it` blocks, and hit live APIs — vitest treats them as failures if included.

**How to apply:** When adding a new vitest unit test, add its path explicitly to the `include` array. Never replace the array with `'tests/**/*.test.ts'` or similar widened glob. See [[project-stack]] for the run command.
