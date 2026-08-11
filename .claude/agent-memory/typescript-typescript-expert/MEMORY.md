# TypeScript Expert Memory — platform monorepo

- [Project stack](project-stack.md) — pnpm monorepo, packages/llm, vitest unit tests, tsx e2e scripts
- [Vitest config pattern](vitest-config-pattern.md) — explicit include allow-list; never widen glob
- [JSON imports](json-imports.md) — ES2022 module mode: plain imports work (resolveJsonModule); assert/with attributes both fail
- [ipaddr.js normalization](ipaddr-normalization.md) — use toRFC5952String() for compressed IPv6; toNormalizedString() returns expanded form
