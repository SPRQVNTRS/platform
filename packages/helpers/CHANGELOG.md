# @sprqvntrs/helpers

## 0.2.0

### Minor Changes

- 3ac1f64: feat(helpers): add locale-aware number formatting helpers

  Add `formatNumber`, `formatDecimal`, `formatInteger`, and `formatSmart` — thin
  `Intl.NumberFormat` wrappers that produce locale-correct decimal and grouping
  separators (en `1,234.56`; de/es/it/nl `1.234,56`; fr `1 234,56`). Locale may be a
  short code (`'de'`) or a full BCP-47 tag (`'de-DE'`).

  This gives server-side content rendering and scripts the same locale formatting
  previously available only via the remix-lcc React hook, so consumers can share a
  single source of truth. Passing `{ maximumFractionDigits: 1 }` to `formatNumber`
  both localizes the separator and collapses trace values (`0.001 → "0"`).

## 0.1.0

### Minor Changes

- ae902f1: Add new @sprqvntrs/helpers package with utility functions for:
  - Environment variables (requireEnv, optionalEnv, optionalBoolEnv, optionalIntEnv)
  - String manipulation (slugify, normalizeEuropeanChars, generateRandomString)
  - Date operations (slugifyDate, daysAgo)
  - Performance timing (measureExecutionTime)
