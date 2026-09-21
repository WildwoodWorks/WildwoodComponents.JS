/**
 * The native signup view: an account, a plan, packs and a card, in the order that keeps them
 * consistent.
 *
 * The ORDER itself is the shared `signupMachine`, so the behavioural half of this file drives that
 * machine directly - which is the same machine the web view walks, and therefore the only way to
 * assert "a token's grant skips the plan" once rather than twice. The view's own decisions live in
 * `views/signupViewModel.ts` and are called here as functions; this package ships no component
 * renderer under vitest, so a rule that lived inside JSX would be a rule nobody could test.
 *
 * The source half guards the three facts a rule cannot carry: that no price is written into the
 * component, that no copy with a label key is, and - the one this stack exists to keep - that a
 * device with no payment SDK never asks the server for a card intent it could not confirm.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_ADDON_SELECTION,
  formatMoney,
  type AppTierModel,
  type AppTierPricingModel,
  type RegistrationTokenAppGrant,
} from '@wildwood/core';
import {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as LABELS,
  initialSignupState,
  resolveSignupRegistrationMode,
  signupTransition,
  type SignupRegistrationMode,
  type SignupState,
  type StepToken,
} from '@wildwood/react-shared';
import {
  DEFAULT_SIGNUP_PAYMENT_ORDER,
  cappedPreSelectedPackIds,
  packCheckoutCanRetry,
  packCheckoutCardBranch,
  packCheckoutStatusText,
  packPurchaseOffered,
  planPeriodSuffix,
  signupBody,
  signupHighlightTierId,
  signupPaymentOrder,
  signupPaymentProps,
  signupSuccessMessage,
  showsTokenPlanSummary,
  unbuyablePackOutcomes,
  type SignupBody,
  type SignupBodyInput,
} from '../components/registrationSubscription/views/signupViewModel';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PRO_MONTHLY = 79;

const proTier = {
  id: 'tier-pro',
  name: 'Pro',
  isFreeTier: false,
  pricingOptions: [],
} as unknown as AppTierModel;

const proPricing = {
  id: 'price-pro-monthly',
  price: PRO_MONTHLY,
  billingFrequency: 'Monthly',
  pricingModelId: 'pm-pro',
  trialDays: 14,
} as unknown as AppTierPricingModel;

/** Open registration, no token entry at all: the shortest path through the form. */
const plainMode = resolveSignupRegistrationMode({ allowOpenRegistration: true, allowTokenRegistration: false });
/** Open registration with the optional token card, which is what puts the token step in the order. */
const optionalTokenMode = resolveSignupRegistrationMode({ allowOpenRegistration: true, allowTokenRegistration: true });

const NAMES = {
  tiers: { 'tier-pro': 'Pro', 'tier-team': 'Team' },
  addOns: { 'pack-docs': 'Docs Pack', 'pack-ai': 'AI Pack' },
};

interface WalkOptions {
  mode: SignupRegistrationMode;
  tokenMode?: 'auto' | 'required';
  planSelection?: 'choose' | 'skip';
  packSelection?: 'choose' | 'none';
  paymentOrder?: 'beforeAccount' | 'afterAccount';
  addOnIds?: string[];
  tierId?: string;
  pricingId?: string;
  requiresPayment?: boolean;
}

/** Loaded, resolved and sitting on the register step - where every test below starts. */
function atRegisterStep(options: WalkOptions): SignupState {
  let state = initialSignupState({
    tokenMode: options.tokenMode ?? 'auto',
    planSelection: options.planSelection ?? 'choose',
    packSelection: options.packSelection ?? 'none',
    paymentOrder: options.paymentOrder ?? DEFAULT_SIGNUP_PAYMENT_ORDER,
    selection: { addOnIds: options.addOnIds ?? [] },
  });
  state = signupTransition(state, { type: 'INIT', signedIn: false });
  state = signupTransition(state, { type: 'MODE_LOADED', mode: options.mode });
  state = signupTransition(state, {
    type: 'SELECTION_RESOLVED',
    tierId: options.tierId,
    pricingId: options.pricingId,
    addOnIds: options.addOnIds ?? [],
    requiresPayment: options.requiresPayment === true,
  });
  state = signupTransition(state, { type: 'CATALOG_LOADED', names: NAMES });
  return state;
}

