import type { Page } from '@playwright/test';
import { untilValue } from './poll.js';

/**
 * The step hooks the Registration & Subscription component publishes, and the readers for them.
 *
 * Copy moves between releases — the plan step's heading went from "Choose Your Plan" to "Choose a
 * plan", and every label in `labels.ts` is host-configurable — but the step NAMES do not move. A
 * spec that waits on a heading reads a reworded heading as a hang, so everything here keys on
 * `data-ww-step` / `data-ww-view` instead.
 *
 * `@playwright/test` is imported for TYPES ONLY; see `poll.ts` for why.
 */

/** Every value the signup view's step container puts in `data-ww-step`. */
export type SignupStep =
  | 'loading'
  | 'closed'
  | 'register'
  | 'token'
  | 'plan'
  | 'packs'
  | 'payment'
  | 'creating'
  | 'disclaimers'
  | 'packCheckout'
  | 'success'
  | 'failed';

/** Every value the manage view's root puts in `data-ww-step` during a plan change. */
export type ManageStep =
  | 'idle'
  | 'previewing'
  | 'confirm'
  | 'collectingPayment'
  | 'changing'
  | 'authenticating'
  | 'completing'
  | 'done'
  | 'failed';

const signupBox = (page: Page) => page.locator('[data-ww-view="signup"] [data-ww-step]').first();
const manageBox = (page: Page) => page.locator('[data-ww-view="manage"]').first();

/** The signup step on screen, or null before the component has painted. */
export function signupStep(page: Page): Promise<string | null> {
  return signupBox(page)
    .getAttribute('data-ww-step')
    .catch(() => null);
}

/** Wait for the signup flow to reach one named step. */
export async function waitForSignupStep(page: Page, step: SignupStep, timeout = 30_000): Promise<void> {
  await untilValue(
    () => signupStep(page),
    (current) => current === step,
    timeout,
    (last) => `the signup never reached the "${step}" step — it is on "${last ?? '(not rendered)'}"`,
  );
}

/** Wait for the signup flow to LEAVE a named step. */
export async function waitForSignupStepToLeave(page: Page, step: SignupStep, timeout = 30_000): Promise<void> {
  await untilValue(
    () => signupStep(page),
    (current) => current !== step,
    timeout,
    () => `the signup stayed on the "${step}" step`,
  );
}

/** The manage view's plan-change step, or null before it has painted. */
export function manageStep(page: Page): Promise<string | null> {
  return manageBox(page)
    .getAttribute('data-ww-step')
    .catch(() => null);
}

/** Wait for the manage view's plan change to reach one named step. */
export async function waitForManageStep(page: Page, step: ManageStep, timeout = 90_000): Promise<void> {
  await untilValue(
    () => manageStep(page),
    (current) => current === step,
    timeout,
    (last) => `the plan change never reached "${step}" — it is on "${last ?? '(not rendered)'}"`,
  );
}

/**
 * Wait for the plan change to reach any one of several steps, and say which it reached.
 *
 * Needed because legitimate outcomes diverge: a priced option with no trial is charged while the
 * card is collected, so a refusal never leaves `collectingPayment`, while a trial saves the card
 * and the prorated charge is confirmed later, so a refusal lands on `failed`. A spec that assumed
 * one of those would be wrong half the time.
 */
export async function waitForAnyManageStep(
  page: Page,
  steps: readonly ManageStep[],
  timeout = 90_000,
): Promise<ManageStep> {
  const reached = await untilValue(
    () => manageStep(page),
    (current) => current !== null && (steps as readonly string[]).includes(current),
    timeout,
    (last) => `the plan change never reached any of [${steps.join(', ')}] — it is on "${last ?? '(not rendered)'}"`,
  );
  return reached as ManageStep;
}

/** Records the steps a signup actually passed through, in order. */
export interface SignupStepRecorder {
  /** Every step entered so far, repeats collapsed. */
  steps: () => Promise<string[]>;
  /** Assert a step was never entered (e.g. `plan` and `payment` on a token grant). */
  expectNeverEntered: (step: SignupStep) => Promise<void>;
}

/**
 * Start recording step transitions. Call this BEFORE the first navigation.
 *
 * A spec can only prove a step never happened by watching throughout — polling after the fact
 * cannot tell "never entered" from "entered and left". The observer is installed as an init
 * script so it is running before the component mounts.
 */
export async function recordSignupSteps(page: Page): Promise<SignupStepRecorder> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __wwSignupSteps: string[] }).__wwSignupSteps = seen;
    const record = () => {
      const box = document.querySelector('[data-ww-view="signup"] [data-ww-step]');
      const step = box?.getAttribute('data-ww-step');
      // Collapse repeats: React re-renders the same step many times over, and the only interesting
      // question is which steps were entered and in what order.
      if (step && seen[seen.length - 1] !== step) seen.push(step);
    };
    const start = () => {
      record();
      // The whole document, because the component's root mounts long after this runs and React
      // swaps the step container out rather than only editing its attribute.
      new MutationObserver(record).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-ww-step'],
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  });

  const steps = () => page.evaluate(() => (window as unknown as { __wwSignupSteps?: string[] }).__wwSignupSteps ?? []);

  return {
    steps,
    expectNeverEntered: async (step: SignupStep) => {
      const entered = await steps();
      if (entered.includes(step)) {
        throw new Error(
          `the signup entered the "${step}" step but should not have — steps seen: ${entered.join(' → ')}`,
        );
      }
    },
  };
}
