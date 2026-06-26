/**
 * Locale-aware number formatting helper functions.
 *
 * A thin wrapper around `Intl.NumberFormat` that produces locale-correct decimal
 * and grouping separators on both server and client. Mirrors the API of the
 * `remix-lcc` `useNumberFormat` hook so that server-side content rendering and
 * scripts produce identical output without requiring a React context.
 *
 * ### Accepted locale values
 *
 * The `locale` parameter accepts any value that `Intl.NumberFormat` understands:
 * - Short IANA subtag: `'en'`, `'de'`, `'fr'`
 * - Full BCP-47 tag: `'de-DE'`, `'fr-FR'`, `'es-ES'`
 *
 * Both forms are equivalent — `Intl` normalises them internally.
 *
 * ### Decimal and grouping separator reference
 *
 * | Locale              | Example output       |
 * |---------------------|----------------------|
 * | `en` / `en-US`      | `1,234.56` (comma group, period decimal) |
 * | `de` / `es` / `it` / `nl` | `1.234,56` (period group, comma decimal) |
 * | `fr` / `fr-FR`      | `1 234,56` (narrow no-break space group, comma decimal) |
 *
 * @module number
 */

/**
 * Re-export of `Intl.NumberFormatOptions` for consumers that want to type
 * options objects without importing from `lib.es2015.intl.d.ts` directly.
 */
export type NumberFormatOptions = Intl.NumberFormatOptions;

/**
 * Formats a number using the given locale and optional `Intl.NumberFormat` options.
 *
 * This is the lowest-level formatter — it delegates directly to `Intl.NumberFormat`
 * with no opinion on precision. Use the higher-level helpers (`formatDecimal`,
 * `formatInteger`, `formatSmart`) for consistent precision behaviour.
 *
 * **Collapse behaviour:** passing `{ maximumFractionDigits: 1 }` both localises
 * the decimal separator AND silently rounds very small values to zero
 * (e.g. `0.001` → `"0"`). This is the intended behaviour for the LCC content
 * pipeline, where trace nutrient amounts should display as `"0"` rather than
 * scientific notation.
 *
 * @param value - The number to format
 * @param locale - IANA locale subtag (`'de'`) or BCP-47 tag (`'de-DE'`)
 * @param options - Optional `Intl.NumberFormat` options (precision, style, etc.)
 * @returns The locale-formatted string
 *
 * @example
 * ```typescript
 * formatNumber(1234.56, 'en');
 * // => '1,234.56'
 *
 * formatNumber(1234.56, 'de');
 * // => '1.234,56'
 *
 * formatNumber(3.6, 'de', { maximumFractionDigits: 1 });
 * // => '3,6'
 *
 * // Collapse: maximumFractionDigits rounds 0.001 to "0"
 * formatNumber(0.001, 'en', { maximumFractionDigits: 1 });
 * // => '0'
 * ```
 */
export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats a number with a fixed number of decimal places using the given locale.
 *
 * Both `minimumFractionDigits` and `maximumFractionDigits` are set to `decimals`,
 * so trailing zeros are always preserved (e.g. `5` → `'5.0'` at one decimal place).
 *
 * @param value - The number to format
 * @param locale - IANA locale subtag (`'de'`) or BCP-47 tag (`'de-DE'`)
 * @param decimals - Number of decimal places to show (default `1`)
 * @returns The locale-formatted string with exactly `decimals` fraction digits
 *
 * @example
 * ```typescript
 * formatDecimal(5, 'en', 1);
 * // => '5.0'
 *
 * formatDecimal(5, 'de', 1);
 * // => '5,0'
 *
 * formatDecimal(3.14159, 'en', 2);
 * // => '3.14'
 * ```
 */
export function formatDecimal(value: number, locale: string, decimals: number = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Rounds a number to the nearest integer and formats it with no decimal places.
 *
 * Grouping separators are applied according to the locale (e.g. `1300` → `'1.300'`
 * in German, `'1,300'` in English).
 *
 * @param value - The number to format (will be rounded with `Math.round`)
 * @param locale - IANA locale subtag (`'de'`) or BCP-47 tag (`'de-DE'`)
 * @returns The locale-formatted integer string
 *
 * @example
 * ```typescript
 * formatInteger(52.7, 'de');
 * // => '53'
 *
 * formatInteger(1300, 'de');
 * // => '1.300'
 *
 * formatInteger(1300, 'en');
 * // => '1,300'
 * ```
 */
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

/**
 * Formats a number with magnitude-based precision using the given locale.
 *
 * Selects the number of decimal places based on the raw (non-absolute) value,
 * matching the precision thresholds of the `remix-lcc` `useNumberFormat` hook:
 *
 * | Value range | Decimal places | Example (`en`) |
 * |-------------|----------------|----------------|
 * | `>= 100`    | 0 (integer)    | `250` → `'250'` |
 * | `>= 10`     | 1              | `42.37` → `'42.4'` |
 * | `>= 1`      | 2              | `4.378` → `'4.38'` |
 * | `>= 0.01`   | 3              | `0.045` → `'0.045'` |
 * | `< 0.01`    | 4              | `0.0012` → `'0.0012'` |
 *
 * @param value - The number to format
 * @param locale - IANA locale subtag (`'de'`) or BCP-47 tag (`'de-DE'`)
 * @returns The locale-formatted string with magnitude-appropriate precision
 *
 * @example
 * ```typescript
 * formatSmart(250, 'en');    // => '250'
 * formatSmart(42.37, 'en'); // => '42.4'
 * formatSmart(4.378, 'en'); // => '4.38'
 * formatSmart(0.045, 'en'); // => '0.045'
 * formatSmart(0.0012, 'en'); // => '0.0012'
 * ```
 */
export function formatSmart(value: number, locale: string): string {
  if (value >= 100) return formatInteger(value, locale);
  if (value >= 10) return formatDecimal(value, locale, 1);
  if (value >= 1) return formatDecimal(value, locale, 2);
  if (value >= 0.01) return formatDecimal(value, locale, 3);
  return formatDecimal(value, locale, 4);
}