// ── Which body renders ─────────────────────────────────────────────────────────

describe('signupBody', () => {
  const base: SignupBodyInput = {
    step: 'register',
    alreadySignedIn: false,
    hasPlan: false,
    formSubmitted: false,
    storeOnly: false,
    hasStoreProduct: false,
  };

  it('offers a signed-in visitor a notice rather than a second account', () => {
    expect(signupBody({ ...base, alreadySignedIn: true })).toBe('signedIn');
    // Whatever step the flow happens to be on underneath.
    expect(signupBody({ ...base, step: 'plan', alreadySignedIn: true })).toBe('signedIn');
  });

  it('renders each step under its own name, with the machine done spelled success', () => {
    for (const step of ['loading', 'closed', 'register', 'token', 'plan', 'packs', 'creating'] as const) {
      expect(signupBody({ ...base, step })).toBe(step);
    }
    expect(signupBody({ ...base, step: 'done' })).toBe('success');
    expect(signupBody({ ...base, step: 'failed' })).toBe('failed');
  });

  it('never shows a card form with nothing to charge for', () => {
    // No plan left in the catalog, or a form that was never submitted: a card taken there would be a
    // charge with nothing to attach it to. The flow is already on its way back to the form.
    expect(signupBody({ ...base, step: 'payment', hasPlan: false, formSubmitted: true })).toBe('loading');
    expect(signupBody({ ...base, step: 'payment', hasPlan: true, formSubmitted: false })).toBe('loading');
    expect(signupBody({ ...base, step: 'payment', hasPlan: true, formSubmitted: true })).toBe('payment');
  });

  it('buys a store-billed plan from the store, and says so when nothing is mapped to it', () => {
    const paying = { ...base, step: 'payment' as const, hasPlan: true, formSubmitted: true };
    expect(signupBody({ ...paying, storeOnly: true, hasStoreProduct: true })).toBe('storePayment');
    // Store-billed with no product behind the plan: there is no way to take the money here, and a
    // card form would only be refused by the store.
    expect(signupBody({ ...paying, storeOnly: true, hasStoreProduct: false })).toBe('storeUnavailable');
  });
});

// ── What the token granted, shown beside the step ──────────────────────────────

/** Every body the view can render, so the rule below is answered for all of them. */
const ALL_BODIES: SignupBody[] = [
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
  'signedIn',
  'storePayment',
  'storeUnavailable',
];

describe('showsTokenPlanSummary', () => {
  const grant = { appTierId: 'tier-team', appTierName: 'Team' } as RegistrationTokenAppGrant;

  it('shows what the token granted beside every body the web shows it beside', () => {
    // The web renders `TokenPlanSummary` in its outer frame, above whichever step is on screen, and
    // leaves it out of exactly one place: the signed-in early return, which offers a notice and no
    // second account. A signup on a token that also has disclaimers to accept therefore still sees
    // what the token paid for while accepting them.
    for (const body of ALL_BODIES) {
      expect(showsTokenPlanSummary(body, grant)).toBe(body !== 'signedIn');
    }
  });

  it('shows nothing at all when no token granted anything', () => {
    for (const body of ALL_BODIES) {
      expect(showsTokenPlanSummary(body, null)).toBe(false);
      expect(showsTokenPlanSummary(body, undefined)).toBe(false);
    }
  });
});

// ── Which plan the grid opens marked ───────────────────────────────────────────

