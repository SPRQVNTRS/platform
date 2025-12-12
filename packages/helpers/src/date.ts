/**
 * Date manipulation helper functions
 */

/**
 * Formats a date string to a URL-friendly slug format (YYYY-MM-DD).
 *
 * Parses the input date and returns it in ISO date format,
 * suitable for use in URLs, filenames, or database queries.
 *
 * @param date - A date string parseable by `new Date()`
 * @returns The date formatted as YYYY-MM-DD
 *
 * @example
 * ```typescript
 * slugifyDate('2024-03-15T10:30:00Z');
 * // => '2024-03-15'
 *
 * slugifyDate('March 15, 2024');
 * // => '2024-03-15'
 *
 * slugifyDate('2024/03/15');
 * // => '2024-03-15'
 * ```
 */
export function slugifyDate(date: string): string {
  const dateObj = new Date(date);
  return dateObj.toISOString().split('T')[0]!;
}

/**
 * Calculates the number of days between a given date and today.
 *
 * Returns a positive number for dates in the past, representing
 * how many days ago the date occurred.
 *
 * @param date - A date string parseable by `new Date()`
 * @returns The number of whole days between the date and now
 *
 * @example
 * ```typescript
 * // If today is 2024-03-15:
 * daysAgo('2024-03-10');
 * // => 5
 *
 * daysAgo('2024-03-14');
 * // => 1
 *
 * daysAgo('2024-03-15');
 * // => 0
 * ```
 */
export function daysAgo(date: string): number {
  const now = new Date();
  const fixtureDate = new Date(date);
  const diff = now.getTime() - fixtureDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
