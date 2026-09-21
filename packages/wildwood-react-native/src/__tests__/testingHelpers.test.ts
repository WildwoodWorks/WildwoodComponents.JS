/**
 * `@wildwood/react-native/testing`: the identifier constants, and the step readers over a fake
 * driver.
 *
 * The fake stands in for Detox or React Native Testing Library and answers the one question a native
 * driver can answer - "is an element called this on screen?" - so the readers are exercised exactly
 * as a host's adapter would drive them, including the cases that only show up against a real app: a
 * step that arrives several polls late, one that never arrives, and one that will not go away.
 *
 * The constants are checked against the SOURCE, not against themselves. A constant that no component
 * emits is worse than no constant: a suite keying on it looks correct and finds nothing.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WW_IDS,
  WW_MANAGE_STEPS,
  WW_REGISTRATION_FIELDS,
  WW_SIGNUP_STEPS,
  WW_VIEWS,
  acceptDisclaimers,
  currentSignupStep,
  finishSignup,
  observeSignupSteps,
  waitForSignupStep,
  waitForSignupStepToLeave,
  type WwDriver,
  type WwSignupStep,
  type WwStepReader,
} from '../testing';
import {
  signupStepTestId,
  signupStoreVariantTestId,
} from '../components/registrationSubscription/views/signupViewModel';

// ── A driver that answers for whatever is "on screen" ──────────────────────────

interface FakeDriver extends WwStepReader {
  /** Every id asked about, in order, so a test can pin how much the reader spent. */
  probes: string[];
}

/**
 * A driver over a screen the test describes. `screen` is re-read on every probe, so a test can make
 * the app change under the waiter the way the real one does.
 */
function fakeDriver(screen: () => readonly string[]): FakeDriver {
  const probes: string[] = [];
  return {
    probes,
    exists: async (testID: string) => {
      probes.push(testID);
      return screen().includes(testID);
    },
  };
}

/** A screen that shows `before` for the first `polls` reads and `after` from then on. */
function changesAfter(polls: number, before: readonly string[], after: readonly string[]) {
  let reads = 0;
  return () => (reads++ < polls ? before : after);
}

/** Small enough that a test that waits out a timeout costs milliseconds. */
const FAST = { timeoutMs: 200, intervalMs: 5 };

// ── currentSignupStep ──────────────────────────────────────────────────────────

describe('currentSignupStep', () => {
  it('answers with the step that is on screen', async () => {
    expect(await currentSignupStep(fakeDriver(() => ['register']))).toBe('register');
  });

  it('stops probing at the first hit', async () => {
    // The whole cost argument for the waiters rests on this: a probe is twelve round trips only when
    // there is nothing to find.
    const driver = fakeDriver(() => ['payment']);
    expect(await currentSignupStep(driver)).toBe('payment');
    expect(driver.probes).toEqual(WW_SIGNUP_STEPS.slice(0, WW_SIGNUP_STEPS.indexOf('payment') + 1));
  });

  it('answers null when no step is on screen, rather than failing', async () => {
    // A legitimate reading: the signup view reports no step to a visitor who is already signed in,
    // and a driver pointed at a screen that has not mounted the component reads the same.
    const driver = fakeDriver(() => ['signup']);
    expect(await currentSignupStep(driver)).toBeNull();
    expect(driver.probes).toEqual([...WW_SIGNUP_STEPS]);
  });

  it('takes the earlier of two steps, deterministically', async () => {
    // It cannot happen inside one mounted view. It can happen to a driver that sees two Wildwood
    // surfaces at once, and an answer that changed between identical reads would be worse than a
    // wrong one - a suite would chase it as a flake.
    const twoSurfaces = fakeDriver(() => ['packCheckout', 'payment']);
    expect(await currentSignupStep(twoSurfaces)).toBe('payment');
    expect(await currentSignupStep(fakeDriver(() => ['payment', 'packCheckout']))).toBe('payment');
  });
});

// ── waitForSignupStep ──────────────────────────────────────────────────────────