describe('signupHighlightTierId', () => {
  it("prefers the visitor's own choice over anything suggested for them", () => {
    expect(signupHighlightTierId('tier-team', 'tier-free', 'tier-pro')).toBe('tier-team');
  });

  it("opens on the flow's default when nothing has been chosen yet", () => {
    // `planDefault="free"` is what puts a free tier id there. It is a highlight, not a selection:
    // the plan step still runs and the visitor still taps the card.
    expect(signupHighlightTierId(undefined, 'tier-free', undefined)).toBe('tier-free');
  });

  it("puts the link's plan behind the default, exactly as the web does", () => {
    // A `preSelectedTierId` still on screen at the plan step is one the flow refused - stale or
    // hand-edited - so the grid opens on the host's default rather than on nothing at all.
    expect(signupHighlightTierId(undefined, 'tier-free', 'tier-gone')).toBe('tier-free');
  });

  it("falls back to the link's plan when the host named no default", () => {
    expect(signupHighlightTierId(undefined, undefined, 'tier-pro')).toBe('tier-pro');
  });

  it('marks nothing when nothing has named a plan', () => {
    expect(signupHighlightTierId(undefined, undefined, undefined)).toBeUndefined();
  });
});

// ── The order the card is taken in ─────────────────────────────────────────────

describe('the payment order', () => {
  it('defaults to account-first on this stack, where the web is pay-first', () => {
    expect(DEFAULT_SIGNUP_PAYMENT_ORDER).toBe('afterAccount');
    expect(signupPaymentOrder(undefined)).toBe('afterAccount');
    // A host billing by card only can still ask for the web's order.
    expect(signupPaymentOrder('beforeAccount')).toBe('beforeAccount');
  });

  it('makes the account first, then asks for the card', () => {
    let state = atRegisterStep({
      mode: plainMode,
      tierId: 'tier-pro',
      pricingId: proPricing.id,
      requiresPayment: true,
    });
    expect(state.step).toBe('register');

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    // The card is NOT taken on the way to the account: a store purchase made before a registration
    // that then fails would strand a paid subscription with nobody to attach it to.
    expect(state.step).toBe('creating');

    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token as StepToken,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('payment');
    expect(state.paymentAfterAccount).toBe(true);
  });

  it('takes the card before the account when the host asks for the web order', () => {
    let state = atRegisterStep({
      mode: plainMode,
      paymentOrder: 'beforeAccount',
      tierId: 'tier-pro',
      pricingId: proPricing.id,
      requiresPayment: true,
    });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    expect(state.step).toBe('payment');
    expect(state.paymentAfterAccount).toBe(false);
  });

  it('finishes the signup when the customer walks away from the card, and says the plan is pending', () => {
    let state = atRegisterStep({
      mode: plainMode,
      tierId: 'tier-pro',
      pricingId: proPricing.id,
      requiresPayment: true,
    });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token as StepToken,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });

    // The account is real and the visitor keeps it; only the plan is outstanding.
    expect(state.step).toBe('done');
    expect(state.outcome).toMatchObject({
      userId: 'user-1',
      tier: { tierId: 'tier-pro', name: 'Pro', pricingId: proPricing.id },
      planActivationPending: true,
    });
    expect(
      signupSuccessMessage({
        labels: LABELS,
        hasTokenGrant: false,
        hasPlan: true,
        subscriptionFailed: false,
        planActivationPending: state.outcome?.planActivationPending === true,
        trialDays: 14,
      }),
    ).toBe(LABELS.signupCompletePending);
  });

  it('leaves the pending flag off an ordinary outcome rather than carrying a dead one', () => {
    // No plan at all: nothing to pay for, so nothing can be left pending.
    let state = atRegisterStep({ mode: plainMode, planSelection: 'skip' });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token as StepToken,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('done');
    expect(state.outcome?.planActivationPending).toBeUndefined();
    expect(state.outcome?.tier).toBeNull();
  });
});

// ── Registration tokens ────────────────────────────────────────────────────────

