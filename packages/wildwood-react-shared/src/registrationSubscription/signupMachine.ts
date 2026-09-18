// The signup flow, as a pure reducer.
//
// The default order is pay-first, because the plan's card has to be taken BEFORE the account exists
// — otherwise a card that fails leaves a half-made account on a plan nobody paid for:
//
//   1 mode + catalog loaded
//   2 register form (mounted once the mode is known)
//   3 token check — a plan grant skips the plan and the payment, and removes granted packs;
//     invite redemption (`tokenMode: 'required'`) skips the plan and the packs entirely
//   4 plan
//   5 packs
//   6 plan payment (before the account exists)
//   7 register, log in, link, self-subscribe
//   8 disclaimers
//   9 pack checkout (after login, because packs are bought as the signed-in user)
//  10 success
//
// `paymentOrder: 'afterAccount'` swaps 6 and 7, and is what the store-billed stacks want: a
// StoreKit or Play purchase that succeeds before a registration that then fails strands a paid
// subscription with no account to attach it to, which is worse than an account with no plan. The
// payment step then sits between the account and the disclaimers, and a customer who walks away
// from it still finishes the signup — with the plan's activation pending, said in so many words.
//
// Step 2 is a gate, not just an order: nothing past the form may run until it has been submitted.
// A signup link that preselects a plan offers "change plan" beside the form, so a visitor can be at
// the plan grid with an empty form — choosing there takes them back to the form with their new
// plan, never onward to a card form or an account creation that has no details to work with.
//
// No React and no client here: the hook that drives this runs the effects and dispatches results,
// and the views read `step`. Async steps carry a {@link StepToken} so a duplicated effect or a
// callback that fires twice cannot advance the flow twice.

import type { SignupRegistrationMode, SignupTokenMode } from '../authentication/registrationMode.js';
import { issueStepToken, isCurrentStep, type StepToken } from './stepTokens.js';

/** Where the signup flow is. */
export type SignupStep =
  | 'loading'
  | 'closed'
  | 'register'
  | 'token'
  | 'plan'
  | 'packs'
  | 'payment'
  | 'creating'
  | 'disclaimers'
  | 'packCheckout'
  | 'done'
  | 'failed';

/** What a registration token sets up, as the server's detailed validation reported it. */
export interface SignupTokenGrant {
  tierId: string;
  pricingId?: string;
  addOnIds: string[];
  featureCodes: string[];
}

/** What the visitor is buying. */
export interface SignupSelection {
  tierId?: string;
  pricingId?: string;
  addOnIds: string[];
}

/**
 * What became of one pack. `granted` is a pack the registration token set up — there is a
 * subscription row but no payment transaction behind it, so nothing was charged.
 */
export type SignupPackStatus = 'trialing' | 'active' | 'failed' | 'granted';

export interface SignupPackOutcome {
  addOnId: string;
  name: string;
  status: SignupPackStatus;
  trialEnd?: string;
  errorMessage?: string;
}

/** The plan the new account ended up on, or `null` when the signup chose no plan. */
export interface SignupOutcomeTier {
  tierId: string;
  name: string;
  pricingId?: string;
}

/** What a finished signup produced, for the host app's `onComplete`. */
export interface SignupOutcome {
  userId: string;
  tier: SignupOutcomeTier | null;
  packs: SignupPackOutcome[];
  tokenGrant?: SignupTokenGrant;
  /**
   * The account exists but its plan does not: an account-first signup whose payment step was
   * abandoned. Set only when it happened, so a success screen can say "plan activation is pending"
   * instead of "your plan is active".
   */
  planActivationPending?: boolean;
}

/**
 * When the plan's card is taken. `'beforeAccount'` is the web order — nothing is created until the
 * money is in. `'afterAccount'` is the store-billed order — nothing is charged until there is an
 * account to attach it to.
 */
export type SignupPaymentOrder = 'beforeAccount' | 'afterAccount';

/** Display names from the catalog, so an outcome can name a tier/pack without re-reading it. */
export interface SignupCatalogNames {
  tiers?: Record<string, string>;
  addOns?: Record<string, string>;
}