describe('waitForSignupStep', () => {
  it('returns after one read when the step is already there', async () => {
    const driver = fakeDriver(() => ['register']);
    await waitForSignupStep(driver, 'register', FAST);
    expect(driver.probes).toEqual(['register']);
  });

  it('waits out a step that arrives several polls late', async () => {
    const driver = fakeDriver(changesAfter(3, ['creating'], ['success']));
    await waitForSignupStep(driver, 'success', FAST);
    expect(driver.probes).toEqual(['success', 'success', 'success', 'success']);
  });

  it('says what the flow is actually on when the step never arrives', async () => {
    // "Timed out" alone reads as the product hanging. Sitting on `register` says the form was never
    // submitted, which is a different bug in a different place.
    const driver = fakeDriver(() => ['register']);
    await expect(waitForSignupStep(driver, 'success', FAST)).rejects.toThrow(
      'the signup never reached the "success" step - it is on "register" (waited 200ms)',
    );
  });

  it('does not claim the step was never reached when it arrived a moment too late', async () => {
    // The failure message is built from a FRESH read taken after the deadline, so it can come back
    // with the very step being waited for: the flow landed between the last poll and that read.
    // "never reached success - it is on success" contradicts itself in one sentence, and it sends
    // whoever reads it looking for a hang instead of at the timeout that was simply too short.
    //
    // Reproduced without leaning on wall-clock timing: the polling loop only ever asks about
    // `success`, and the diagnostic probe is the only thing that walks WW_SIGNUP_STEPS from the top.
    // So the first `loading` probe IS the moment the wait has already failed - land the flow exactly
    // there and the race happens on every run, on any machine.
    let landed = false;
    const driver: WwStepReader = {
      exists: async (testID: string) => {
        if (testID === 'loading') landed = true;
        return landed ? testID === 'success' : testID === 'register';
      },
    };

    await expect(waitForSignupStep(driver, 'success', FAST)).rejects.toThrow(
      'the signup reached the "success" step, but only after this gave up',
    );
    // Still a failure: the wait did exceed the bound it was given.
    await expect(
      waitForSignupStep(
        fakeDriver(() => ['register']),
        'success',
        FAST,
      ),
    ).rejects.toThrow();
  });

  it('says so plainly when nothing is on screen at all', async () => {
    await expect(
      waitForSignupStep(
        fakeDriver(() => []),
        'success',
        FAST,
      ),
    ).rejects.toThrow('the signup never reached the "success" step - it is on "(no step on screen)"');
  });

  it('spends a probe only on the failure', async () => {
    // One read per poll while waiting; the probe runs once, at the end, and stops where it finds the
    // answer. Probing on every poll would make waiting on a step slower than the step.
    const driver = fakeDriver(() => ['register']);
    await waitForSignupStep(driver, 'success', FAST).catch(() => undefined);
    const polls = driver.probes.filter((id) => id === 'success').length;
    expect(driver.probes.slice(polls)).toEqual(['loading', 'closed', 'register']);
  });
});

// ── waitForSignupStepToLeave ───────────────────────────────────────────────────

describe('waitForSignupStepToLeave', () => {
  it('does NOT return while the step is still on screen', async () => {
    // The bug this pins is the one that makes a helper vacuous: a reader that cannot really see the
    // step returns true immediately, the caller retries a `failed` step, re-reads the same failure
    // and burns its retry budget - and the whole thing passes as a helper that works.
    const screen = changesAfter(3, ['failed'], ['creating']);
    const driver = fakeDriver(screen);
    await waitForSignupStepToLeave(driver, 'failed', FAST);
    expect(driver.probes).toEqual(['failed', 'failed', 'failed', 'failed']);
    // And it really was gone at the moment it returned, rather than the waiter having given up.
    expect(await currentSignupStep(fakeDriver(screen))).toBe('creating');
  });

  it('fails loudly when the step never goes away', async () => {
    await expect(
      waitForSignupStepToLeave(
        fakeDriver(() => ['failed']),
        'failed',
        FAST,
      ),
    ).rejects.toThrow('the signup stayed on the "failed" step (waited 200ms)');
  });

  it('returns at once when the step was never there', async () => {
    const driver = fakeDriver(() => []);
    await waitForSignupStepToLeave(driver, 'failed', FAST);
    expect(driver.probes).toEqual(['failed']);
  });
});

// ── observeSignupSteps ─────────────────────────────────────────────────────────

