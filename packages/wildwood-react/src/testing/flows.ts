import type { Locator, Page, Response } from '@playwright/test';
import { signupStep, waitForSignupStep, waitForSignupStepToLeave } from './steps.js';
import { sleep, until, untilValue } from './poll.js';

/**
 * Driving the signup flow end to end, and the two things that reliably get in its way on a real
 * deployment: a pending disclaimer, and the consent banner.
 *
 * Everything here keys on structural hooks (`data-ww-step`, `data-ww-disclaimer-action`,
 * `type="submit"`, component class names) rather than on button copy, because every label the
 * component renders is host-configurable through `labels.ts`.
 *
 * `@playwright/test` is imported for TYPES ONLY; see `poll.ts` for why.
 */

/** The fields TokenRegistrationComponent renders, by their stable ids. */
export interface RegistrationFields {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

/** Fill the registration form. */
export async function fillRegistrationForm(page: Page, user: RegistrationFields): Promise<void> {
  await page.locator('#ww-reg-first').fill(user.firstName);
  await page.locator('#ww-reg-last').fill(user.lastName);
  await page.locator('#ww-reg-username').fill(user.username);
  await page.locator('#ww-reg-email').fill(user.email);
  await page.locator('#ww-reg-password').fill(user.password);
  await page.locator('#ww-reg-confirm').fill(user.password);
}

/**
 * Submit the registration form.
 *
 * By `type="submit"` inside the register step, not by name: the component labels this button
 * differently depending on whether a plan step follows ("Continue") or the card comes next
 * ("Create Account"), and both strings are configurable.
 */
export async function submitRegistrationForm(page: Page): Promise<void> {
  await page.locator('[data-ww-step="register"] button[type="submit"]').click();
}

/**
 * Dismiss the consent banner if it is up.
 *
 * `ConsentBanner` reserves its own height by default, so it no longer covers bottom-anchored UI —
 * but it is still on screen and still takes the clicks aimed at it. A test that interacts with the
 * page underneath answers it first, exactly as a visitor would.
 */
export async function dismissConsentBanner(page: Page, waitMs = 5_000): Promise<void> {
  const banner = page.locator('.ww-consent-banner');
  // waitFor, not isVisible({ timeout }): isVisible never waits, so a banner that paints a beat
  // after the navigation slips straight past and the caller then fights it for the whole test.
  const shown = await banner.waitFor({ state: 'visible', timeout: waitMs }).then(
    () => true,
    () => false,
  );
  if (!shown) return;
  await banner.locator('.ww-consent-btn-primary').click();
  await banner.waitFor({ state: 'hidden', timeout: 10_000 });
}

// `data-ww-disclaimer-action` was added alongside these helpers, so the structural selectors are
// kept as fallbacks: a host on an older component build — or one testing a deployed environment
// built before it upgraded — must not be told its disclaimers never loaded. The fallbacks lean on
// `ww-btn-block`, which is what distinguishes "Accept All" from the load-failure retry that shares
// its container.
const ACCEPT = [
  '[data-ww-disclaimer-action="accept"]',
  '[data-ww-disclaimer-action="accept-all"]',
  '.ww-disclaimer-footer .ww-btn-primary',
  '.ww-disclaimer-actions .ww-btn-block',
].join(', ');
const RETRY = ['[data-ww-disclaimer-action="retry"]', '.ww-disclaimer-actions .ww-btn-primary:not(.ww-btn-block)'].join(
  ', ',
);

export interface AcceptDisclaimersOptions {
  /**
   * Returns true once the caller considers the flow finished (e.g. the success panel is up), so
   * acceptance can stop early rather than wait for the panel to empty.
   */
  isDone?: () => Promise<boolean>;
  /**
   * How long to wait for the pending list to render before concluding there is nothing to accept.
   * Default 15s. Only matters on entry — once a control is on screen the loop drives itself.
   */
  settleMs?: number;
}

/**
 * Accept whatever pending disclaimers are on screen.
 *
 * Bounded on purpose: an Accept that never goes away is a real defect and has to fail loudly rather
 * than spin until the test's own timeout, where it would be reported as a hang with no cause.
 *
 * Two failure modes this handles, both found against a live deployment and neither visible on a
 * local stack:
 *
 *  - the accept POST is REFUSED. `disclaimeracceptance/accept` sits under the API's per-IP auth
 *    limiter together with login and register, so a suite enrolling several users a minute from one
 *    address gets 429s. The component leaves the button where it is, so without watching the
 *    response this reads as "the button does nothing".
 *  - the pending list FAILS TO LOAD, in which case the component renders its own retry instead of
 *    an Accept, and waiting only for an Accept times out on a button that is never coming.
 */
export async function acceptDisclaimers(scope: Locator, options: AcceptDisclaimersOptions = {}): Promise<void> {
  const { isDone, settleMs = 15_000 } = options;
  const page = scope.page();
  let lastStatus = 0;
  const watchAccept = (res: Response) => {
    if (/disclaimeracceptance\/accept/i.test(res.url())) lastStatus = res.status();
  };
  page.on('response', watchAccept);

  try {
    let clicks = 0;
    let rateLimitWaits = 0;

    // The component fetches its pending list when the step mounts, so on entry the panel may hold
    // neither an Accept nor the retry yet. Without this wait, "nothing on screen" is indistinguishable
    // from "nothing left to accept" and the function returns having silently done nothing — a success
    // the caller cannot tell from a real one. Wait once for either control; a panel that genuinely has
    // no disclaimers falls through after `settleMs` and returns, as it should.
    if (!(isDone && (await isDone()))) {
      await scope
        .locator(`${ACCEPT}, ${RETRY}`)
        .first()
        .waitFor({ state: 'visible', timeout: settleMs })
        .catch(() => undefined);
    }

    for (;;) {
      const retry = scope.locator(RETRY).first();
      const accept = scope.locator(ACCEPT).first();

      if (await retry.isVisible().catch(() => false)) {
        if (rateLimitWaits + clicks >= 10) {
          throw new Error('The disclaimers never loaded — the component’s own retry stayed on screen.');
        }
        await retry.click();
        await sleep(1_000);
        clicks++;
        continue;
      }

      if ((await scope.locator(ACCEPT).count()) === 0) return;

      if (clicks >= 10) {
        throw new Error(
          lastStatus >= 400
            ? `Disclaimer accept was refused by the server — last response HTTP ${lastStatus}, after 10 attempts.`
            : 'Disclaimer accept did not converge after 10 clicks — is an Accept button stuck disabled?',
        );
      }

      lastStatus = 0;
      await accept.click();
      await sleep(400);
      if (isDone && (await isDone())) return;

      // A 429 is the server pacing us, not a defect: wait for the window to replenish instead of
      // spending the click budget on refusals.
      if (lastStatus === 429) {
        if (rateLimitWaits >= 3) {
          throw new Error(
            'Disclaimer accept kept returning HTTP 429. Acceptance shares the API’s per-IP auth ' +
              'rate limit with login and register — enroll fewer users per minute from one address, ' +
              'or raise the limit for the environment under test.',
          );
        }
        rateLimitWaits++;
        await sleep(20_000);
        continue; // a refused attempt proved nothing, so it must not spend the click budget
      }
      clicks++;
    }
  } finally {
    page.off('response', watchAccept);
  }
}

export interface FinishSignupOptions {
  /**
   * Text the success panel must show, asserted after the flow reaches `success` and before the
   * final button is clicked.
   *
   * It has to be checked here rather than by the caller: the panel is the only place the completion
   * message appears, the click navigates away from it, and the `disclaimers` step can sit between
   * payment and success — so a caller asserting straight after the card sees the disclaimer instead.
   * Any environment with a pending disclaimer breaks that assumption, which is every environment
   * with real terms configured.
   */
  expectSuccessText?: string | RegExp;
  /** How many times to retry a `failed` processing step. Default 2. */
  retries?: number;
}

/**
 * Drive the signup flow from wherever it is to the finish: wait out processing, retry a transient
 * failure, accept any pending disclaimers, optionally assert what the success panel says, then
 * click the success button.
 *
 * The final click is located by class, not by name: its label is `labels.getStarted`, which hosts
 * routinely reword.
 */
export async function finishSignup(page: Page, options: FinishSignupOptions = {}): Promise<void> {
  const { retries = 2 } = options;

  for (let attempt = 0; ; attempt++) {
    // Generous: this window covers registering the account, signing it in, linking the payment and
    // activating the plan — several server round-trips.
    await untilValue(
      () => signupStep(page),
      (step) => step === 'success' || step === 'disclaimers' || step === 'failed',
      120_000,
      (last) => `the signup never reached success, disclaimers or a failure — it is on "${last ?? '(not rendered)'}"`,
    );

    if ((await signupStep(page)) !== 'failed') break;
    const message = (await page.locator('.ww-signup-processing .ww-text-muted').first().textContent()) ?? '';
    if (attempt >= retries) throw new Error(`Signup processing failed: ${message}`);
    // The flow tracks completed sub-steps, so its retry resumes where it failed rather than
    // registering the user a second time.
    await page.locator('[data-ww-step="failed"] .ww-btn-primary').first().click();
    // Leave the failed step before polling again, or the next poll re-reads this same failure and
    // burns a retry on it.
    await waitForSignupStepToLeave(page, 'failed', 30_000);
  }

  if ((await signupStep(page)) === 'disclaimers') {
    const disclaimers = page.locator('.ww-signup-disclaimers');
    const success = page.locator('.ww-signup-success');
    // The step's container renders before the disclaimer list has been fetched, so an immediate
    // Accept count is 0 and acceptDisclaimers would return having clicked nothing.
    await until(
      async () =>
        (await disclaimers
          .locator(`${ACCEPT}, ${RETRY}`)
          .first()
          .isVisible()
          .catch(() => false)) || (await success.isVisible().catch(() => false)),
      30_000,
      () => 'the disclaimers step rendered neither an Accept, its retry, nor the success panel',
    );
    await acceptDisclaimers(disclaimers, { isDone: () => success.isVisible().catch(() => false) });
  }

  await waitForSignupStep(page, 'success', 60_000);
  if (options.expectSuccessText !== undefined) {
    const text = options.expectSuccessText;
    await page
      .getByText(text)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {
        throw new Error(`the success panel never showed ${text instanceof RegExp ? text : JSON.stringify(text)}`);
      });
  }
  await page.locator('.ww-signup-success .ww-btn-primary').click();
}
