// Every user-facing string the registration + subscription component says.
//
// The defaults are the copy the live sites already ship, so swapping a hand-rolled pricing page for
// this component does not move a single word — Cairn's end-to-end locators depend on that. The plan
// card CTAs ("Get Started", "Subscribe", "Switch to <Tier>") are deliberately NOT here: they belong
// to TierCardFooter, which every plan grid on the platform shares, and moving them would change what
// the admin surfaces say too.
//
// `{name}`-style placeholders are filled in by {@link formatLabel}.

/** The full label set. Hosts override any subset through the component's `labels` prop. */
export interface RegistrationSubscriptionLabels {
  // ── Pricing view ───────────────────────────────────────────────────────────

  /** Billing toggle, monthly side. */
  billingMonthly: string;
  /** Billing toggle, annual side. */
  billingAnnual: string;
  /** Accessible name of the billing toggle control itself. */
  billingToggleAriaLabel: string;
  /** Badge next to "Annual". `{percent}` is the largest annual saving in the grid. */
  annualSavings: string;
  /** Said by the loading placeholder. Carries no numbers, because none are known yet. */
  loadingPlans: string;
  /** Shown instead of prices when the catalog could not be read. Never accompanied by a price. */
  pricingUnavailable: string;
  /** Retries the catalog request. */
  retry: string;
  /** Generic "talk to a human" link, pointed at the component's `contactUrl`. */
  contactUs: string;
  /** Heading of the trailing group that holds packs matching none of the host's `addOnGroups`. */
  morePacks: string;
  /** Said in place of a price by a pack the operator has defined but not yet priced. */
  packUnavailable: string;
  /** Single-pack call to action, used when `packSelection` is `'none'`. */
  packSelect: string;
  /** Accessible name for that call to action. `{name}` is the pack's name. */
  packSelectNamed: string;
  /** Multi-select summary bar. `{count}` is how many packs are selected. */
  continueWithPacks: string;
  /** The singular of {@link continueWithPacks}. */
  continueWithOnePack: string;

  // ── Signup view (stage 18) ─────────────────────────────────────────────────

  /** Said when the app is not accepting registrations at all. */
  registrationClosed: string;
  /** Submits the registration form. */
  createAccount: string;
  /** Advances a step. */
  continueLabel: string;
  /** Returns to the previous step. */
  back: string;
  /** Abandons the flow. */
  cancel: string;
  /** Skips an optional step (the pack step, typically). */
  skipForNow: string;
  /** Opens the optional registration-token entry. */
  haveToken: string;
  /** Field label for the registration token. */
  tokenLabel: string;
  /** Field label for the email address. */
  emailLabel: string;
  /** Step heading: pick a plan. */
  choosePlan: string;
  /** Step heading: pick packs. */
  choosePacks: string;
  /** Step heading: confirm what is about to be bought. */
  reviewSelection: string;
  /** Said once the account exists and everything asked for has been granted. */
  signupComplete: string;
  /** Said when a signed-in visitor lands on the signup view. */
  alreadySignedIn: string;

  // ── Manage view (stage 19) ─────────────────────────────────────────────────

  /** Names the plan the user is on. */
  currentPlan: string;
  /** Starts a plan change. */
  changePlan: string;
  /** Starts a cancellation. */
  cancelPlan: string;
  /** Backs out of a cancellation. */
  keepPlan: string;
  /** Section/tab: the subscription itself. */
  sectionStatus: string;
  /** Section/tab: the plans on offer. */
  sectionPlans: string;
  /** Section/tab: the packs on offer. */
  sectionPacks: string;
  /** Section/tab: usage against the plan's limits. */
  sectionUsage: string;
  /** Section/tab: the features the plan grants. */
  sectionFeatures: string;
  /** Section/tab: per-user feature overrides (admins only). */
  sectionOverrides: string;

  // ── Shared ─────────────────────────────────────────────────────────────────

  /** Said by a view that has not shipped yet. */
  viewNotAvailable: string;
}

/** The out-of-the-box copy. Plain ASCII, and the same words the live sites use today. */
export const DEFAULT_LABELS: RegistrationSubscriptionLabels = {
  billingMonthly: 'Monthly',
  billingAnnual: 'Annual',
  billingToggleAriaLabel: 'Toggle annual billing',
  annualSavings: 'Save up to {percent}%',
  loadingPlans: 'Loading plans...',
  pricingUnavailable: 'Pricing is unavailable right now',
  retry: 'Retry',
  contactUs: 'Contact us',
  morePacks: 'More packs',
  packUnavailable: 'Not yet available',
  packSelect: 'Select',
  packSelectNamed: 'Select {name}',
  continueWithPacks: 'Continue with {count} packs',
  continueWithOnePack: 'Continue with 1 pack',

  registrationClosed: 'Registration is closed',
  createAccount: 'Create account',
  continueLabel: 'Continue',
  back: 'Back',
  cancel: 'Cancel',
  skipForNow: 'Skip for now',
  haveToken: 'Have a registration token?',
  tokenLabel: 'Registration token',
  emailLabel: 'Email',
  choosePlan: 'Choose a plan',
  choosePacks: 'Choose your packs',
  reviewSelection: 'Review your selection',
  signupComplete: 'You are all set',
  alreadySignedIn: 'You are already signed in',

  currentPlan: 'Current plan',
  changePlan: 'Change plan',
  cancelPlan: 'Cancel plan',
  keepPlan: 'Keep plan',
  sectionStatus: 'Subscription',
  sectionPlans: 'Plans',
  sectionPacks: 'Packs',
  sectionUsage: 'Usage',
  sectionFeatures: 'Features',
  sectionOverrides: 'Overrides',

  viewNotAvailable: 'This view is not available yet',
};

/**
 * Fill `{placeholder}` slots in a label. A slot with no matching value is left as written rather
 * than blanked, so a mistyped override reads as a bug instead of silently losing a word.
 */
export function formatLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

/** The host's overrides layered onto {@link DEFAULT_LABELS}. */
export function resolveLabels(overrides?: Partial<RegistrationSubscriptionLabels>): RegistrationSubscriptionLabels {
  return overrides ? { ...DEFAULT_LABELS, ...overrides } : DEFAULT_LABELS;
}
