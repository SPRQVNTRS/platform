---
name: llm-openrouter-reasoning-effort
description: OpenRouterClient has TWO request paths (streaming default + non-streaming); any chatRequest field must be added to both or the fix is a no-op in production
metadata:
  type: project
---

`OpenRouterClient.createStructuredResponse` composes its `chatRequest` in **two separate
places**: `createStreamingResponseInternal` (used when `stream = true`, which is the
**default**) and an inline `client.chat.send({ chatRequest })` in the `else` branch.

**Why:** a request field added to only the non-streaming literal reads as correct in review
but never ships, because virtually all real traffic takes the streaming path. This exact
trap was called out when `reasoning.effort` was added (2026-08-11) — the param had been
accepted, logged, and discarded since introduction.

**How to apply:** when threading any new `chatRequest` field through this client, edit both
sites and write one test per path. `tests/openrouter-reasoning-effort.test.ts` is the
template: stub the private `client` with a fake `chat.send` that records `chatRequest` and
returns an async generator for `stream: true` / a plain object otherwise. Verify each test
discriminates by mutating one path at a time — a streaming-only regression must leave the
non-streaming test green and vice versa.

Second rule from the same change: **a param that was previously never transmitted must not
keep its old default when you start transmitting it.** Dropping `reasoningEffort = 'low'`
to `undefined` was required so downstream consumers (SHW / tgl / lowcarbcheck) did not
silently start receiving `effort: 'low'`. Keep an explicit "omitted → field absent" test as
the regression guard.

Related: [[llm-pkg-verification-commands]]
