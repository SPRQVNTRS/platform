---
"@sprqvntrs/wp-rest": major
---

feat(wp-rest)!: update delphi block API for wp-delphi v1.1.x

BREAKING CHANGES:

- All block methods (`getBlocks`, `getBlock`, `updateBlock`, `deleteBlock`) now take `id: number` (post ID) instead of `slug: string` as the second parameter
- `updateBlock` 4th parameter changed from `content: any` to `{ content?: any; attrs?: Record<string, any> }` — at least one of `content` or `attrs` is required
- PATCH content for core blocks must now be an object: `{ text: "..." }` for paragraph/heading, `{ html: "..." }` for table

New features:

- `updateBlock` now supports `attrs` for ACF block updates (deep-merged via `array_replace_recursive`)
- All block error responses now include the response body for better debugging of 422 errors