/**
 * A screen the test moves BETWEEN polls, plus a clock that counts them.
 *
 * `currentSignupStep` probes `loading` first and exactly once per pass, so that probe is the poll's
 * own clock: `afterPolls` waits on passes rather than on elapsed time, and these tests read the same
 * on a fast machine and a loaded one. Each pass answers from a snapshot taken when it started, so a
 * screen changed while a pass is running does not change that pass's answer - which is what lets a
 * test stage "the step came and went between two polls" exactly rather than hoping for it.
 */
function observedScreen(initial: WwSignupStep | null) {
  let live: WwSignupStep | null = initial;
  let frame: WwSignupStep | null = initial;
  let polls = 0;
  const waiting: { at: number; resolve: () => void }[] = [];

  const driver: WwStepReader = {
    exists: async (testID: string) => {
      if (testID === WW_SIGNUP_STEPS[0]) {
        frame = live;
        polls += 1;
        for (let i = waiting.length - 1; i >= 0; i--) {
          if (waiting[i].at <= polls) waiting.splice(i, 1)[0].resolve();
        }
      }
      return frame === testID;
    },
  };

  return {
    driver,
    polls: () => polls,
    show: (step: WwSignupStep | null) => {
      live = step;
    },
    /** Resolves once `n` more passes have STARTED, so the pass before the last one has recorded. */
    afterPolls: (n: number) => new Promise<void>((resolve) => waiting.push({ at: polls + n, resolve })),
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('observeSignupSteps', () => {
  it('records the steps it saw, in order, with repeats collapsed', async () => {
    const screen = observedScreen('register');
    const observer = observeSignupSteps(screen.driver, { intervalMs: 1 });

    await screen.afterPolls(2);
    screen.show('creating');
    await screen.afterPolls(2);
    screen.show('success');
    await screen.afterPolls(2);
    await observer.stop();

    // `register` was on screen for more than one pass and appears once: the interesting question is
    // which steps were entered and in what order, not how many times React re-rendered them.
    expect(observer.steps()).toEqual(['register', 'creating', 'success']);
  });

  it('MISSES a step that came and went between two polls, and so cannot prove a negative', async () => {
    // The limitation, pinned rather than papered over. The web's recorder installs a MutationObserver
    // inside the page and sees every transition; this one asks, so a step that is over before the
    // next ask is never seen. Staged exactly rather than raced for: both changes happen in one
    // synchronous block and the observer cannot run between two statements, so the step is provably
    // never on screen at the instant of a poll - which is the shape of the real thing, whatever the
    // interval and however fast the step.
    const screen = observedScreen('creating');
    const observer = observeSignupSteps(screen.driver, { intervalMs: 1 });

    await screen.afterPolls(2);
    screen.show('disclaimers');
    screen.show('success');
    await screen.afterPolls(2);
    await observer.stop();

    expect(observer.steps()).toEqual(['creating', 'success']);
    // And so `expectNeverEntered` clears a step that WAS entered. It is evidence, not proof, and the
    // doc comment says to use it only for a step the flow would rest on if it entered at all.
    expect(() => observer.expectNeverEntered('disclaimers')).not.toThrow();
  });

  it('names what it did see when a step it was told to rule out turns up', async () => {
    const screen = observedScreen('plan');
    const observer = observeSignupSteps(screen.driver, { intervalMs: 1 });

    await screen.afterPolls(2);
    await observer.stop();

    expect(() => observer.expectNeverEntered('plan')).toThrow(
      'the signup entered the "plan" step but should not have - steps seen: plan',
    );
  });

  it('really stops, and says so only once it has', async () => {
    // `stop()` resolving before the loop had exited would leave a probe running into the next test,
    // where it shows up as an unexplained call on somebody else's driver.
    const screen = observedScreen('register');
    const observer = observeSignupSteps(screen.driver, { intervalMs: 1 });

    await screen.afterPolls(2);
    await observer.stop();
    const pollsAtStop = screen.polls();

    screen.show('success');
    await wait(25);

    expect(screen.polls()).toBe(pollsAtStop);
    expect(observer.steps()).toEqual(['register']);
  });

  it('keeps going when the driver throws mid-run', async () => {
    // A screen torn down, a bridge that dropped: the next poll usually answers, and ending the
    // recording over one bad read would lose everything after it.
    let live: WwSignupStep = 'creating';
    let reads = 0;
    const driver: WwStepReader = {
      exists: async (testID: string) => {
        if (testID === WW_SIGNUP_STEPS[0] && ++reads === 2) throw new Error('the bridge dropped');
        return testID === live;
      },
    };
    const observer = observeSignupSteps(driver, { intervalMs: 1 });

    await wait(25);
    live = 'success';
    await wait(25);
    await observer.stop();

    expect(reads).toBeGreaterThan(2);
    expect(observer.steps()).toEqual(['creating', 'success']);
  });

  it('hands out a copy, so a caller cannot edit the record it is reading', async () => {
    const screen = observedScreen('register');
    const observer = observeSignupSteps(screen.driver, { intervalMs: 1 });
    await screen.afterPolls(2);
    await observer.stop();

    observer.steps().push('success');
    expect(observer.steps()).toEqual(['register']);
  });
});

// ── acceptDisclaimers ──────────────────────────────────────────────────────────

interface DisclaimerScreenOptions {
  /** How many disclaimers the app has pending. */
  pending?: number;
  /** The pending list failed to load, so the component renders its retry and nothing else. */
  failedToLoad?: boolean;
  /** The list never loads: the retry comes straight back. */
  retryNeverHelps?: boolean;
  /** Every acceptance is refused - a 429, which the driver has no way to see. */
  refuseAccept?: boolean;
  /** Suppress Accept All even with several pending, to exercise the one-at-a-time drain. */
  offerAcceptAll?: boolean;
}

/**
 * A screen modelling `DisclaimerComponent`'s three shapes from one number.
 *
 * Read off the component rather than written by hand, because the shapes are the trap: it renders
 * `disclaimer-accept` once per pending disclaimer, `disclaimer-accept-all` ONLY when more than one is
 * pending, and `disclaimer-retry` only when the fetch failed and nothing is pending. A tap on
 * `disclaimer-accept` clears ONE card, because the driver contract says an adapter acts on the first
 * element carrying a repeated id.
 */
function disclaimerScreen(options: DisclaimerScreenOptions = {}) {
  const { retryNeverHelps = false, refuseAccept = false, offerAcceptAll = true } = options;
  let pending = options.pending ?? 0;
  let failed = options.failedToLoad ?? false;
  const taps: string[] = [];

  const driver: WwDriver = {
    exists: async (testID: string) => {
      if (failed) return testID === WW_IDS.disclaimerRetry;
      if (testID === WW_IDS.disclaimerAccept) return pending > 0;
      if (testID === WW_IDS.disclaimerAcceptAll) return offerAcceptAll && pending > 1;
      return false;
    },
    text: async () => null,
    tap: async (testID: string) => {
      taps.push(testID);
      if (testID === WW_IDS.disclaimerRetry) {
        if (!retryNeverHelps) failed = false;
        return;
      }
      if (refuseAccept) return;
      if (testID === WW_IDS.disclaimerAccept) pending = Math.max(0, pending - 1);
      if (testID === WW_IDS.disclaimerAcceptAll) pending = 0;
    },
    type: async () => undefined,
  };

  return { driver, taps, pendingLeft: () => pending };
}

/** Short enough that a test which waits a bound out costs milliseconds. */
const FAST_ACCEPT = { settleMs: 60, intervalMs: 5, tapSettleMs: 0, maxTaps: 3 };

describe('acceptDisclaimers', () => {
  it('accepts a SINGLE pending disclaimer, which renders no Accept All', async () => {
    // The trap this helper exists for. With exactly one pending the component renders `accept` and
    // no `accept-all`, so a loop written for Accept All alone returns having tapped nothing - and the
    // caller's next wait then times out on a flow nobody advanced, which reads as the product
    // hanging rather than as the helper missing.
    const screen = disclaimerScreen({ pending: 1 });
    await acceptDisclaimers(screen.driver, FAST_ACCEPT);

    expect(screen.taps).toEqual([WW_IDS.disclaimerAccept]);
    expect(screen.pendingLeft()).toBe(0);
  });

  it('takes Accept All when several are pending, rather than tapping each', async () => {
    const screen = disclaimerScreen({ pending: 3 });
    await acceptDisclaimers(screen.driver, FAST_ACCEPT);

    expect(screen.taps).toEqual([WW_IDS.disclaimerAcceptAll]);
    expect(screen.pendingLeft()).toBe(0);
  });

  it('drains a repeated `disclaimer-accept` rather than tapping it once', async () => {
    // The id is on a control rendered once per pending card and an adapter acts on the first, so one
    // tap clears one card. This package always offers Accept All when more than one is pending, so
    // the drain is not the path taken against it today; it is what keeps the loop from accepting one
    // disclaimer of several and returning as if it were done, and it is what shows the loop
    // terminates on its own rather than on a bound.
    const screen = disclaimerScreen({ pending: 3, offerAcceptAll: false });
    await acceptDisclaimers(screen.driver, { ...FAST_ACCEPT, maxTaps: 5 });

    expect(screen.taps).toEqual([WW_IDS.disclaimerAccept, WW_IDS.disclaimerAccept, WW_IDS.disclaimerAccept]);
    expect(screen.pendingLeft()).toBe(0);
  });

  it('answers the load-failure retry first, then accepts what it brings back', async () => {
    // A retry on screen means there is nothing to accept YET. Reading that as "nothing to accept"
    // would return successfully from a screen that is showing an error.
    const screen = disclaimerScreen({ pending: 1, failedToLoad: true });
    await acceptDisclaimers(screen.driver, FAST_ACCEPT);

    expect(screen.taps).toEqual([WW_IDS.disclaimerRetry, WW_IDS.disclaimerAccept]);
    expect(screen.pendingLeft()).toBe(0);
  });

  it('gives up on a retry that never brings the list back, and says that is what happened', async () => {
    const screen = disclaimerScreen({ pending: 1, failedToLoad: true, retryNeverHelps: true });

    await expect(acceptDisclaimers(screen.driver, FAST_ACCEPT)).rejects.toThrow(
      'the disclaimers never loaded - the component\'s own "disclaimer-retry" was still on screen after 3 taps',
    );
    expect(screen.taps).toHaveLength(3);
  });

  it('gives up on an acceptance that is refused, and names the rate limit it cannot see', async () => {
    // The native difference, stated where somebody will read it. The web helper watches the response
    // and reports "HTTP 429"; a `WwDriver` watches nothing, and the component reports the refusal
    // through a native `Alert` a testID-addressed driver cannot read either. So the bound is the
    // same and the message names the usual cause instead of detecting it - which is what a suite
    // enrolling users in a loop needs to hear, and is still far better than a bare timeout.
    const screen = disclaimerScreen({ pending: 1, refuseAccept: true });

    const failure = acceptDisclaimers(screen.driver, FAST_ACCEPT);
    await expect(failure).rejects.toThrow(
      'the disclaimers would not accept - "disclaimer-accept" was still on screen after 3 taps',
    );
    await expect(failure).rejects.toThrow(/rate limit is the usual cause/);
    expect(screen.taps).toHaveLength(3);
  });

  it('returns without tapping when the panel has nothing to accept', async () => {
    // An app with no terms configured. The component's "all accepted" panel carries no identifier, so
    // this is indistinguishable from a list that never arrived - which is exactly why the settle
    // expiring is an answer here rather than a failure.
    const screen = disclaimerScreen({ pending: 0 });
    await acceptDisclaimers(screen.driver, FAST_ACCEPT);

    expect(screen.taps).toEqual([]);
  });

  it('stops as soon as the caller says the flow has moved on', async () => {
    // The flow leaves the disclaimers step the moment the last acceptance lands, so the panel can go
    // away under the loop. `isDone` is checked before the settle wait too, so a caller who was
    // already finished pays nothing.
    const screen = disclaimerScreen({ pending: 3 });
    await acceptDisclaimers(screen.driver, { ...FAST_ACCEPT, isDone: async () => true });

    expect(screen.taps).toEqual([]);
  });
});

// ── finishSignup ───────────────────────────────────────────────────────────────

/**
 * A signup screen as a set of ids, with a tap handler the test scripts.
 *
 * A set rather than one step, because the steps the flow rests on have controls inside them:
 * `disclaimers` is on screen at the same time as `disclaimer-accept`, and `failed` at the same time
 * as `signup-retry` and `signup-error-message`.
 */
function signupScreen(initial: readonly string[], onTap?: (testID: string, screen: Set<string>) => void) {
  const screen = new Set<string>(initial);
  const texts = new Map<string, string>();
  const taps: string[] = [];
  let afterNextRead: (() => void) | null = null;

  const driver: WwDriver = {
    exists: async (testID: string) => {
      const answer = screen.has(testID);
      const pending = afterNextRead;
      afterNextRead = null;
      pending?.();
      return answer;
    },
    text: async (testID: string) => texts.get(testID) ?? null,
    tap: async (testID: string) => {
      taps.push(testID);
      onTap?.(testID, screen);
    },
    type: async () => undefined,
  };

  return {
    driver,
    screen,
    texts,
    taps,
    /** Change the screen once the next read has been answered - a transition with no timer in it. */
    onNextRead: (change: () => void) => {
      afterNextRead = change;
    },
  };
}

const FAST_FINISH = { processingTimeoutMs: 200, successTimeoutMs: 200, retryTimeoutMs: 200, intervalMs: 5 };

describe('finishSignup', () => {
  it('waits out processing and leaves the success panel', async () => {
    const app = signupScreen(['creating']);
    app.onNextRead(() => {
      app.screen.delete('creating');
      app.screen.add('success');
    });

    await finishSignup(app.driver, FAST_FINISH);

    expect(app.taps).toEqual([WW_IDS.signupGetStarted]);
  });

  it('accepts the disclaimers the flow stops on, then leaves', async () => {
    const app = signupScreen(['disclaimers', WW_IDS.disclaimerAccept], (testID, screen) => {
      if (testID !== WW_IDS.disclaimerAccept) return;
      screen.delete(WW_IDS.disclaimerAccept);
      screen.delete('disclaimers');
      screen.add('success');
    });

    await finishSignup(app.driver, { ...FAST_FINISH, disclaimers: { settleMs: 60, intervalMs: 5, tapSettleMs: 0 } });

    expect(app.taps).toEqual([WW_IDS.disclaimerAccept, WW_IDS.signupGetStarted]);
  });

  it('retries a failure that then goes through', async () => {
    const app = signupScreen(['failed', WW_IDS.signupRetry], (testID, screen) => {
      if (testID !== WW_IDS.signupRetry) return;
      screen.delete('failed');
      screen.add('creating');
      // The flow resumes where it stopped; this attempt gets there.
      app.onNextRead(() => {
        screen.delete('creating');
        screen.add('success');
      });
    });
    app.texts.set(WW_IDS.signupErrorMessage, 'The payment could not be confirmed');

    await finishSignup(app.driver, FAST_FINISH);

    expect(app.taps).toEqual([WW_IDS.signupRetry, WW_IDS.signupGetStarted]);
  });

  it('gives up after its bound, and says what the failure SAID', async () => {
    // The bound is the point: a `failed` step that keeps coming back is a real defect and has to
    // fail loudly rather than spin until the runner's own timeout reports a hang with no cause. And
    // the message carries the text off the panel, which is what the new `signup-error-message` hook
    // is for - "the signup failed" on its own sends somebody reading server logs for the reason that
    // was on the screen all along.
    const app = signupScreen(['failed', WW_IDS.signupRetry], (testID, screen) => {
      if (testID !== WW_IDS.signupRetry) return;
      screen.delete('failed');
      // It resumes, and fails again on the very next read.
      app.onNextRead(() => screen.add('failed'));
    });
    app.texts.set(WW_IDS.signupErrorMessage, 'Registration is not allowed for this app');

    await expect(finishSignup(app.driver, { ...FAST_FINISH, retries: 1 })).rejects.toThrow(
      'the signup failed on attempt 2 of 2: Registration is not allowed for this app',
    );
    // Retried exactly once, and never tapped Get Started on a signup that did not finish.
    expect(app.taps).toEqual([WW_IDS.signupRetry]);
  });

  it('says the panel was silent rather than reporting an empty reason', async () => {
    const app = signupScreen(['failed', WW_IDS.signupRetry]);

    await expect(finishSignup(app.driver, { ...FAST_FINISH, retries: 0 })).rejects.toThrow(
      'the signup failed on attempt 1 of 1: (the failed step said nothing)',
    );
    expect(app.taps).toEqual([]);
  });

  it('names the step the flow is stuck on when it never reaches a resting one', async () => {
    const app = signupScreen(['creating']);

    await expect(finishSignup(app.driver, FAST_FINISH)).rejects.toThrow(
      'the signup never reached any of [success, disclaimers, failed] - it is on "creating" (waited 200ms)',
    );
  });
});

// ── The identifier constants ───────────────────────────────────────────────────

describe('the step vocabulary', () => {
  it('is the web`s twelve `data-ww-step` values, and not the machine`s', () => {
    // The signup machine's last step is `done`; every stack's identifier for it is `success`. Two
    // twelve-value unions that differ by one name is exactly the kind of thing a suite gets wrong
    // once and never diagnoses.
    expect(WW_SIGNUP_STEPS).toHaveLength(12);
    expect(WW_SIGNUP_STEPS).toContain('success');
    expect(WW_SIGNUP_STEPS as readonly string[]).not.toContain('done');
    expect(new Set(WW_SIGNUP_STEPS).size).toBe(WW_SIGNUP_STEPS.length);
  });

  it('is a list of ids the view really reports', () => {
    // Each of the twelve is also the name of a body the signup renders, and the view reports the
    // body's own name for it - so a step in this list that the view does not report would fail here.
    // The other direction, a body reporting a step this list lacks, is what `testIdContract.test.ts`
    // pins from the view's side.
    for (const step of WW_SIGNUP_STEPS) {
      expect(signupStepTestId(step)).toBe(step);
    }
  });

  it('carries the plan change`s `idle`, which the manage view reports rather than swallowing', () => {
    expect(WW_MANAGE_STEPS).toContain('idle');
    expect(WW_MANAGE_STEPS).toHaveLength(9);
  });

  it('names the three views a driver can be scoped to', () => {
    expect(WW_VIEWS).toEqual(['pricing', 'signup', 'manage']);
  });

  it('lists the registration fields the form actually names', () => {
    // Six from the web plus the token field, which is this contract's own.
    expect(WW_REGISTRATION_FIELDS).toHaveLength(7);
    expect(WW_REGISTRATION_FIELDS.slice(0, 6)).toEqual([
      'firstName',
      'lastName',
      'username',
      'email',
      'password',
      'confirmPassword',
    ]);
    expect(WW_REGISTRATION_FIELDS).toContain('registrationToken');
  });
});

// ── The constants are true of the components ───────────────────────────────────

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `testID="…"` literal the package renders. */
function emittedTestIds(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== '__mocks__') walk(path);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      for (const [, id] of readFileSync(path, 'utf8').matchAll(/testID="([^"]+)"/g)) found.add(id);
    }
  };
  walk(join(SRC, 'components'));
  return found;
}

