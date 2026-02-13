---
"@sprqvntrs/llm": patch
---

fix(llm): resolve JSON Schema $ref/$defs for Gemini models

Gemini models do not support `$ref`/`$defs` in JSON Schema, causing structured output
requests to fail with "reference to undefined schema" errors when Zod schemas contain
shared object references. Added a post-processing step that inlines all `$ref` pointers
and converts `anyOf` nullable patterns to `{ nullable: true }` for Gemini compatibility.
Non-Gemini models are unaffected.
