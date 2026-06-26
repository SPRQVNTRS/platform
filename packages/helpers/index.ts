/**
 * @sprqvntrs/helpers
 *
 * Common helper utilities for the SPRQVNTRS platform.
 *
 * @packageDocumentation
 */

// =============================================================================
// Environment Helpers
// =============================================================================

export { requireEnv, optionalEnv, optionalBoolEnv, optionalIntEnv } from './src/env';

// =============================================================================
// String Helpers
// =============================================================================

export { slugify, normalizeEuropeanChars, generateRandomString } from './src/string';

// =============================================================================
// Date Helpers
// =============================================================================

export { slugifyDate, daysAgo } from './src/date';

// =============================================================================
// Timing Helpers
// =============================================================================

export { measureExecutionTime } from './src/timing';

// =============================================================================
// Number Helpers
// =============================================================================

export { formatNumber, formatDecimal, formatInteger, formatSmart } from './src/number';
export type { NumberFormatOptions } from './src/number';