describe('every constant names an element that exists', () => {
  const emitted = emittedTestIds();

  // The two store-billed ids are built by `signupStoreVariantTestId` rather than written as
  // literals, so they are asserted against that function instead of against the source.
  const BUILT = new Set<string>([WW_IDS.storePayment, WW_IDS.storeUnavailable]);

  it.each(Object.entries(WW_IDS).filter(([, id]) => !BUILT.has(id)))('%s is rendered as "%s"', (_name, id) => {
    expect([...emitted]).toContain(id);
  });

  it('gets the store-billed payment ids from the function that builds them', () => {
    expect(signupStoreVariantTestId('storePayment')).toBe(WW_IDS.storePayment);
    expect(signupStoreVariantTestId('storeUnavailable')).toBe(WW_IDS.storeUnavailable);
  });

  it('publishes every constant id the components render', () => {
    // The other direction, and the one that keeps `WW_IDS` honest about being every constant id: an
    // element named in a component and not here is a hook a suite cannot reach without spelling it
    // out, which is the drift this contract exists to stop. If this fails, publish the id - or, if
    // it was never meant to be a locator, it should not have been given a constant `testID`.
    const published = new Set<string>(Object.values(WW_IDS));
    expect([...emitted].filter((id) => !published.has(id))).toEqual([]);
  });

  it('keeps every constant distinct', () => {
    const ids = Object.values(WW_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never gives a step id to an element that is not the step', () => {
    // A constant that collided with a step name would make `currentSignupStep` report a step because
    // a button was on screen. The prefixes on packs, groups, sheets and fields exist for this; these
    // flat ids have to be checked.
    for (const id of Object.values(WW_IDS)) {
      expect(WW_SIGNUP_STEPS as readonly string[]).not.toContain(id);
    }
  });
});
