---
"@sprqvntrs/llm": patch
---

Move zod to peerDependencies and upgrade @openrouter/sdk to 0.5.1.

Since z.ZodType is exposed in the public API via LlmClientInterface, zod
should be a peerDependency to ensure consumers share the same instance
and avoid type mismatches. @openrouter/sdk upgraded from 0.1.3 (Jan 2024)
to 0.5.1 (Feb 2026) for bug fixes and improvements.
