/**
 * `@wildwood/react/testing`, driven in a browser so that a regression in the HELPERS fails here
 * rather than in some host's suite a release later.
 *
 * This is not a test of the component, and it is not a second copy of
 * `packages/wildwood-react/src/__tests__/testingContract.test.tsx` either. That suite pins the
 * SELECTOR CONSTANTS against hand-built markup in jsdom, and says in its own opening line what it
 * cannot reach: "the drivers themselves need a browser". The drivers are what is on trial here —
 * `waitForSignupStep`, `waitForSignupStepToLeave`, `fillRegistrationForm`, `submitRegistrationForm`,
 * `acceptDisclaimers`, `finishSignup`, `dismissConsentBanner`, `recordSignupSteps` — together with
 * the things only a real browser decides: that `.first()` on a selector list resolves in document
 * order, that `click()` waits on a disabled button rather than failing, that a `MutationObserver`
 * installed before the mount sees every step, and what each helper SAYS when it gives up.
 *
 * One thing to know before reading a red run here. Most regressions in these helpers surface as a
 * named assertion, but two surface as a bare `Test timeout of 30000ms exceeded` with nothing else:
 * a selector that stops matching leaves `click()` waiting on an element that never becomes
 * actionable, and a step reader that stops resolving leaves every wait inside `finishSignup`
 * hanging on a `null`. That is the failure mode by construction rather than a gap in these tests.
 * When it happens, the other tests in the same run carry the diagnosis — so open the run as a
 * whole rather than the first red line in it.
 *
 * The import is `@wildwood/react/testing`, exactly what a host writes, so the run also proves that
 * the subpath export resolves and that the built module loads with no runtime dependency on
 * Playwright. Built output, not source: that is what ships.
 *
 * Two kinds of test here, and the split is deliberate.
 *
 *  - Against the REAL component, on the test-suite harness with every API call stubbed by
 *    `page.route`. Nothing but the local dev server is contacted; no API, no session, no .env.
 *  - Against a STAGED DOM built with `page.setContent`. Several of the module's rules exist for a
 *    markup shape React cannot produce — the step mirrored onto the signup root, a submit control
 *    with no `<form>` behind it, every step panel left in the document at once. jsdom can pose that
 *    markup to a selector; only a browser can put a driver through it.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  ACCEPT_SELECTOR,
  RETRY_SELECTOR,
  SUBMIT_REGISTER_SELECTOR,
  acceptDisclaimers,
  dismissConsentBanner,
  fillRegistrationForm,
  finishSignup,
  recordSignupSteps,
  signupStep,
  submitRegistrationForm,
  waitForAnyManageStep,
  waitForManageStep,
  waitForSignupStep,
  waitForSignupStepToLeave,
} from '@wildwood/react/testing';

const APP_ID = 'e2e-helpers-app';

/** What the mocked registration endpoint refuses with, so the failure text is known exactly. */
const REGISTRATION_REFUSAL = 'The mocked registration endpoint refused this account on purpose.';

const USER = {
  firstName: 'Helper',
  lastName: 'Spec',
  username: 'helper.spec',
  email: 'helper.spec@example.invalid',
  // Satisfies the mocked password policy below: 8+ characters, upper, lower and a digit.
  password: 'HelperSpec1',
};

const TIERS = [
  {
    id: 'tier-free',
    appId: APP_ID,
    name: 'Starter',
    description: 'Free to begin with.',
    displayOrder: 1,
    isDefault: true,
    isFreeTier: true,
    allowUpgrades: true,
    allowDowngrades: true,
    status: 'Active',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    currency: 'USD',
    pricingOptions: [
      {
        id: 'price-free',
        appTierId: 'tier-free',
        pricingModelId: 'pm-free',
        pricingModelName: 'Starter',
        isDefault: true,
        displayOrder: 1,
        price: 0,
        billingFrequency: 'Monthly',
      },
    ],
    features: [],
    limits: [],
  },
  {
    id: 'tier-paid',
    appId: APP_ID,
    name: 'Pro',
    description: 'For a team winning work.',
    displayOrder: 2,
    isDefault: false,
    isFreeTier: false,
    allowUpgrades: true,
    allowDowngrades: true,
    status: 'Active',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    currency: 'USD',
    pricingOptions: [
      {
        id: 'price-paid',
        appTierId: 'tier-paid',
        pricingModelId: 'pm-paid',
        pricingModelName: 'Pro monthly',
        isDefault: true,
        displayOrder: 1,
        price: 49,
        billingFrequency: 'Monthly',
      },
    ],
    features: [],
    limits: [],
  },
];

