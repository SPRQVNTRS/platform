import { defineConfig } from 'vitest/config';

// NOTE: this package's existing `tests/*.test.ts` files are tsx-style e2e
// scripts run with `tsx`, not vitest suites. Keep `include` as an explicit
// allow-list of true vitest unit tests; do NOT widen to `tests/**/*.test.ts`
// without first migrating the e2e scripts (they call process.exit and have
// no describe/it blocks, so vitest treats them as failures).
export default defineConfig({
  test: {
    include: ['tests/strip-json-artifacts.test.ts'],
  },
});