export interface SignupMachineOptions {
  /** `'required'` is invite redemption: the token step is the only way in, and packs are skipped. */
  tokenMode?: SignupTokenMode;
  /** `'skip'` leaves the plan to the app (a single-plan product, or a plan chosen elsewhere). */
  planSelection?: 'choose' | 'skip';
  /** `'none'` hides the pack step. */
  packSelection?: 'choose' | 'none';
  /** When the plan's card is taken. Default `'beforeAccount'`. */
  paymentOrder?: SignupPaymentOrder;
  /** A selection the signup link already made. */
  selection?: Partial<SignupSelection>;
}

/** The options with every default filled in, so the reducer never re-applies them. */
export interface ResolvedSignupOptions {
  tokenMode: SignupTokenMode;
  planSelection: 'choose' | 'skip';
  packSelection: 'choose' | 'none';
  paymentOrder: SignupPaymentOrder;
}

export interface SignupState {
  step: SignupStep;
  /** The async step in flight, or `null`. Results carrying another token are ignored. */
  token: StepToken | null;
  options: ResolvedSignupOptions;

  /** The registration mode, once `useRegistrationMode` has answered. */
  mode: SignupRegistrationMode | null;
  modeReady: boolean;
  catalogReady: boolean;
  names: SignupCatalogNames;

  selection: SignupSelection;
  /** Whether the chosen plan has to be paid for before the account is created. */
  planRequiresPayment: boolean;
  /**
   * The plan was decided before the form opened — a signup link's plan, or the app's default in a
   * `skip` flow — so the plan step is not walked. The visitor is shown what they are getting and a
   * way back to the grid (a `GO_TO` to `plan`) rather than a grid they have already chosen from.
   */
  planPreset: boolean;

  /**
   * Whether the registration form has actually been submitted.
   *
   * Everything after the form spends the visitor's money or creates their account, and both need
   * the details the form collects. "Change plan" can send them to the grid before they have typed
   * anything, so a plan or a pack chosen while this is false takes them back to the form rather
   * than onward — nothing may run ahead of it.
   */
  formSubmitted: boolean;

  email: string;
  userId: string;
  paymentTransactionId?: string;

  /**
   * The `payment` step is the ACCOUNT-FIRST one: the account already exists, so completing it
   * carries on to the disclaimers rather than to `creating`, and abandoning it is allowed.
   * Always false in the pay-first order.
   */
  paymentAfterAccount: boolean;
  /**
   * What `ACCOUNT_CREATED` said about disclaimers, remembered across an account-first payment step
   * so the machine still knows where to go once the card is done with.
   */
  pendingDisclaimers: boolean;
  /**
   * The account was created but its plan was not paid for: the customer walked away from the card.
   * Cleared again if they go back to the card and it goes through, so a retry that succeeds does
   * not leave a paying customer being told their plan is still pending.
   */
  planActivationPending: boolean;

  /** The registration token as typed, once validated. */
  tokenValue?: string;
  tokenGrant?: SignupTokenGrant;
  /** A token validation is in flight. */
  tokenChecking: boolean;
  /** A rejected token: a form-level message, not a failed flow. */
  tokenError: string | null;

  /** Packs still to buy after login — what was chosen, minus anything the grant already covers. */
  packsToBuy: string[];

  /** Whether the visitor was ALREADY signed in when the flow started. Latched at the first INIT. */
  alreadySignedInLatched: boolean;
  initialized: boolean;

  outcome: SignupOutcome | null;
  error: string | null;
  /** Which step a `RETRY` goes back to. */
  retryFrom: SignupStep | null;
}