const ADD_ONS = [
  {
    id: 'pack-docs',
    appId: APP_ID,
    name: 'Documents Pack',
    description: 'Upload and search your own documents.',
    category: 'Documents',
    status: 'Active',
    displayOrder: 1,
    iconClass: '',
    badgeColor: '',
    currency: 'USD',
    features: [],
    pricingOptions: [
      {
        id: 'price-docs',
        pricingModelId: 'pm-docs',
        pricingModelName: 'Documents',
        price: 9,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    bundledInTierIds: [],
  },
];

const AUTH_CONFIGURATION = {
  isEnabled: true,
  defaultProvider: 'Local',
  allowLocalAuth: true,
  requireEmailVerification: false,
  allowPasswordReset: true,
  showDetailedErrors: false,
  allowTokenRegistration: true,
  allowOpenRegistration: true,
  requireEmailVerificationForOpenRegistration: false,
  hasEmailConfiguration: true,
  registrationRateLimitPerHour: 10,
  registrationRateLimitPerDay: 50,
  registrationRateLimitPerIpPerHour: 10,
  passwordMinimumLength: 8,
  passwordRequireDigit: true,
  passwordRequireLowercase: true,
  passwordRequireUppercase: true,
  passwordRequireSpecialChar: false,
  passwordHistoryLimit: 0,
  passwordExpiryDays: 0,
};

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** How many times the signup actually posted a registration, so a retry can be counted. */
interface ApiMock {
  registerCalls: () => number;
}

/**
 * Stub every API call the harness makes. Widest first: Playwright consults the most recently added
 * route first, so the specific handlers win over the catch-all, and nothing reaches a real server.
 */
async function mockApi(page: Page): Promise<ApiMock> {
  let registerCalls = 0;
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/app-tiers/*/public', (route) => route.fulfill(json(TIERS)));
  await page.route('**/api/app-tier-addons/*/public', (route) => route.fulfill(json(ADD_ONS)));
  await page.route('**/api/AppComponentConfigurations/*/auth-configuration', (route) =>
    route.fulfill(json(AUTH_CONFIGURATION)),
  );
  // Refused rather than 404'd, so the failure the flow reports is a message this spec chose and can
  // therefore assert on character for character.
  await page.route('**/api/userregistration/register', (route) => {
    registerCalls += 1;
    return route.fulfill(json({ success: false, message: REGISTRATION_REFUSAL, errorCode: 'e2e_mock_refused' }));
  });
  return { registerCalls: () => registerCalls };
}

function harnessUrl(view: string): string {
  return `/registration-subscription?appId=${APP_ID}&view=${view}`;
}

/** The error a rejected promise carried, or null if it resolved. */
async function rejection(work: Promise<unknown>): Promise<Error | null> {
  return work.then(
    () => null,
    (err: Error) => err,
  );
}

/**
 * Walk the signup from the register form to the `creating` step, where the mocked registration
 * refuses it. Free plan, so no card step: the helpers, not a payment provider, are what is on trial
 * here.
 */
async function walkToCreating(page: Page): Promise<void> {
  await waitForSignupStep(page, 'register', 20_000);
  await fillRegistrationForm(page, USER);
  await submitRegistrationForm(page);

  await waitForSignupStep(page, 'plan', 20_000);
  await page
    .locator('[data-ww-step="plan"] .ww-tier-card', { hasText: 'Starter' })
    .locator('.ww-tier-footer button')
    .click();

  await waitForSignupStep(page, 'packs', 20_000);
  await page.locator('[data-ww-step="packs"] [data-ww-pack="pack-docs"]').click();
  await page.locator('[data-ww-step="packs"] .ww-regsub-summary button').click();
}

