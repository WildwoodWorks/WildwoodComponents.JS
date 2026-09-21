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
  currentSignupStep,
  waitForSignupStep,
  waitForSignupStepToLeave,
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
