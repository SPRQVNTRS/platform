/**
 * Timing and performance helper functions
 */

/**
 * Measures the execution time of a synchronous or asynchronous function.
 *
 * Wraps a function call and returns both its result and the time taken
 * to execute in milliseconds. Useful for performance profiling and logging.
 *
 * @typeParam T - The return type of the function being measured
 * @param fn - The function to measure (can be sync or async)
 * @returns A tuple containing [result, executionTimeMs]
 *
 * @example
 * ```typescript
 * // Measure a synchronous function
 * const [sum, timeMs] = await measureExecutionTime(() => {
 *   return Array.from({ length: 1000000 }, (_, i) => i).reduce((a, b) => a + b, 0);
 * });
 * console.log(`Sum: ${sum}, took ${timeMs}ms`);
 *
 * // Measure an async function
 * const [data, fetchTime] = await measureExecutionTime(async () => {
 *   const response = await fetch('https://api.example.com/data');
 *   return response.json();
 * });
 * console.log(`Fetched ${data.length} items in ${fetchTime}ms`);
 *
 * // Use with existing async functions
 * const [user, queryTime] = await measureExecutionTime(() => db.users.findOne({ id: 123 }));
 * if (queryTime > 100) {
 *   console.warn(`Slow query: ${queryTime}ms`);
 * }
 * ```
 */
export async function measureExecutionTime<T>(fn: () => T | Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  const executionTime = end - start;

  return [result, executionTime];
}
