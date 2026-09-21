/**
 * Driving the signup to the finish, and the one thing that reliably gets in its way: a pending
 * disclaimer.
 *
 * These are the native halves of `@wildwood/react/testing`'s `finishSignup` and `acceptDisclaimers`,
 * and they are here for the same reason those are: every host integrating this component writes the
 * same scaffolding, and gets the same handful of traps wrong the first time. Both keep the web's
 * BOUNDED-FAILURE shape - a loop that cannot converge gives up and says what it was still looking at,
 * rather than spinning until the runner's own timeout kills it and reports a hang with no cause.
 *
 * What is native about them is what they CANNOT do. A `WwDriver` asks about elements; it has no
 * response listener, so nothing here can watch the acceptance POST the way the web helper does. The
 * web names an HTTP 429 as the cause because it saw one. This names it as the usual cause because it
 * cannot see anything - which is still far better than a timeout, since a rate limit is what a
 * suite enrolling users in a loop actually hits.
 *
 * Nothing is located by copy. Every label these panels render comes from `labels.ts` and hosts reword
 * them freely, so a wait on a button's text reads a rewording as a hang.
 */

import { WW_IDS, type WwSignupStep } from './ids';
import type { WwDriver } from './driver';
import { pollUntil, settleUntil, sleep } from './poll';
import { currentSignupStep, waitForSignupStep, waitForSignupStepToLeave } from './steps';

/** The web helpers' 15s, unchanged: how long to give the pending list to render before giving up on one. */
const DEFAULT_SETTLE_MS = 15_000;
/** The web helpers' ten clicks, unchanged. */
const DEFAULT_MAX_TAPS = 10;
/** The web helpers' 400ms pause after a click, unchanged. */
const DEFAULT_TAP_SETTLE_MS = 400;
/** The step readers' default, so one interval covers a whole run. */
const DEFAULT_INTERVAL_MS = 100;
/** The web helper's 120s for the processing window, unchanged. */
const DEFAULT_PROCESSING_TIMEOUT_MS = 120_000;
/** The web helper's 60s for the final success wait, unchanged. */
const DEFAULT_SUCCESS_TIMEOUT_MS = 60_000;
/** The web helper's 30s for the failed step to go away after Try Again, unchanged. */
const DEFAULT_RETRY_TIMEOUT_MS = 30_000;

/** The three controls the disclaimer step can put on screen. */
type DisclaimerControl =
  | typeof WW_IDS.disclaimerRetry
  | typeof WW_IDS.disclaimerAcceptAll
  | typeof WW_IDS.disclaimerAccept;

export interface WwAcceptDisclaimersOptions {
  /**
   * Returns true once the caller considers the flow finished (the success step is up, say), so
   * acceptance stops there rather than waiting for the panel to empty.
   */
  isDone?: () => Promise<boolean>;
  /**
   * How long to wait for a control to render before concluding there is nothing to accept. Default
   * 15s. Only matters on entry - once a control is on screen the loop drives itself.
   */
  settleMs?: number;
  /** How many taps to spend before giving up. Default 10, as on the web. */
  maxTaps?: number;
  /**
   * How long to leave a tap alone before looking again. Default 400ms, as on the web.
   *
   * It is a flat pause rather than a wait on something, because there is nothing to wait ON: while
   * an acceptance is in flight the control keeps its `testID` and only its `disabled` changes, and
   * a `testID` cannot be asked whether it is disabled. Raise it on a slow connection - a tap landing
   * on a still-disabled button is a no-op that spends a tap out of {@link maxTaps}.
   */
  tapSettleMs?: number;
  /** How often to look while settling. Default 100. */
  intervalMs?: number;
}

