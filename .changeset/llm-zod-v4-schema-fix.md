---
"@sprqvntrs/llm": patch
---

fix(llm): fix structured output JSON schema generation by migrating to zod v4

All source files now import from `zod/v4` instead of the v3 compat shim, giving schemas the `_zod` property required by the OpenAI SDK's v4 detection. The vendored `zodToJsonSchema` import in `openrouter-client.ts` is replaced with native `z.toJSONSchema()` plus a `toStrictJsonSchema` post-processor that recursively enforces `additionalProperties: false` and `required` on all object schemas. Both OpenAI and OpenRouter paths now send proper JSON schemas for structured output enforcement.
