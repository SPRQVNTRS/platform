---
"@sprqvntrs/wp-rest": minor
---

feat(wp-rest): add `unwrapParagraph` utility for sanitizing agentic block content

Agentic consumers sometimes wrap `core/paragraph` content in `<p>` tags, causing Gutenberg block validation errors. The new `unwrapParagraph` export strips the outer `<p>` wrapper when present, allowing consumers to sanitize content before passing it to `createBlock` or `updateBlock`.
