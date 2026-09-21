// The identifier contract, as data a suite can import instead of spelling out.
//
// Every string here is already emitted by a component in this package, and the same strings are the
// web's `data-ww-*` values and Swift's `RegistrationSubscriptionTestID` - a test plan is meant to
// run against all five stacks, which is what makes these a contract. A spec that spells
// `'signup-get-started'` by hand is a spec that drifts the day the component renames it, silently,
// into a test that cannot find what it is looking for.
//
// Nothing in this module imports anything at runtime. That is what lets `./testing` be imported from
// a plain Node script or a tool chain with no React Native runtime at all - which is the only way a
// Maestro user gets at these strings, since a YAML flow cannot call a function of ours.

import type { PlanChangeStep } from '@wildwood/react-shared';
import type { RegistrationSubscriptionView } from '../components/registrationSubscription/types';
import type { RegistrationFieldName } from '../components/registrationSubscription/testIds';

/**
 * Every step id the signup view reports, in the order {@link currentSignupStep} probes them.
 *
 * These are the twelve values the web puts in `data-ww-step`, and deliberately NOT the signup
 * machine's `SignupStep` - which this package also exports, from its main entry. The machine's last
 * step is `done` where every stack's identifier says `success`, so the two are different twelve-value
 * unions and are named differently here on purpose.
 *
 * The order is fixed rather than meaningful: the probe answers with the first id it finds, and a
 * fixed order is what makes that answer the same twice. It runs roughly in the order the flow visits
 * the steps, so the common answers come early.
 */
export const WW_SIGNUP_STEPS = [
  'loading',
  'closed',
  'register',
  'token',
  'plan',
  'packs',
  'payment',
  'creating',
  'disclaimers',
  'packCheckout',
  'failed',
  'success',
] as const;

/** One of the twelve step ids the signup view reports. */
export type WwSignupStep = (typeof WW_SIGNUP_STEPS)[number];

/**
 * Every step id the manage view reports while a plan change runs.
 *
 * `satisfies` rather than a hand-written union, because these ARE the plan-change machine's steps:
 * the view emits `flow.step` unchanged, `idle` included, so a name this list got wrong would be a
 * name no element ever carries. There is no waiter for them in this module - a host waits on one of
 * these with its runner's own `waitFor`, and what it needs from us is the spelling.
 */
export const WW_MANAGE_STEPS = [
  'idle',
  'previewing',
  'confirm',
  'collectingPayment',
  'changing',
  'authenticating',
  'completing',
  'done',
  'failed',
] as const satisfies readonly PlanChangeStep[];

/**
 * The three view names, which are also the ids that ENCLOSE a step.
 *
 * A host mounting two Wildwood surfaces on one screen scopes its driver to one of these - see
 * `WwDriver` for why scoping is the adapter's job rather than an argument to every read.
 */
export const WW_VIEWS = ['pricing', 'signup', 'manage'] as const satisfies readonly RegistrationSubscriptionView[];

/**
 * The registration form's fields, in form order.
 *
 * The first six are the web's `data-ww-field` names, unchanged. The seventh is this contract's own -
 * the web's token input carries an id and no `data-ww-field`, so there was no string to match. Their
 * `testID`s are `wwFieldTestId(field)`, not the bare name; see that function for why the prefix.
 */
export const WW_REGISTRATION_FIELDS = [
  'firstName',
  'lastName',
  'username',
  'email',
  'password',
  'confirmPassword',
  'registrationToken',
] as const satisfies readonly RegistrationFieldName[];

/**
 * Every element these components name with a constant `testID`.
 *
 * One object rather than thirty exports, so a suite imports `WW_IDS` once. What is NOT here is
 * anything whose id is built from a value - packs, groups, sheets, form fields, manage sections -
 * because a constant cannot stand for those; they come from the `ww*TestId` builders beside this.
 */
export const WW_IDS = {
  // Pricing.
  pricingRetry: 'pricing-retry',
  pricingSkeleton: 'pricing-skeleton',
  billingToggle: 'billing-toggle',
  packsContinue: 'packs-continue',

  // Signup.
  closedNotice: 'regsub-closed',
  tokenPlanSummary: 'token-plan-summary',
  planSummaryCard: 'plan-summary-card',
  planChange: 'plan-change',
  paymentLeave: 'payment-leave',
  signupRetry: 'signup-retry',
  signupStartOver: 'signup-start-over',
  signupGetStarted: 'signup-get-started',

  // The payment step's two store-billed shapes, named BESIDE the step rather than instead of it: the
  // step id stays `payment` on a store-billed device so a cross-stack plan still finds it. These two
  // are the only ids in this object that no stack but this one has, because no other stack renders a
  // store purchase inside the signup.
  storePayment: 'store-payment',
  storeUnavailable: 'store-unavailable',

  // The registration form and the disclaimer step, which the signup view mounts as steps of its own.
  submitRegister: 'submit-register',
  disclaimerRetry: 'disclaimer-retry',
  // Rendered once per pending disclaimer, because the id names the ROLE, as on the web. So this is
  // the one constant here that several elements can carry at once - and `disclaimerAcceptAll` is
  // rendered exactly when more than one is pending, so whenever this one is ambiguous there is an
  // unambiguous control beside it.
  disclaimerAccept: 'disclaimer-accept',
  disclaimerAcceptAll: 'disclaimer-accept-all',

  // Pack checkout.
  orderSummary: 'order-summary',
  packCheckout: 'pack-checkout',
  packCheckoutRetry: 'pack-checkout-retry',
  packCheckoutSkip: 'pack-checkout-skip',
  packOutcomes: 'pack-outcomes',
  packsModalContinue: 'packs-modal-continue',

  // Manage.
  addPacks: 'add-packs',
  planChangeNotice: 'plan-change-notice',
  planChangeRetry: 'plan-change-retry',
  planChangeDismiss: 'plan-change-dismiss',

  // The consent banner, which is not part of this component but sits over it.
  consentBanner: 'consent-banner',
  consentAcceptAll: 'consent-accept-all',
} as const;