export type SignupEvent =
  /** The flow started. Only the FIRST one latches `alreadySignedInLatched`. */
  | { type: 'INIT'; signedIn: boolean }
  | { type: 'MODE_LOADED'; mode: SignupRegistrationMode }
  | { type: 'CATALOG_LOADED'; names?: SignupCatalogNames }
  /**
   * The live catalog decided what the signup starts with: the plan a signup link preselected, or
   * the app's default plan in a `skip` flow, plus the packs the link asked for — all checked
   * against the catalog by whoever dispatches this. A resolved plan takes the plan step out of the
   * flow. Accepted only before the form is submitted; after that the plan and pack steps own the
   * selection.
   */
  | { type: 'SELECTION_RESOLVED'; tierId?: string; pricingId?: string; addOnIds?: string[]; requiresPayment?: boolean }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'REGISTER_SUBMITTED'; email: string }
  | { type: 'TOKEN_CHECK_STARTED' }
  | { type: 'TOKEN_ACCEPTED'; token: StepToken; value: string; grant?: SignupTokenGrant }
  | { type: 'TOKEN_REJECTED'; token: StepToken; message: string }
  | { type: 'TOKEN_SKIPPED' }
  | { type: 'PLAN_CHOSEN'; tierId?: string; pricingId?: string; requiresPayment?: boolean }
  | { type: 'PACKS_CHOSEN'; addOnIds: string[] }
  | { type: 'PAYMENT_COMPLETED'; paymentTransactionId: string }
  /**
   * The customer walked away from the plan's card. Only ever valid on the ACCOUNT-FIRST payment
   * step: there the account already exists, so the signup finishes with the plan unactivated
   * rather than throwing away a registration that succeeded. Ignored in the pay-first order, where
   * abandoning the card is simply a step back.
   */
  | { type: 'PAYMENT_ABANDONED' }
  | { type: 'ACCOUNT_CREATED'; token: StepToken; userId: string; requiresDisclaimers?: boolean }
  | { type: 'ACCOUNT_FAILED'; token: StepToken; message: string }
  | { type: 'DISCLAIMERS_ACCEPTED' }
  | { type: 'PACK_CHECKOUT_FINISHED'; token: StepToken; packs: SignupPackOutcome[] }
  | { type: 'PACK_CHECKOUT_FAILED'; token: StepToken; message: string }
  /** Back-navigation from a view. Only the form steps are reachable this way. */
  | { type: 'GO_TO'; step: Extract<SignupStep, 'register' | 'token' | 'plan' | 'packs' | 'payment'> }
  | { type: 'RETRY' }
  | { type: 'RESET' };

/** The steps the flow walks in order. Everything before `creating` may be skipped. */
const FORM_ORDER = ['register', 'token', 'plan', 'packs', 'payment', 'creating'] as const;

type FormStep = (typeof FORM_ORDER)[number];