test.describe('@wildwood/react/testing against the real component', () => {
  test('reads the step, and waits for one without returning on the wrong answer', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('signup'));

    await waitForSignupStep(page, 'register', 20_000);
    expect(await signupStep(page)).toBe('register');

    // The single most important behaviour in the module. A step reader that has stopped resolving
    // reports null, null is not the step being waited on, and every "wait for it to leave" in every
    // host's suite then returns immediately — so whole specs pass while asserting nothing. Proving
    // the wait REFUSES to return while the flow is still on the step is the only way to catch that.
    const stayed = await rejection(waitForSignupStepToLeave(page, 'register', 2_000));
    expect(stayed?.message).toBe('the signup stayed on the "register" step (waited 2s)');

    // And the wording, because a bare "timed out" reads as a product hang. These messages name what
    // was waited for and what was on screen instead; that is a contract with whoever reads the
    // failure in CI, not an implementation detail.
    const never = await rejection(waitForSignupStep(page, 'success', 1_000));
    expect(never?.message).toBe('the signup never reached the "success" step — it is on "register" (waited 1s)');
  });

  test('the wait resolves on a real transition, started before the transition happens', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('signup'));

    await waitForSignupStep(page, 'register', 20_000);
    await fillRegistrationForm(page, USER);

    // Armed BEFORE the click, so what is proved is that the wait ends because the step changed —
    // not that it was already off `register` by the time anyone asked.
    const left = waitForSignupStepToLeave(page, 'register', 20_000);
    await submitRegistrationForm(page);
    await left;

    await waitForSignupStep(page, 'plan', 20_000);
  });

  test('the step reader prefers a step mirrored onto the signup root', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('signup'));
    await waitForSignupStep(page, 'register', 20_000);

    // React puts `data-ww-view` on the root and `data-ww-step` on a child, which is the second arm
    // of the selector. The first arm is for a stack that keeps every step panel in the document and
    // so has nowhere but the root to say which one is active. React cannot render that shape, so it
    // is staged here: the root is given a step of its own and must win, being first in DOM order.
    await page.evaluate(() => {
      document.querySelector('[data-ww-view="signup"]')?.setAttribute('data-ww-step', 'plan');
    });
    expect(await signupStep(page)).toBe('plan');

    // Take the mirror away again and the child is read once more, so the widening genuinely added an
    // arm rather than replacing the one every browser-side stack depends on.
    await page.evaluate(() => {
      document.querySelector('[data-ww-view="signup"]')?.removeAttribute('data-ww-step');
    });
    expect(await signupStep(page)).toBe('register');
  });

  test('the registration form is filled through data-ww-field, not through the React ids', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('signup'));
    await waitForSignupStep(page, 'register', 20_000);

    // `data-ww-field` is the contract and `#ww-reg-*` only a fallback, because a server-rendered
    // stack suffixes its ids per instance and no constant id selector can exist there. Stripping the
    // ids leaves the contract as the only way in, which is the state those stacks are permanently in.
    await page.evaluate(() => {
      document.querySelectorAll('[data-ww-field]').forEach((field) => field.removeAttribute('id'));
    });

    await fillRegistrationForm(page, USER);

    expect(await page.locator('[data-ww-field="firstName"]').inputValue()).toBe(USER.firstName);
    expect(await page.locator('[data-ww-field="lastName"]').inputValue()).toBe(USER.lastName);
    expect(await page.locator('[data-ww-field="username"]').inputValue()).toBe(USER.username);
    expect(await page.locator('[data-ww-field="email"]').inputValue()).toBe(USER.email);
    expect(await page.locator('[data-ww-field="password"]').inputValue()).toBe(USER.password);
    expect(await page.locator('[data-ww-field="confirmPassword"]').inputValue()).toBe(USER.password);

    // The fills re-rendered the form. React does not re-apply an attribute it has not changed, so the
    // ids are still gone — which is what makes the assertions above a test of the contract hook and
    // not of the fallback that happens to sit on the same elements.
    expect(await page.locator('[data-ww-field][id]').count()).toBe(0);

    await expect(page.locator(SUBMIT_REGISTER_SELECTOR)).toHaveCount(1);
  });

  test('the recorder sees every step the signup passed through, and none it skipped', async ({ page }) => {
    const api = await mockApi(page);
    // Before the first navigation, so the observer is installed ahead of the component's mount.
    const recorder = await recordSignupSteps(page);
    await page.goto(harnessUrl('signup'));

    await walkToCreating(page);
    await waitForSignupStep(page, 'failed', 30_000);

    const seen = await recorder.steps();
    // A subsequence rather than an exact list, though the full run today is
    // loading → register → token → plan → packs → creating → failed. Two of those are momentary:
    // `loading` lasts until the catalog answers, and `token` is entered and left by an effect that
    // runs straight after its own commit. The observer re-reads the DOM when its callback fires
    // rather than recording the mutation it was handed, so a step that short could in principle be
    // collapsed. Asserting the five that are genuinely settled keeps this a test of the recorder
    // instead of a bet on React's scheduling.
    expect(seen.filter((step) => ['register', 'plan', 'packs', 'creating', 'failed'].includes(step))).toEqual([
      'register',
      'plan',
      'packs',
      'creating',
      'failed',
    ]);
    // The assertion above is what stops this next one passing vacuously: an observer that recorded
    // nothing would satisfy `expectNeverEntered` for every step there is.
    await recorder.expectNeverEntered('payment');
    expect(api.registerCalls()).toBe(1);
  });

  test('a failed signup is retried, and reported with the failure text rather than the boilerplate', async ({
    page,
  }) => {
    const api = await mockApi(page);
    await page.goto(harnessUrl('signup'));
    await walkToCreating(page);

    // One retry: the helper has to find the failed panel's own control by its `data-ww-action` hook
    // (its label is host-configurable), wait for the flow to leave `failed` before polling again, and
    // only then give up. A second registration POST is the evidence the retry really happened.
    const failed = await rejection(finishSignup(page, { retries: 1 }));
    expect(failed?.message).toBe(`Signup processing failed: ${REGISTRATION_REFUSAL}`);
    expect(api.registerCalls()).toBe(2);
  });

  test('the manage view reports its plan-change step, and says which of several it reached', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('manage'));

    // The manage reader keys on the root, where every stack puts the step. Idle is where a plan
    // change sits before anyone asks for one.
    await waitForManageStep(page, 'idle', 20_000);
    expect(await waitForAnyManageStep(page, ['confirm', 'idle', 'failed'], 20_000)).toBe('idle');
  });
});

