# @sprqvntrs/helpers

Common helper utilities for the SPRQVNTRS platform: date, environment, number, string
and timing helpers.

## Install

```bash
pnpm add @sprqvntrs/helpers
```

## Usage

```ts
import { requireEnv, formatNumber } from '@sprqvntrs/helpers';
```

See `src/` for the full surface.

## Raw TypeScript

This package ships raw TypeScript (`main` and `types` point at `index.ts`), so a Vite
consumer (Vite, React Router, Remix) must add the scope to `ssr.noExternal`:
`ssr: { noExternal: [/^@sprqvntrs\//] }`.

## License

MIT
