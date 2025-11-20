---
"@sprqvntrs/llm": patch
---

Replace tiny-invariant dependency with inline error checking

Removed the `tiny-invariant` external dependency and replaced its usage with inline error checks. This reduces bundle size and external dependencies without changing any functionality.