describe("a registration token's grant", () => {
  function withGrant(addOnIds: string[]): SignupState {
    let state = atRegisterStep({
      mode: optionalTokenMode,
      addOnIds: ['pack-docs', 'pack-ai'],
      // No preset plan: the plan step is genuinely in the order until the grant takes it out.
    });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    expect(state.step).toBe('token');
    state = signupTransition(state, { type: 'TOKEN_CHECK_STARTED' });
    return signupTransition(state, {
      type: 'TOKEN_ACCEPTED',
      token: state.token as StepToken,
      value: 'token-value',
      grant: { tierId: 'tier-team', pricingId: 'price-team', addOnIds, featureCodes: ['DOCUMENTS'] },
    });
  }

  it('skips the plan and the card, and drops the packs it already covers', () => {
    const state = withGrant(['pack-docs']);

    // Nothing left to choose and nothing to charge for: straight to creating the account.
    expect(state.step).toBe('creating');
    // The granted pack is not bought again; the one the visitor added still is.
    expect(state.packsToBuy).toEqual(['pack-ai']);
  });

  it('reports the granted packs first, unpriced, alongside the ones that were bought', () => {
    let state = withGrant(['pack-docs']);
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token as StepToken,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('packCheckout');

    state = signupTransition(state, {
      type: 'PACK_CHECKOUT_FINISHED',
      token: state.token as StepToken,
      packs: [{ addOnId: 'pack-ai', name: 'AI Pack', status: 'active' }],
    });

    expect(state.step).toBe('done');
    expect(state.outcome?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'granted' },
      { addOnId: 'pack-ai', name: 'AI Pack', status: 'active' },
    ]);
    // The plan is the token's, named from the catalog, and the grant travels with the outcome.
    expect(state.outcome?.tier).toEqual({ tierId: 'tier-team', name: 'Team', pricingId: 'price-team' });
    expect(state.outcome?.tokenGrant).toMatchObject({ tierId: 'tier-team', featureCodes: ['DOCUMENTS'] });
  });

  it('says the token set the account up, in the plan name the server sent', () => {
    expect(
      signupSuccessMessage({
        labels: LABELS,
        hasTokenGrant: true,
        tokenPlanName: 'Team',
        hasPlan: true,
        subscriptionFailed: false,
        planActivationPending: false,
        trialDays: 0,
      }),
    ).toContain('Team');
  });
});

describe('invite redemption', () => {
  it('overrides a closed configuration, because the server validates the invite itself', () => {
    const closedConfig = { allowOpenRegistration: false, allowTokenRegistration: false };
    expect(resolveSignupRegistrationMode(closedConfig).closed).toBe(true);

    const invite = resolveSignupRegistrationMode(closedConfig, { tokenMode: 'required' });
    expect(invite).toMatchObject({ closed: false, requireToken: true, allowOpenRegistration: false });
  });

  it('asks for the token and nothing else - no plan, no packs', () => {
    const invite = resolveSignupRegistrationMode(
      { allowOpenRegistration: false, allowTokenRegistration: false },
      { tokenMode: 'required' },
    );
    let state = atRegisterStep({ mode: invite, tokenMode: 'required', packSelection: 'choose' });
    expect(state.step).toBe('register');

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'invited@b.test' });
    expect(state.step).toBe('token');
    state = signupTransition(state, { type: 'TOKEN_CHECK_STARTED' });
    state = signupTransition(state, {
      type: 'TOKEN_ACCEPTED',
      token: state.token as StepToken,
      value: 'invite-token',
    });

    // Even with the pack step turned on, an invite is "take what the invite gives".
    expect(state.step).toBe('creating');
  });
});

describe('the already-signed-in latch', () => {
  it('latches on the first look and never changes its mind', () => {
    let state = initialSignupState();
    state = signupTransition(state, { type: 'INIT', signedIn: true });
    expect(state.alreadySignedInLatched).toBe(true);

    // A second INIT is ignored down to the object identity, so nothing re-renders on it.
    const again = signupTransition(state, { type: 'INIT', signedIn: false });
    expect(again).toBe(state);
  });

  it('does not let a login made DURING the flow look like a session that was already there', () => {
    let state = initialSignupState();
    state = signupTransition(state, { type: 'INIT', signedIn: false });
    state = signupTransition(state, { type: 'INIT', signedIn: true });
    expect(state.alreadySignedInLatched).toBe(false);
  });

  it('keeps the latch across Start Over, because it belongs to the visit', () => {
    let state = initialSignupState();
    state = signupTransition(state, { type: 'INIT', signedIn: true });
    state = signupTransition(state, { type: 'RESET' });
    expect(state.alreadySignedInLatched).toBe(true);
  });
});