/**
 * Accept whatever pending disclaimers are on screen.
 *
 * Three shapes, because `DisclaimerComponent` renders three and only one of them is the obvious one:
 *
 *  · **More than one pending**: a `disclaimer-accept` per card AND one `disclaimer-accept-all`. Accept
 *    All is preferred - it is one tap for the whole list, and it exists exactly when there is more
 *    than one thing in it.
 *  · **Exactly one pending**: a single `disclaimer-accept` and NO `disclaimer-accept-all`, because the
 *    component renders that control only when more than one is pending. A loop written for Accept All
 *    alone returns here having tapped nothing, and the caller's next wait then times out on a flow
 *    that was never advanced - which reads as the product hanging rather than as the helper missing.
 *  · **The list failed to load**: `disclaimer-retry` and neither of the others, since the component
 *    renders the retry only when nothing is pending. Tried first for that reason: a retry on screen
 *    means there is nothing to accept YET, and treating that as "nothing to accept" would return
 *    successfully from a screen that is showing an error.
 *
 * `disclaimer-accept` is a repeated id - one control per pending card - and the driver contract says
 * an adapter acts on the first element carrying an id. So a tap clears ONE card, and the loop drains
 * rather than tapping once and returning. That is why no `count` was added to `WwDriver`: knowing how
 * many there are answers nothing the loop does not learn by tapping and looking again.
 *
 * Bounded on purpose. An Accept that never goes away is a real defect and has to fail loudly.
 */
