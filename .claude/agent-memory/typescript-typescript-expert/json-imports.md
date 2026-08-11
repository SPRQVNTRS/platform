---
name: json-imports
description: ES2022 module mode in platform packages — plain JSON imports work, assert/with both fail
metadata:
  type: feedback
---

With `"module": "ES2022"` and `resolveJsonModule: true` in tsconfig:

- `import data from './file.json'` — works
- `import data from './file.json' assert { type: 'json' }` — TS2821 error
- `import data from './file.json' with { type: 'json' }` — TS2823 error

Both import assertions and import attributes require `module: esnext/node18/node20/nodenext/preserve`.

**Why:** The platform tsconfig uses `"module": "ES2022"` which predates these features in TS's module output modes.

**How to apply:** When importing JSON in any `packages/*` file, use plain imports without any assertion/attribute.
