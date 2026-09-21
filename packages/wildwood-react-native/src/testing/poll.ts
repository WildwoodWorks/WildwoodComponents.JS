// The two polling primitives these helpers wait on, kept apart from what they wait FOR.
//
// They differ in what a deadline MEANS. `pollUntil` treats it as a failure and throws saying what it
// was waiting for; `settleUntil` treats it as an answer and reports it, for the waits where nothing
// appearing is a legitimate reading rather than a fault.
//
// Internal: nothing here is exported from `./index`. A host that wants to poll something of its own
// has its runner's own waiter for that, and this module exists so the helpers' bounded-failure
// semantics - a timeout that says what it was waiting for - live in one place rather than being
// re-typed per waiter.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `check` until it is true, or throw with `message()`.
 *
 * `check` is called before the deadline is consulted, so a condition that already holds returns
 * after exactly one read and never sleeps - which is what keeps a waiter cheap enough to put in
 * front of every step rather than only the slow ones.
 *
 * `message` is async because the diagnostic is itself a read of the app: saying what the flow is
 * actually on costs a probe, and one is worth paying for at the point of failure. It is called only
 * when the wait has already failed, so a driver that throws there costs nothing that was not
 * already lost.
 */
export async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
  message: () => string | Promise<string>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error(`${await message()} (waited ${formatWaited(timeoutMs)})`);
    await sleep(intervalMs);
  }
}

/**
 * Poll `check` until it is true, or until the deadline; answer which happened.
 *
 * The same loop as {@link pollUntil} without the throw, for the one wait that has no failure to
 * report: the disclaimer panel may legitimately have nothing to accept, and this package's
 * `DisclaimerComponent` puts no identifier on the panel it shows when the pending list came back
 * empty - so "no control appeared" and "there was nothing to accept" read exactly alike from a
 * driver. A waiter that threw on the deadline would fail every signup with no terms configured.
 */
export async function settleUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

/**
 * How long the wait was, in the unit that reads best.
 *
 * The web helpers round to whole seconds, which is right for their 30-120s defaults and wrong for
 * the short timeouts a host passes when it is asserting that something does NOT appear - "waited 0s"
 * reads as a bug in the helper rather than as the half-second that was asked for.
 */
function formatWaited(timeoutMs: number): string {
  return timeoutMs < 1_000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs / 1_000)}s`;
}
