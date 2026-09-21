/**
 * The few assertions these helpers need, without importing anything at runtime.
 *
 * Everything here could be written with `expect` from `@playwright/test`, and originally was. It is
 * not, because that made the built module carry a RUNTIME import of Playwright — and a consumer that
 * resolves a different copy of Playwright than its own test runner (any monorepo, any workspace with
 * a nested install) crashes on "Playwright was loaded twice" before a single assertion runs. With
 * only `import type`, the built file has no imports at all, works with any Playwright version, and
 * needs no peer dependency to function.
 *
 * Failures still have to read like assertion failures rather than timeouts, so every wait takes a
 * message describing what it was waiting for.
 */

/** Poll `check` until it returns true, or throw with `message()`. */
export async function until(
  check: () => Promise<boolean> | boolean,
  timeout: number,
  message: () => string,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error(`${message()} (waited ${Math.round(timeout / 1000)}s)`);
    await sleep(intervalMs);
  }
}

/** Poll `read` until its value satisfies `predicate`, then return it. Reports the last value seen. */
export async function untilValue<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeout: number,
  message: (last: T) => string,
  intervalMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let last = await read();
  for (;;) {
    if (predicate(last)) return last;
    if (Date.now() >= deadline) {
      throw new Error(`${message(last)} (waited ${Math.round(timeout / 1000)}s)`);
    }
    await sleep(intervalMs);
    last = await read();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