// ── Packs a link carried in ────────────────────────────────────────────────────

describe('cappedPreSelectedPackIds', () => {
  it('drops duplicates and stops at the platform pack cap', () => {
    const many = Array.from({ length: MAX_ADDON_SELECTION + 5 }, (_, index) => `pack-${index}`);
    expect(cappedPreSelectedPackIds(many)).toHaveLength(MAX_ADDON_SELECTION);
    expect(cappedPreSelectedPackIds(['a', 'a', 'b'])).toEqual(['a', 'b']);
    expect(cappedPreSelectedPackIds(undefined)).toEqual([]);
  });

  it("still buys a link's packs when the pack STEP is turned off", () => {
    // `packSelection: 'none'` removes the step where packs are picked. It does not un-choose the
    // packs a signup link already chose - those are still bought after login.
    let state = atRegisterStep({
      mode: plainMode,
      planSelection: 'skip',
      packSelection: 'none',
      addOnIds: ['pack-docs'],
    });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@b.test' });
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token as StepToken,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('packCheckout');
    expect(state.packsToBuy).toEqual(['pack-docs']);
  });
});

// ── What the payment step is handed ────────────────────────────────────────────

describe('signupPaymentProps', () => {
  it("charges the plan's own price, on its own pricing model", () => {
    const payment = signupPaymentProps(proTier, proPricing, 'USD', 14);
    expect(payment).toEqual({
      amount: PRO_MONTHLY,
      currency: 'USD',
      description: 'Pro',
      pricingModelId: 'pm-pro',
      isSubscription: true,
      trialDays: 14,
    });
    // The figure on screen is the same one, formatted - never a second opinion.
    expect(formatMoney(payment.amount, payment.currency)).toBe(formatMoney(PRO_MONTHLY, 'USD'));
  });

  it('offers no trial when there is none, rather than a zero-day one', () => {
    expect(signupPaymentProps(proTier, proPricing, 'USD', 0).trialDays).toBeUndefined();
  });

  it('invents nothing for a plan with no pricing option', () => {
    const payment = signupPaymentProps(proTier, null, 'USD', 0);
    expect(payment.amount).toBe(0);
    expect(payment.pricingModelId).toBeUndefined();
  });

  it('names the period the server named, and nothing when it named none', () => {
    expect(planPeriodSuffix('Monthly')).toBe('/monthly');
    expect(planPeriodSuffix(undefined)).toBe('');
    expect(planPeriodSuffix('  ')).toBe('');
  });
});

// ── Buying packs with no payment SDK ───────────────────────────────────────────

describe('the pack-checkout card branch', () => {
  it('uses the card already on file when the quote says there is one', () => {
    expect(packCheckoutCardBranch({ requiresPaymentMethod: false, canConfirmCardSetup: false })).toBe('savedCard');
    expect(packCheckoutCardBranch({ requiresPaymentMethod: false, canConfirmCardSetup: true })).toBe('savedCard');
  });

  it("collects the card once through the host's handler when one is wired", () => {
    expect(packCheckoutCardBranch({ requiresPaymentMethod: true, canConfirmCardSetup: true })).toBe('handlerCard');
  });

  it('asks for no card at all when nothing on the device can confirm one', () => {
    expect(packCheckoutCardBranch({ requiresPaymentMethod: true, canConfirmCardSetup: false })).toBe('finishOnWeb');
    // And offers no Try Again, which would fail again for exactly the same reason.
    expect(packCheckoutCanRetry('finishOnWeb')).toBe(false);
    expect(packCheckoutCanRetry('handlerCard')).toBe(true);
    expect(packCheckoutCanRetry('savedCard')).toBe(true);
  });

  it('names the pack the bank is being asked about', () => {
    expect(packCheckoutStatusText('checkingOut', 'Docs Pack', LABELS)).toBe(LABELS.buyingPacks);
    expect(packCheckoutStatusText('authenticating', 'Docs Pack', LABELS)).toContain('Docs Pack');
    expect(packCheckoutStatusText('completing', 'Docs Pack', LABELS)).toContain('Docs Pack');
  });
});