export async function acceptDisclaimers(driver: WwDriver, options: WwAcceptDisclaimersOptions = {}): Promise<void> {
  const {
    isDone,
    settleMs = DEFAULT_SETTLE_MS,
    maxTaps = DEFAULT_MAX_TAPS,
    tapSettleMs = DEFAULT_TAP_SETTLE_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = options;

  const done = (): Promise<boolean> => (isDone ? isDone() : Promise.resolve(false));

  const control = async (): Promise<DisclaimerControl | null> => {
    if (await driver.exists(WW_IDS.disclaimerRetry)) return WW_IDS.disclaimerRetry;
    if (await driver.exists(WW_IDS.disclaimerAcceptAll)) return WW_IDS.disclaimerAcceptAll;
    if (await driver.exists(WW_IDS.disclaimerAccept)) return WW_IDS.disclaimerAccept;
    return null;
  };

  // The component fetches its pending list when the step mounts, so on entry the panel may be a
  // spinner carrying none of the three. Without this wait, "nothing on screen yet" and "nothing left
  // to accept" are the same reading and the function returns having silently done nothing - a
  // success the caller cannot tell from a real one.
  //
  // Its expiry is NOT a failure, and that is a native difference worth stating: the panel the
  // component shows when the pending list came back empty carries no identifier at all, so an app
  // with no terms configured looks exactly like one whose list never arrived. Falling through and
  // letting the caller's own wait report the step is the honest answer; throwing here would fail
  // every signup that had nothing to accept.
  if (!(await done())) {
    await settleUntil(async () => (await control()) !== null || (await done()), settleMs, intervalMs);
  }

  let taps = 0;
  for (;;) {
    if (await done()) return;

    const next = await control();
    if (next === null) return;

    if (taps >= maxTaps) throw new Error(stuckMessage(next, taps));

    await driver.tap(next);
    taps++;
    await sleep(tapSettleMs);
  }
}

/** What to say when the disclaimers would not converge, which depends on which control was still up. */
function stuckMessage(control: DisclaimerControl, taps: number): string {
  if (control === WW_IDS.disclaimerRetry) {
    return `the disclaimers never loaded - the component's own "${WW_IDS.disclaimerRetry}" was still on screen after ${taps} taps`;
  }
  // A native driver watches no responses, so the refusal itself is not readable from here - and the
  // component reports it through a native `Alert`, which a testID-addressed driver cannot read
  // either. Naming the usual cause is the most this can honestly do, and it is what a suite
  // enrolling users in a loop needs to hear.
  return (
    `the disclaimers would not accept - "${control}" was still on screen after ${taps} taps. ` +
    'A rate limit is the usual cause: `disclaimeracceptance/accept` shares the API per-IP auth limit ' +
    'with login and register, so a suite enrolling several users a minute from one address is ' +
    'refused while the button just sits there. Accept fewer users per minute, raise the limit for ' +
    'the environment under test, or - if the device is merely slow - raise tapSettleMs and maxTaps.'
  );
}

export interface WwFinishSignupOptions {
  /** How many times to retry a `failed` processing step. Default 2, as on the web. */
  retries?: number;
  /**
   * How long to allow for the flow to reach success, disclaimers or a failure. Default 120s.
   *
   * Generous because the window covers registering the account, signing it in, linking the payment
   * and activating the plan - several server round trips.
   */
  processingTimeoutMs?: number;
  /** How long to wait for the success step once the disclaimers are done. Default 60s. */
  successTimeoutMs?: number;
  /** How long to give the failed step to go away after Try Again. Default 30s. */
  retryTimeoutMs?: number;
  /** How often to look, throughout. Default 100. */
  intervalMs?: number;
  /**
   * Forwarded to {@link acceptDisclaimers} when the flow stops on the disclaimers step.
   *
   * `isDone` is not forwarded: this function knows what finished means here (the success step) and a
   * caller's own answer to that question would only be a way to leave the flow half driven.
   */
  disclaimers?: Omit<WwAcceptDisclaimersOptions, 'isDone'>;
}

/**
 * Drive the signup from wherever it is to the finish: wait out processing, retry a transient failure,
 * accept any pending disclaimers, then tap the success panel's button.
 *
 * The retry is bounded and says what the failure SAID, not just that there was one - it reads
 * `signup-error-message`, the id this package puts on the failed step's text for exactly this. A
 * failure with an empty message says so rather than reporting an empty string as the cause.
 *
 * **No `expectSuccessText`.** The web helper takes one because a Playwright `Page` can be asked for
 * text anywhere on it, and because the completion message renders only in a panel the final tap
 * navigates away from. A `WwDriver` reads text by `testID`, the success message carries none, and
 * giving it one for this would be a contract string no other stack has. A native runner has its own
 * text matcher; assert with it after this returns, before whatever the host's `onSignupComplete`
 * navigates to has replaced the screen.
 */
export async function finishSignup(driver: WwDriver, options: WwFinishSignupOptions = {}): Promise<void> {
  const {
    retries = 2,
    processingTimeoutMs = DEFAULT_PROCESSING_TIMEOUT_MS,
    successTimeoutMs = DEFAULT_SUCCESS_TIMEOUT_MS,
    retryTimeoutMs = DEFAULT_RETRY_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    disclaimers = {},
  } = options;

  const RESTING: readonly WwSignupStep[] = ['success', 'disclaimers', 'failed'];

  for (let attempt = 0; ; attempt++) {
    await pollForAny(driver, RESTING, processingTimeoutMs, intervalMs);

    if (!(await driver.exists('failed'))) break;

    // Read before the retry tap, because the tap is what takes the text off the screen.
    const said = (await driver.text(WW_IDS.signupErrorMessage).catch(() => null))?.trim();
    if (attempt >= retries) {
      // The attempt count rather than "it failed": it says whether the bound was reached or whether
      // the very first try was the end of it, which is a different bug in a different place.
      throw new Error(
        `the signup failed on attempt ${attempt + 1} of ${retries + 1}: ` +
          `${said || '(the failed step said nothing)'}`,
      );
    }

    await driver.tap(WW_IDS.signupRetry);
    // Leave the failed step before polling again, or the next poll re-reads this same failure and
    // burns a retry on it. The flow tracks completed sub-steps, so the retry resumes where it
    // stopped rather than registering the user a second time.
    await waitForSignupStepToLeave(driver, 'failed', { timeoutMs: retryTimeoutMs, intervalMs });
  }

  if (await driver.exists('disclaimers')) {
    await acceptDisclaimers(driver, { ...disclaimers, isDone: () => driver.exists('success') });
  }

  await waitForSignupStep(driver, 'success', { timeoutMs: successTimeoutMs, intervalMs });
  await driver.tap(WW_IDS.signupGetStarted);
}

/**
 * Wait for the flow to reach any one of several steps.
 *
 * Asks only about the steps it is waiting for while it waits, and pays for the full probe once, on
 * the failure - the same bargain the single-step waiter strikes, and for the same reason: a probe is
 * twelve round trips and spending them on every poll would make waiting slower than the flow.
 */
async function pollForAny(
  driver: WwDriver,
  steps: readonly WwSignupStep[],
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  await pollUntil(
    async () => {
      for (const step of steps) {
        if (await driver.exists(step)) return true;
      }
      return false;
    },
    timeoutMs,
    intervalMs,
    async () => {
      const seen = await currentSignupStep(driver).catch(() => null);
      return `the signup never reached any of [${steps.join(', ')}] - it is on "${seen ?? '(no step on screen)'}"`;
    },
  );
}
