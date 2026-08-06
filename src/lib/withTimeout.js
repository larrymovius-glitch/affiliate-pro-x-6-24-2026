/**
 * Wraps a promise so it rejects with a clear error if it takes too long,
 * instead of hanging forever. This is what prevents the "spinner never
 * stops" bug: any await that never resolves or rejects will never let
 * your try/catch/finally run, so loading state gets stuck as `true`.
 *
 * Usage:
 *   const result = await withTimeout(
 *     base44.integrations.Core.InvokeLLM({ ... }),
 *     45000,
 *     "Post generation"
 *   );
 */
export function withTimeout(promise, ms = 45000, label = "Request") {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Please try again.`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