/** Counters the staged pages below keep, so a click can be proved to have landed on the control. */
declare global {
  interface Window {
    __wwAcceptClicks: number;
    __wwGetStartedClicks: number;
    __wwRetryClicks: number;
    __wwConsentClicks: number;
  }
}

/**
 * Write a staged page and wait for it to be parsed.
 *
 * `setContent` rather than a fixture route: these pages exist to hold rules about markup React does
 * not render, and giving them an origin, a bundle and a component would add everything that could
 * make them flaky without adding anything they test.
 */
async function stage(page: Page, html: string): Promise<void> {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
}

test.describe('@wildwood/react/testing against a staged DOM', () => {
  test('the failure text is read from its own hook, not from the class the processing steps share', async ({
    page,
  }) => {
    // The shape this rule exists for: every step panel left in the document, so the class-based
    // fallback matches the `creating` step's "please wait" — which sits EARLIER than the real error.
    // A comma-joined selector list resolves in DOM order and would hand back the boilerplate, which
    // is why the failure selectors are an ordered array the driver walks in turn.
    await stage(
      page,
      `
      <div class="ww-regsub ww-regsub-signup" data-ww-view="signup" data-ww-step="failed">
        <div class="ww-signup-step ww-signup-processing" data-ww-step="creating">
          <h3>Creating your account</h3>
          <p class="ww-text-muted">This will only take a moment.</p>
        </div>
        <div class="ww-signup-step ww-signup-processing" data-ww-step="failed">
          <h3>Something went wrong</h3>
          <p class="ww-text-muted" data-ww-error-message>Your card was declined.</p>
        </div>
      </div>`,
    );

    // The root carries the only readable answer here, and it is read in preference to the two
    // descendants that each name a step of their own.
    expect(await signupStep(page)).toBe('failed');

    const failed = await rejection(finishSignup(page, { retries: 0 }));
    expect(failed?.message).toBe('Signup processing failed: Your card was declined.');
  });

  test('the submit control is found by its action hook when there is no form behind it', async ({ page }) => {
    // A stack whose flow takes the card before the account exists has no `<form>` to submit, so its
    // control is an ordinary `type="button"`. `button[type="submit"]` cannot reach it and the action
    // hook is the whole contract.
    await stage(
      page,
      `
      <div class="ww-regsub ww-regsub-signup" data-ww-view="signup">
        <div class="ww-signup-step" data-ww-step="register">
          <input data-ww-field="email" type="email" />
          <button type="button" data-ww-action="submit-register">Create account</button>
        </div>
        <div class="ww-signup-step" data-ww-step="creating" hidden>
          <p class="ww-text-muted">Working on it.</p>
        </div>
      </div>
      <script>
        document.querySelector('[data-ww-action="submit-register"]').addEventListener('click', () => {
          document.querySelector('[data-ww-step="register"]').remove();
          document.querySelector('[data-ww-step="creating"]').hidden = false;
        });
      </script>`,
    );

    await expect(page.locator(SUBMIT_REGISTER_SELECTOR)).toHaveCount(1);
    expect(await signupStep(page)).toBe('register');

    await submitRegistrationForm(page);
    await waitForSignupStep(page, 'creating', 5_000);
  });

  test('an Accept that names itself is never mistaken for a retry, and its gate is ticked first', async ({ page }) => {
    // The exact markup that produced the bug the retry selector was tightened for: an Accept All
    // sitting in `.ww-disclaimer-actions` as a plain `.ww-btn-primary`. The loop tests RETRY first,
    // so before `:not([data-ww-disclaimer-action])` the run clicked Accept as though it were a retry
    // and then announced that disclaimers which had loaded perfectly well had never loaded.
    //
    // Accept is also gated on a checkbox, which is the other stack difference the helper absorbs:
    // `click()` waits for actionability rather than failing on a disabled control, so without the
    // tick the helper hangs on the button until the test's own timeout kills it.
    await stage(
      page,
      `
      <div class="ww-regsub ww-regsub-signup" data-ww-view="signup" data-ww-step="disclaimers">
        <div class="ww-signup-step ww-signup-disclaimers">
          <div class="ww-disclaimer-card">
            <h3>Terms of service</h3>
            <label><input type="checkbox" data-ww-disclaimer-check /> I have read the terms</label>
          </div>
          <div class="ww-disclaimer-actions">
            <button type="button" class="ww-btn ww-btn-primary" data-ww-disclaimer-action="accept-all" disabled>
              Accept all
            </button>
          </div>
        </div>
        <div class="ww-signup-step ww-signup-success" hidden>
          <h3>All set</h3>
          <p>Your account is ready.</p>
          <button type="button" data-ww-action="signup-get-started">Get started</button>
        </div>
      </div>
      <script>
        window.__wwAcceptClicks = 0;
        const gate = document.querySelector('[data-ww-disclaimer-check]');
        const accept = document.querySelector('[data-ww-disclaimer-action="accept-all"]');
        gate.addEventListener('change', () => {
          accept.disabled = !gate.checked;
        });
        accept.addEventListener('click', () => {
          window.__wwAcceptClicks += 1;
          document.querySelector('.ww-signup-disclaimers').remove();
          document.querySelector('.ww-signup-success').hidden = false;
          document.querySelector('[data-ww-view="signup"]').setAttribute('data-ww-step', 'success');
        });
        document.querySelector('[data-ww-action="signup-get-started"]').addEventListener('click', () => {
          window.__wwGetStartedClicks = (window.__wwGetStartedClicks || 0) + 1;
        });
      </script>`,
    );

    // The constants are already pinned in jsdom; these two lines are here for the diagnosis, not the
    // coverage. Loosen the selector and the behavioural run below fails as a click timing out on a
    // disabled button, which says nothing about why — these say it in one line.
    await expect(page.locator(RETRY_SELECTOR)).toHaveCount(0);
    await expect(page.locator(ACCEPT_SELECTOR)).toHaveCount(1);

    // The whole tail of a signup, on a root-mirrored step: accept, assert what the success panel
    // says, then click its final button. `expectSuccessText` is checked here rather than by a caller
    // because the disclaimers step sits between the card and the success panel, so a caller who
    // asserts straight after payment is reading the wrong screen.
    await finishSignup(page, { retries: 0, expectSuccessText: 'Your account is ready.' });

    expect(await page.evaluate(() => window.__wwAcceptClicks)).toBe(1);
    expect(await page.evaluate(() => window.__wwGetStartedClicks)).toBe(1);
  });

  test('the retry fallback still covers markup that names no actions at all', async ({ page }) => {
    // The other half of the tightening. `:not([data-ww-disclaimer-action])` must exclude a named
    // Accept without abandoning the builds the fallback was written for, where the component's own
    // retry is nothing but a `.ww-btn-primary`.
    await stage(
      page,
      `
      <div class="ww-signup-step ww-signup-disclaimers">
        <div class="ww-alert ww-alert-danger">The disclaimers could not be loaded.</div>
        <div class="ww-disclaimer-actions">
          <button type="button" class="ww-btn ww-btn-primary">Try again</button>
        </div>
      </div>
      <script>
        window.__wwRetryClicks = 0;
        document.querySelector('.ww-disclaimer-actions .ww-btn-primary').addEventListener('click', () => {
          window.__wwRetryClicks += 1;
          // The load succeeds second time round and the panel offers an Accept instead.
          document.querySelector('.ww-disclaimer-actions').innerHTML =
            '<button type="button" class="ww-btn ww-btn-primary ww-btn-block" data-ww-disclaimer-action="accept-all">Accept all</button>';
          document.querySelector('.ww-disclaimer-actions .ww-btn-primary').addEventListener('click', () => {
            document.querySelector('.ww-disclaimer-actions').remove();
          });
        });
      </script>`,
    );

    await expect(page.locator(RETRY_SELECTOR)).toHaveCount(1);
    await acceptDisclaimers(page.locator('.ww-signup-disclaimers'));
    expect(await page.evaluate(() => window.__wwRetryClicks)).toBe(1);
  });

  test('a disclaimer panel that never settles fails with its own diagnosis, not a timeout', async ({ page }) => {
    // A panel whose retry is all it ever offers. The loop is bounded on purpose: letting it spin
    // until the test's own timeout would leave whoever reads the CI log with no idea what was stuck,
    // so it gives up after ten attempts and names what it was looking at.
    await stage(
      page,
      `
      <div class="ww-signup-step ww-signup-disclaimers">
        <div class="ww-disclaimer-actions">
          <button type="button" class="ww-btn ww-btn-primary" data-ww-disclaimer-action="retry">Try again</button>
        </div>
      </div>`,
    );

    const stuck = await rejection(acceptDisclaimers(page.locator('.ww-signup-disclaimers')));
    expect(stuck?.message).toBe('The disclaimers never loaded — the component’s own retry stayed on screen.');
  });

  test('the consent banner is answered even when it paints after the page does', async ({ page }) => {
    // `waitFor`, not `isVisible({ timeout })`: the latter never waits, so a banner that arrives a
    // beat after the navigation slips past the helper and then takes the clicks meant for the page
    // underneath for the rest of the test.
    await stage(
      page,
      `
      <style>.ww-hidden { display: none; }</style>
      <div class="ww-consent-banner ww-hidden">
        <p>We use cookies.</p>
        <button type="button" class="ww-consent-btn-primary">Accept all</button>
      </div>
      <script>
        window.__wwConsentClicks = 0;
        const banner = document.querySelector('.ww-consent-banner');
        setTimeout(() => banner.classList.remove('ww-hidden'), 500);
        banner.querySelector('.ww-consent-btn-primary').addEventListener('click', () => {
          window.__wwConsentClicks += 1;
          banner.classList.add('ww-hidden');
        });
      </script>`,
    );

    await dismissConsentBanner(page, 5_000);
    expect(await page.evaluate(() => window.__wwConsentClicks)).toBe(1);

    // And a page with no banner is not a page to wait out: the helper returns, having done nothing.
    await stage(page, '<p>Nothing to consent to.</p>');
    await dismissConsentBanner(page, 500);
  });
});