describe('a store-billed device', () => {
  it('does not offer to sell packs, because no store product stands behind one', () => {
    expect(packPurchaseOffered(true)).toBe(false);
    expect(packPurchaseOffered(false)).toBe(true);
  });

  it('reports the packs it cannot buy instead of quietly forgetting them', () => {
    const outcomes = unbuyablePackOutcomes(
      [{ addOnId: 'pack-docs' }, { addOnId: 'pack-unknown' }],
      { 'pack-docs': 'Docs Pack' },
      LABELS.finishOnWeb,
    );
    expect(outcomes).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'failed', errorMessage: LABELS.finishOnWeb },
      { addOnId: 'pack-unknown', name: 'pack-unknown', status: 'failed', errorMessage: LABELS.finishOnWeb },
    ]);
  });
});

// ── What the success panel says ────────────────────────────────────────────────

describe('signupSuccessMessage', () => {
  const base = {
    labels: LABELS,
    hasTokenGrant: false,
    hasPlan: true,
    subscriptionFailed: false,
    planActivationPending: false,
    trialDays: 0,
  };

  it('says the account is made when no plan was chosen', () => {
    expect(signupSuccessMessage({ ...base, hasPlan: false })).toBe(LABELS.signupCompletePlain);
  });

  it('says the plan is pending when the server refused the subscription', () => {
    expect(signupSuccessMessage({ ...base, subscriptionFailed: true })).toBe(LABELS.signupCompletePending);
  });

  it('counts the trial days the plan actually carries', () => {
    expect(signupSuccessMessage({ ...base, trialDays: 14 })).toContain('14');
  });

  it('says the plan is running when it is', () => {
    expect(signupSuccessMessage(base)).toBe(LABELS.signupCompleteActive);
  });

  it("falls back to the word 'plan' when the token named none", () => {
    expect(signupSuccessMessage({ ...base, hasTokenGrant: true, tokenPlanName: null })).toBe(
      LABELS.signupCompleteToken.replace('{tier}', 'plan'),
    );
  });
});

// ── Source guards ──────────────────────────────────────────────────────────────

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_DIR = resolve(SRC, 'components/registrationSubscription');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** The code, without the comments - which quote the web's attributes and copy on purpose. */
const readCode = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const FILES = sourceFiles(COMPONENT_DIR);

describe('the signup copy comes from the shared labels', () => {
  // The two exceptions are deliberate and match the web byte for byte: the register form's submit
  // text reads "Create Account" when the form is the last thing before an account exists.
  const LABELLED = [
    LABELS.loadingSignup,
    LABELS.registrationClosed,
    LABELS.checkingToken,
    LABELS.choosePlan,
    LABELS.choosePacks,
    LABELS.alreadySignedIn,
    LABELS.planFree,
    LABELS.tokenPlanIncludes,
    LABELS.orderSummary,
    LABELS.dueToday,
    LABELS.buyingPacks,
    LABELS.packsUnavailable,
    LABELS.packStatusTrialing,
    LABELS.packStatusGranted,
    LABELS.disclaimersTitle,
    LABELS.disclaimersIntro,
    LABELS.statusCreatingAccount,
    LABELS.processingWait,
    LABELS.signupFailed,
    LABELS.tryAgain,
    LABELS.startOver,
    LABELS.signupCompleteTitle,
    LABELS.getStarted,
    LABELS.finishOnWeb,
    LABELS.skipForNow,
    LABELS.back,
    LABELS.cancel,
  ];

  it.each(FILES)('%s hard-codes no labelled copy', (file) => {
    const source = readCode(file);
    for (const copy of LABELLED) {
      expect(source).not.toContain(`'${copy}'`);
      expect(source).not.toContain(`"${copy}"`);
    }
  });
});

