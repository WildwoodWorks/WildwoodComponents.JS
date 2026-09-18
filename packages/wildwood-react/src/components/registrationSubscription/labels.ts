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

  // ── Signup view ────────────────────────────────────────────────────────────

  /** Said while the app's registration settings and catalog are still being read. */
  loadingSignup: string;
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

  /** Shown on a free plan in the plan summary card, where a price would otherwise be. */
  planFree: string;
  /** Heading over the plan and packs a registration token sets up. */
  tokenPlanIncludes: string;
  /** Sub-heading over the token's packs. */
  tokenPlanPacks: string;
  /** Sub-heading over the token's extra features. */
  tokenPlanFeatures: string;
  /** Said while the registration token is being checked. */
  checkingToken: string;

  /** Heading over what is about to be charged. */
  orderSummary: string;
  /** Labels the amount charged today (zero while a trial runs). */
  dueToday: string;
  /** The card already on file. `{brand}` and `{last4}` come from the server's quote. */
  savedCardOnFile: string;
  /** Field label over the card entry. */
  cardDetails: string;
  /** Saves the card and continues the purchase. */
  saveCard: string;
  /** Said while the packs are being bought. */
  buyingPacks: string;
  /** Said while one pack's card is being authenticated with the bank. */
  authenticatingPack: string;
  /** Said when a pack purchase was refused and no message came back. */
  packsUnavailable: string;

  /** Pack outcome: the pack's trial has started. */
  packStatusTrialing: string;
  /** Pack outcome: the pack is running and paid for. */
  packStatusActive: string;
  /** Pack outcome: the pack could not be bought. */
  packStatusFailed: string;
  /** Pack outcome: the registration token included the pack. */
  packStatusGranted: string;

  /** Heading over the disclaimers step. */
  disclaimersTitle: string;
  /** Sentence under that heading. */
  disclaimersIntro: string;

  /** Status while the account is being registered. */
  statusCreatingAccount: string;
  /** Status while the new account is being signed in. */
  statusSigningIn: string;
  /** Status while the plan is being activated. */
  statusActivatingPlan: string;
  /** Reassurance under the processing status. */
  processingWait: string;
  /** Heading of the failed-signup panel. */
  signupFailed: string;
  /** Resumes a failed signup where it stopped. */
  tryAgain: string;
  /** Throws the attempt away and returns to the form. */
  startOver: string;

  /** Heading of the success panel. */
  signupCompleteTitle: string;
  /** Success copy when a registration token set the account up. `{tier}` is the granted plan. */
  signupCompleteToken: string;
  /** Success copy when the plan started a trial. `{days}` is the trial length. */
  signupCompleteTrial: string;
  /** Success copy when no plan was chosen. */
  signupCompletePlain: string;
  /** Success copy when the plan is running. */
  signupCompleteActive: string;
  /** Success copy when the account exists but the plan could not be activated. */
  signupCompletePending: string;
  /** Leaves the finished signup. */
  getStarted: string;

  // ── Manage view ────────────────────────────────────────────────────────────

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

  /** Title of the built-in card modal. `{tier}` is the plan being moved to. */
  upgradeToPlan: string;
  /** Accessible name of that modal's close button. */
  closePayment: string;
  /** Said while the prorated charge is being confirmed with the bank. */
  authenticatingChange: string;
  /** Said while the server finishes applying a paid-for change. */
  applyingChange: string;
  /** Heading over a failed plan change. */
  planChangeFailed: string;
  /** Said when the parked change's payment window closed before it was finished. */
  planChangeExpired: string;
  /** Said when the prorated charge was refused. */
  planChangePaymentFailed: string;
  /** Said when another change replaced the one being finished. */
  planChangeSuperseded: string;
  /** Said when the parked change is no longer on the server. */
  planChangeNotFound: string;
  /** Said when a change is already under way on this subscription. */
  planChangeInProgress: string;
  /** Said when a payment went through but carried no id to complete the change with. */
  paymentUnconfirmed: string;
  /** Opens the pack picker from the packs panel. */
  addPacks: string;
  /** Heading of the pack picker. */
  addPacksTitle: string;
  /** Badge on a pack nothing bills: a registration token's, or an admin grant. */
  packIncluded: string;
  /** Confirmation copy before cancelling a pack nothing bills. */
  packCancelIncluded: string;
  /** Confirmation copy before cancelling a pack that is billed. */
  packCancelBilled: string;
  /** Confirms a pack cancellation. */
  packCancelConfirm: string;
  /** Backs out of a pack cancellation. */
  packCancelKeep: string;
  /** Takes back a scheduled pack cancellation. */
  packReactivate: string;
  /** Marks a feature an override grants outside the plan. */
  featureIncluded: string;

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

  loadingSignup: 'Getting things ready...',
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

  planFree: 'Free',
  tokenPlanIncludes: 'Your registration token includes',
  tokenPlanPacks: 'Packs',
  tokenPlanFeatures: 'Features',
  checkingToken: 'Checking your registration token...',

  orderSummary: 'Order Summary',
  dueToday: 'Due today',
  savedCardOnFile: '{brand} ending in {last4}',
  cardDetails: 'Card Details',
  saveCard: 'Save card and continue',
  buyingPacks: 'Setting up your packs...',
  authenticatingPack: 'Confirming {name} with your bank...',
  packsUnavailable: 'Your packs could not be bought.',

  packStatusTrialing: 'Trial started',
  packStatusActive: 'Active',
  packStatusFailed: 'Could not be added',
  packStatusGranted: 'Included',

  disclaimersTitle: 'One more step',
  disclaimersIntro: 'Please review and accept the following before continuing.',

  statusCreatingAccount: 'Creating your account...',
  statusSigningIn: 'Signing you in...',
  statusActivatingPlan: 'Activating your plan...',
  processingWait: 'Please wait while we set up your account.',
  signupFailed: 'Something Went Wrong',
  tryAgain: 'Try Again',
  startOver: 'Start Over',

  signupCompleteTitle: "You're All Set!",
  signupCompleteToken: 'Your account has been created with the {tier} from your registration token.',
  signupCompleteTrial: 'Your account has been created and your {days}-day free trial has started.',
  signupCompletePlain: 'Your account has been created successfully.',
  signupCompleteActive: 'Your account has been created and your plan is active.',
  signupCompletePending:
    'Your account is ready! Plan activation is pending - you can select a plan from your dashboard.',
  getStarted: 'Get Started',

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

  upgradeToPlan: 'Upgrade to {tier}',
  closePayment: 'Cancel payment',
  authenticatingChange: 'Confirming the charge with your bank...',
  applyingChange: 'Applying your new plan...',
  planChangeFailed: 'The plan change could not be completed',
  planChangeExpired: 'The payment window closed - please start the change again',
  planChangePaymentFailed: 'That payment was not completed, so your plan has not changed. Please try again.',
  planChangeSuperseded: 'This plan was changed somewhere else. Refresh and try again.',
  planChangeNotFound: 'That plan change is no longer available. Please start it again.',
  planChangeInProgress: 'A change to this plan is already under way. Give it a moment and refresh.',
  paymentUnconfirmed:
    'Your payment went through but the plan change could not be confirmed automatically. Please contact support with your receipt.',
  addPacks: 'Add packs',
  addPacksTitle: 'Add packs to your plan',
  packIncluded: 'Included with your registration',
  packCancelIncluded: 'This pack was included with your registration. Cancelling removes it from your account.',
  packCancelBilled: 'You keep access until the end of the current billing period.',
  packCancelConfirm: 'Cancel pack',
  packCancelKeep: 'Keep pack',
  packReactivate: 'Reactivate',
  featureIncluded: 'Included',

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
