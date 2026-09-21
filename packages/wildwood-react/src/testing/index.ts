/**
 * Playwright helpers for driving the Registration & Subscription component.
 *
 * ```ts
 * import { waitForSignupStep, finishSignup } from '@wildwood/react/testing';
 * ```
 *
 * Every host integrating this component ends up writing the same scaffolding: read the step hooks,
 * wait out the processing step, accept whatever disclaimers the app has configured, answer the
 * consent banner. Shipping it here means each app does not rediscover the same handful of traps —
 * in particular the ones that only appear against a real deployment, where terms are configured and
 * the API's per-IP rate limit is real.
 *
 * Playwright is a TYPE-ONLY dependency here — the built module imports nothing at runtime. That is
 * deliberate: a runtime `import ... from '@playwright/test'` resolves against the PACKAGE's location,
 * so any consumer whose Playwright install differs from the one next to this package crashes on
 * "Playwright was loaded twice" before a single assertion runs. Types erase at compile time, so
 * these helpers work with whatever Playwright the consumer already has, at whatever version.
 */

export {
  signupStep,
  waitForSignupStep,
  waitForSignupStepToLeave,
  manageStep,
  waitForManageStep,
  waitForAnyManageStep,
  recordSignupSteps,
  type SignupStep,
  type ManageStep,
  type SignupStepRecorder,
} from './steps.js';

export {
  fillRegistrationForm,
  submitRegistrationForm,
  dismissConsentBanner,
  acceptDisclaimers,
  finishSignup,
  type RegistrationFields,
  type AcceptDisclaimersOptions,
  type FinishSignupOptions,
} from './flows.js';
