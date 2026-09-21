/**
 * Reading the signup flow's step, and waiting on it.
 *
 * On the web this is one `getAttribute` - the step is an attribute VALUE, so one query returns
 * whatever it happens to be. A native driver has no such read: a `testID` is a name, and the only
 * question it answers is "is an element called this on screen?". So the current step has to be
 * PROBED: ask about each of the twelve contract ids until one says yes. That is why these three
 * functions ship here rather than being left to the host - the native version of "which step is it
 * on?" is a loop over a set the host would otherwise have to keep in step with this package by hand.
 *
 * Copy is not what any of this keys on, and that is the other half of the point: every label the
 * component renders comes from `labels.ts` and hosts reword them freely, so a wait on a heading
 * reads a rewording as a hang.
 */

import { WW_SIGNUP_STEPS, type WwSignupStep } from './ids';
import type { WwStepReader, WwWaitOptions } from './driver';
import { pollUntil } from './poll';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 100;

/**
 * The step the signup view is on, or null when none of the twelve is on screen.
 *
 * Probes in `WW_SIGNUP_STEPS` order and stops at the first hit, so the common answers cost a couple
 * of reads and only "nothing is mounted" costs all twelve.
 *
 * **Null is an answer, not a failure.** The view reports no step at all when a signed-in visitor is
 * being told there is nothing to sign up for, and a driver pointed at a screen that has not mounted
 * the component yet reports the same thing. Both are things a suite legitimately observes.
 *
 * **If two steps were somehow on screen, the earlier in `WW_SIGNUP_STEPS` wins** - the fixed order
 * is there to make that deterministic rather than to make it right. It cannot happen inside one
 * mounted view, which renders one frame carrying one step id at a time; it happens when a driver
 * sees two Wildwood surfaces at once, and the cure is a driver scoped to one of them rather than a
 * reader that polices the invariant at the cost of twelve reads per call. Sheets are not a source of
 * this: a pack or payment sheet is named `modal:packs` / `modal:payment`, which is what those
 * prefixes are for.
 */
export async function currentSignupStep(driver: WwStepReader): Promise<WwSignupStep | null> {
  for (const step of WW_SIGNUP_STEPS) {
    if (await driver.exists(step)) return step;
  }
  return null;
}

/**
 * Wait for the signup flow to reach one named step.
 *
 * Asks about the ONE id it is waiting for while it waits, and pays for the full probe only when it
 * is about to fail. A native probe is twelve round trips; spending them on every poll would make
 * waiting on a step slower than the step.
 */
export async function waitForSignupStep(
  driver: WwStepReader,
  step: WwSignupStep,
  options: WwWaitOptions = {},
): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS } = options;
  await pollUntil(
    () => driver.exists(step),
    timeoutMs,
    intervalMs,
    async () => {
      // "Timed out" on its own reads as the product hanging. What it was on instead is usually the
      // whole diagnosis - `register` means the form was never submitted, `failed` means it was.
      //
      // This probe is a fresh read taken after the deadline has passed, so it can legitimately come
      // back with the very step being waited for: the flow landed in the window between the last
      // poll and this read. Saying "never reached X - it is on X" in one breath would be worse than
      // saying nothing, so that case gets its own sentence. It still FAILS - the wait did exceed
      // the bound it was given - but it names the cause as a deadline that was too short rather
      // than sending someone looking for a hang that is not there.
      const seen = await currentSignupStep(driver).catch(() => null);
      if (seen === step) {
        return `the signup reached the "${step}" step, but only after this gave up - it landed while the wait was failing, so raise timeoutMs rather than looking for a hang`;
      }
      return `the signup never reached the "${step}" step - it is on "${seen ?? '(no step on screen)'}"`;
    },
  );
}

/**
 * Wait for the signup flow to LEAVE a named step.
 *
 * The step being GONE is the condition, which sounds obvious and is the trap: a reader that cannot
 * really see the step returns true on its first poll, and a caller that retries a `failed` step then
 * re-reads the same failure and burns its retry budget on it - passing all the way through as a
 * helper that works. So this waits on the absence rather than on anything else being present, and a
 * step that never goes away fails loudly.
 */
export async function waitForSignupStepToLeave(
  driver: WwStepReader,
  step: WwSignupStep,
  options: WwWaitOptions = {},
): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS } = options;
  await pollUntil(
    async () => !(await driver.exists(step)),
    timeoutMs,
    intervalMs,
    () => `the signup stayed on the "${step}" step`,
  );
}