describe('the pack checkout never asks for a card it cannot confirm', () => {
  const source = readCode(resolve(COMPONENT_DIR, 'parts/PackCheckout.tsx'));

  it('drives the shared flow rather than a second implementation of it', () => {
    expect(source).toContain('usePackCheckoutFlow(');
    expect(source).toContain('paymentActions: handler');
  });

  it('never claims to collect the card itself - that flag is the web card field', () => {
    expect(source).not.toContain('hostCollectsCard');
  });

  it('never creates a SetupIntent of its own', () => {
    // Asking the server for a client secret nothing on this device can confirm would leave a card
    // intent open and the customer stranded. The flow refuses to create one without a handler, and
    // this file must not go around it.
    expect(source).not.toContain('createCheckoutPaymentMethod');
  });

  it('reads the handler through the package seam, so the provider-wide one is honoured', () => {
    expect(source).toContain('usePaymentActionHandler(paymentActionHandler)');
  });
});

describe('the signup view source', () => {
  const source = readCode(resolve(COMPONENT_DIR, 'views/RegistrationSubscriptionSignup.tsx'));

  it('renders the shared flow rather than re-deriving the order', () => {
    expect(source).toContain('useSignupFlow(');
    expect(source).toContain('signupPaymentOrder(props.paymentOrder)');
  });

  it('prefills the form from the invitation through the flow', () => {
    expect(source).toContain('initialFormData={flow.initialFormData}');
    expect(source).toContain('registrationToken={props.registrationToken}');
  });

  it('reuses this package own disclaimer, token-registration and payment components', () => {
    expect(source).toContain('<DisclaimerComponent');
    expect(source).toContain('<TokenRegistrationComponent');
    expect(source).toContain('<PaymentComponent');
  });

  it('buys a store-billed plan through the store path this package already ships', () => {
    expect(source).toContain('useInAppPurchases(');
    expect(source).toContain('<InAppPurchaseSheet');
    expect(source).toContain('requiresAppStorePayment');
  });

  it('abandons an account-first card rather than stranding the account', () => {
    expect(source).toContain('flow.paymentAbandoned');
  });

  it('renders what the token granted from the rule, in every frame it returns', () => {
    // The disclaimers step returns a frame of its own - DisclaimerComponent brings its own scroller
    // - so "the outer frame renders the summary" is not something the JSX can be trusted to repeat.
    // There is ONE element, its visibility is `showsTokenPlanSummary`, and every root this
    // component returns renders it: add a frame without it and these counts diverge.
    expect(source).toContain('showsTokenPlanSummary(body, flow.tokenGrant)');
    expect(source.match(/<TokenPlanSummary/g) ?? []).toHaveLength(1);

    const roots = source.match(/testID=\{testID \?\?/g) ?? [];
    expect(roots.length).toBeGreaterThan(1);
    expect(source.match(/\{tokenSummary\}/g) ?? []).toHaveLength(roots.length);
  });
});

describe('the signup sources take no payment SDK', () => {
  it.each(FILES)('%s imports no payment SDK', (file) => {
    const source = readCode(file);
    expect(source).not.toMatch(/from\s+['"]@?stripe/i);
    expect(source).not.toMatch(/\bloadStripe\b|\bgetStripeInstance\b/);
  });
});

describe('the view model has no UI in it', () => {
  const source = readCode(resolve(COMPONENT_DIR, 'views/signupViewModel.ts'));

  it('imports neither react nor react-native, so every rule above is testable', () => {
    expect(source).not.toMatch(/from\s+['"]react['"]/);
    expect(source).not.toMatch(/from\s+['"]react-native['"]/);
  });
});