function dedupe(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

export function initialSignupState(options: SignupMachineOptions = {}): SignupState {
  const resolved: ResolvedSignupOptions = {
    tokenMode: options.tokenMode ?? 'auto',
    planSelection: options.planSelection ?? 'choose',
    packSelection: options.packSelection ?? 'choose',
    paymentOrder: options.paymentOrder ?? 'beforeAccount',
  };
  const addOnIds = dedupe(options.selection?.addOnIds);
  return {
    step: 'loading',
    token: null,
    options: resolved,
    mode: null,
    modeReady: false,
    catalogReady: false,
    names: {},
    selection: {
      tierId: options.selection?.tierId,
      pricingId: options.selection?.pricingId,
      addOnIds,
    },
    planRequiresPayment: false,
    planPreset: false,
    formSubmitted: false,
    email: '',
    userId: '',
    paymentAfterAccount: false,
    pendingDisclaimers: false,
    planActivationPending: false,
    tokenChecking: false,
    tokenError: null,
    packsToBuy: addOnIds,
    alreadySignedInLatched: false,
    initialized: false,
    outcome: null,
    error: null,
    retryFrom: null,
  };
}

/**
 * Whether the plan still has to be paid for — the one question both payment positions ask, so the
 * pay-first step and the account-first one can never disagree about whether there is a card to
 * take. Exported because a driver has to ask it too: its `creating` work must leave the plan's
 * activation to an account-first payment step that is about to run.
 */
export function signupPlanNeedsPayment(state: SignupState): boolean {
  // A granted plan is paid for by whoever issued the token, and a free plan takes no card.
  return state.planRequiresPayment && state.tokenGrant == null && !!state.selection.tierId;
}

/** Whether a step is passed over for this flow. */
function isSkipped(state: SignupState, step: FormStep): boolean {
  switch (step) {
    case 'token':
      // No token path at all: neither required nor offered as an option.
      return !(state.mode?.requireToken || state.mode?.showOptionalTokenEntry);
    case 'plan':
      // A grant already names the plan, a resolved link already chose it, and invite redemption is
      // "take what the invite gives" — in none of those is there anything to choose.
      return (
        state.options.planSelection === 'skip' ||
        state.options.tokenMode === 'required' ||
        state.planPreset ||
        state.tokenGrant != null
      );
    case 'packs':
      // Invite redemption is "take what the invite gives", not a shopping trip.
      return state.options.packSelection === 'none' || state.options.tokenMode === 'required';
    case 'payment':
      // Account-first: the card is taken after `creating`, not inside the form's order, so the
      // form never walks a payment step at all.
      if (state.options.paymentOrder === 'afterAccount') return true;
      return !signupPlanNeedsPayment(state);
    default:
      return false;
  }
}

/** Move into a step, issuing a token when that step starts async work. */
function enter(state: SignupState, step: SignupStep): SignupState {
  const startsWork = step === 'creating' || step === 'packCheckout';
  return {
    ...state,
    step,
    token: startsWork ? issueStepToken() : null,
    tokenChecking: false,
    error: null,
    retryFrom: null,
  };
}

function fail(state: SignupState, message: string, retryFrom: SignupStep): SignupState {
  return { ...state, step: 'failed', token: null, tokenChecking: false, error: message, retryFrom };
}

/** The next step after `from`, skipping whatever this flow does not need. */
function advance(state: SignupState, from: FormStep): SignupState {
  // The form comes first, always. A visitor who followed "change plan" out of the form and chose
  // there is sent back to it with their new choice, rather than on towards a card form or an
  // account creation that has no details to work with.
  if (!state.formSubmitted) return enter(state, 'register');

  const start = FORM_ORDER.indexOf(from);
  for (let i = start + 1; i < FORM_ORDER.length; i += 1) {
    const step = FORM_ORDER[i] as FormStep;
    if (!isSkipped(state, step)) return enter(state, step);
  }
  return enter(state, 'creating');
}

function resolveTier(state: SignupState): SignupOutcomeTier | null {
  const tierId = state.tokenGrant?.tierId ?? state.selection.tierId;
  if (!tierId) return null;
  return {
    tierId,
    name: state.names.tiers?.[tierId] ?? tierId,
    pricingId: state.tokenGrant?.pricingId ?? state.selection.pricingId,
  };
}

/** Everything is done: build the outcome, granted packs first. */
function finish(state: SignupState, bought: SignupPackOutcome[]): SignupState {
  const granted: SignupPackOutcome[] = (state.tokenGrant?.addOnIds ?? []).map((addOnId) => ({
    addOnId,
    name: state.names.addOns?.[addOnId] ?? addOnId,
    status: 'granted',
  }));
  return {
    ...state,
    step: 'done',
    token: null,
    error: null,
    retryFrom: null,
    outcome: {
      userId: state.userId,
      tier: resolveTier(state),
      packs: [...granted, ...bought],
      tokenGrant: state.tokenGrant,
      // Left off entirely when it did not happen, so the ordinary outcome carries no dead flag.
      planActivationPending: state.planActivationPending ? true : undefined,
    },
  };
}

/** After the account exists and the disclaimers are out of the way. */
function afterDisclaimers(state: SignupState): SignupState {
  if (state.packsToBuy.length > 0) return enter(state, 'packCheckout');
  return finish(state, []);
}

/**
 * Leaving the ACCOUNT-FIRST payment step, whether the card was given or walked away from: on to
 * the disclaimers `ACCOUNT_CREATED` asked for, or straight past them — exactly where that event
 * would have gone had there been no card to take.
 */
function afterAccountPayment(state: SignupState): SignupState {
  const next: SignupState = { ...state, paymentAfterAccount: false };
  if (next.pendingDisclaimers) return enter(next, 'disclaimers');
  return afterDisclaimers(next);
}

/** Both the mode and the catalog are in: open the form, or say sign-up is closed. */
function startForm(state: SignupState): SignupState {
  if (!state.modeReady || !state.catalogReady) return state;
  if (state.mode?.closed) return { ...state, step: 'closed', token: null };
  return enter(state, 'register');
}

/**
 * The signup reducer. Pure apart from issuing step tokens, and it returns the SAME state object for
 * an event it ignores, so a React `useReducer` re-renders nothing.
 */
export function signupTransition(state: SignupState, event: SignupEvent): SignupState {
  switch (event.type) {
    case 'INIT':
      // Latched once: a mid-flow login must not look like "you were already signed in".
      if (state.initialized) return state;
      return { ...state, initialized: true, alreadySignedInLatched: event.signedIn };

    case 'MODE_LOADED': {
      if (state.step !== 'loading') return { ...state, mode: event.mode, modeReady: true };
      return startForm({ ...state, mode: event.mode, modeReady: true });
    }

    case 'CATALOG_LOADED': {
      const names = event.names ?? state.names;
      if (state.step !== 'loading') return { ...state, names, catalogReady: true };
      return startForm({ ...state, names, catalogReady: true });
    }

    case 'SELECTION_RESOLVED': {
      // Only while the form is still ahead: once it has been submitted the plan and pack steps own
      // the selection, and a catalog that reloads underneath must not rewrite what was chosen.
      if (state.step !== 'loading' && state.step !== 'register') return state;
      const granted = new Set(state.tokenGrant?.addOnIds ?? []);
      const addOnIds = event.addOnIds ? dedupe(event.addOnIds) : state.selection.addOnIds;
      const plannedTier = event.tierId != null;
      return {
        ...state,
        planPreset: state.planPreset || plannedTier,
        planRequiresPayment: plannedTier ? event.requiresPayment === true : state.planRequiresPayment,
        selection: {
          tierId: event.tierId ?? state.selection.tierId,
          pricingId: event.pricingId ?? state.selection.pricingId,
          addOnIds,
        },
        packsToBuy: addOnIds.filter((id) => !granted.has(id)),
      };
    }

    case 'LOAD_FAILED':
      if (state.step !== 'loading') return state;
      return fail(state, event.message, 'loading');

    case 'REGISTER_SUBMITTED':
      if (state.step !== 'register') return state;
      return advance({ ...state, email: event.email, formSubmitted: true }, 'register');

    case 'TOKEN_CHECK_STARTED':
      if (state.step !== 'token') return state;
      return { ...state, token: issueStepToken(), tokenChecking: true, tokenError: null };

    case 'TOKEN_ACCEPTED': {
      if (state.step !== 'token' || !isCurrentStep(state.token, event.token)) return state;
      const grant = event.grant;
      // A grant covers its own packs, so they drop out of what still has to be bought.
      const granted = new Set(grant?.addOnIds ?? []);
      const next: SignupState = {
        ...state,
        token: null,
        tokenChecking: false,
        tokenError: null,
        tokenValue: event.value,
        tokenGrant: grant,
        packsToBuy: state.packsToBuy.filter((id) => !granted.has(id)),
      };
      return advance(next, 'token');
    }

    case 'TOKEN_REJECTED':
      if (state.step !== 'token' || !isCurrentStep(state.token, event.token)) return state;
      return { ...state, token: null, tokenChecking: false, tokenError: event.message };

    case 'TOKEN_SKIPPED':
      // A required token cannot be skipped; the server would refuse the registration anyway.
      if (state.step !== 'token' || state.mode?.requireToken) return state;
      return advance({ ...state, token: null, tokenChecking: false, tokenError: null }, 'token');

    case 'PLAN_CHOSEN': {
      if (state.step !== 'plan') return state;
      const next: SignupState = {
        ...state,
        selection: { ...state.selection, tierId: event.tierId, pricingId: event.pricingId },
        planRequiresPayment: event.requiresPayment === true,
        // Chosen is chosen: coming back through the form must not ask for a plan again.
        planPreset: true,
      };
      return advance(next, 'plan');
    }

    case 'PACKS_CHOSEN': {
      if (state.step !== 'packs') return state;
      const chosen = dedupe(event.addOnIds);
      const granted = new Set(state.tokenGrant?.addOnIds ?? []);
      const next: SignupState = {
        ...state,
        selection: { ...state.selection, addOnIds: chosen },
        packsToBuy: chosen.filter((id) => !granted.has(id)),
      };
      return advance(next, 'packs');
    }

    case 'PAYMENT_COMPLETED': {
      if (state.step !== 'payment') return state;
      const paid: SignupState = { ...state, paymentTransactionId: event.paymentTransactionId };
      // Account-first: the account is already made, so the card is the last thing before the
      // disclaimers rather than another form step on the way to creating one. A card that goes
      // through also un-pends the plan: this may be the second visit to the step, after a first one
      // the customer walked away from, and the outcome must not still call the plan pending.
      if (state.paymentAfterAccount) return afterAccountPayment({ ...paid, planActivationPending: false });
      return advance(paid, 'payment');
    }

    case 'PAYMENT_ABANDONED':
      // Pay-first has nothing to abandon INTO: no account exists yet, so backing out of the card
      // is a `GO_TO`, not this.
      if (state.step !== 'payment' || !state.paymentAfterAccount) return state;
      return afterAccountPayment({ ...state, planActivationPending: true });

    case 'ACCOUNT_CREATED': {
      if (state.step !== 'creating' || !isCurrentStep(state.token, event.token)) return state;
      // Default true: the plan's order puts disclaimers after account creation, and a host that
      // knows there are none passes false rather than rendering an empty step.
      const requiresDisclaimers = event.requiresDisclaimers !== false;
      const next: SignupState = {
        ...state,
        token: null,
        userId: event.userId,
        // Remembered, because an account-first card step runs between here and there.
        pendingDisclaimers: requiresDisclaimers,
      };
      if (
        state.options.paymentOrder === 'afterAccount' &&
        !state.paymentTransactionId &&
        signupPlanNeedsPayment(state)
      ) {
        return enter({ ...next, paymentAfterAccount: true }, 'payment');
      }
      if (requiresDisclaimers) return enter(next, 'disclaimers');
      return afterDisclaimers(next);
    }

    case 'ACCOUNT_FAILED':
      if (state.step !== 'creating' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'creating');

    case 'DISCLAIMERS_ACCEPTED':
      if (state.step !== 'disclaimers') return state;
      return afterDisclaimers(state);

    case 'PACK_CHECKOUT_FINISHED':
      if (state.step !== 'packCheckout' || !isCurrentStep(state.token, event.token)) return state;
      return finish({ ...state, token: null }, event.packs);

    case 'PACK_CHECKOUT_FAILED':
      if (state.step !== 'packCheckout' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'packCheckout');

    case 'GO_TO': {
      if (state.step === 'loading' || state.step === 'closed' || state.step === 'done') return state;
      if (event.step === 'payment' && state.options.paymentOrder === 'afterAccount') {
        // There is no pre-account card step in that order, so the card can only be re-opened where
        // the machine itself put it: at the step, or at the disclaimers an abandoned card dropped
        // the flow into. Past the disclaimers the signup is buying packs — re-opening the plan's
        // card there would come back through disclaimers already accepted and restart a checkout
        // that may already be charging. `done` is refused by the guard above: the outcome is out.
        if (state.step !== 'payment' && state.step !== 'disclaimers') return state;
        // Only while the card is genuinely still outstanding: an account to attach it to, a plan
        // that has to be paid for, and nothing taken for it yet.
        if (!state.userId || state.paymentTransactionId || !signupPlanNeedsPayment(state)) return state;
        return enter({ ...state, tokenError: null, paymentAfterAccount: true }, 'payment');
      }
      return enter({ ...state, tokenError: null }, event.step);
    }

    case 'RETRY': {
      if (state.step !== 'failed' || !state.retryFrom) return state;
      if (state.retryFrom === 'loading') {
        return { ...state, step: 'loading', token: null, error: null, retryFrom: null };
      }
      // `retryFrom` is only ever an async step (loading, creating, packCheckout), so re-entering it
      // never lands on a payment step and the account-first latch is left exactly as it was.
      return enter(state, state.retryFrom);
    }

    case 'RESET': {
      const fresh = initialSignupState({
        tokenMode: state.options.tokenMode,
        planSelection: state.options.planSelection,
        packSelection: state.options.packSelection,
        paymentOrder: state.options.paymentOrder,
      });
      // The latch belongs to the visit, not the attempt: starting over must not suddenly claim
      // they were already signed in.
      return { ...fresh, initialized: state.initialized, alreadySignedInLatched: state.alreadySignedInLatched };
    }

    default:
      return state;
  }
}
