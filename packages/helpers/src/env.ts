/**
 * Environment variable helper functions
 */

/**
 * Ensures a required environment variable exists
 * @throws Error if the environment variable is not set
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Please ensure ${key} is set in your .env file or environment.`,
    );
  }
  return value;
}

/**
 * Gets an optional environment variable with a default value
 */
export function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Gets an optional boolean environment variable
 */
export function optionalBoolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Gets an optional integer environment variable.
 *
 * Parses the environment variable as a base-10 integer.
 * Returns the default value if the variable is not set or cannot be parsed.
 *
 * @param key - The environment variable name
 * @param defaultValue - The value to return if the variable is not set or invalid
 * @returns The parsed integer or the default value
 *
 * @example
 * ```typescript
 * const port = optionalIntEnv('PORT', 3000);
 * // => 8080 if PORT=8080, or 3000 if not set
 *
 * const workers = optionalIntEnv('WORKER_COUNT', 4);
 * // => 4 if WORKER_COUNT is not set or invalid
 * ```
 */
export function optionalIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
