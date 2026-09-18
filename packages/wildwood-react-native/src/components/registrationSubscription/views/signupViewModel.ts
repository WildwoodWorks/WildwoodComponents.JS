// Every decision the native signup view makes, as functions with no React and no react-native in
// them.
//
// The ORDER of the signup - what is skipped, what a token's grant takes out of it, when the card is
// taken - is the shared `signupMachine`, and the server calls around it are the shared
// `useSignupFlow`. Neither is re-implemented here. What is here is the half a view owns: which body
// renders for the state the flow is in, what the success panel says, what the payment step is handed,
// and the two rules a store-billed app adds.
//
// It exists as its own module because this package ships no component renderer under vitest: a rule
// that lives inside JSX is a rule that cannot be tested.
//
// Two rules bind the file:
//
//  · No price is ever stated here. Amounts come off the plan the catalog quoted and are formatted by
//    `formatMoney`; a guard test greps this directory for a price literal.
//  · Nothing fails silently. A pack that cannot be bought on this device is reported as a pack that
//    was not bought, with the reason, rather than dropped from the basket.

import type {
  AddOnCheckoutItemInput,
  AppTierModel,
  AppTierPricingModel,
  RegistrationTokenAppGrant,
} from '@wildwood/core';
import { MAX_ADDON_SELECTION } from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type PackCheckoutStep,
  type RegistrationSubscriptionLabels,
  type SignupPackOutcome,
  type SignupPaymentOrder,
  type SignupStep,
} from '@wildwood/react-shared';

/**
 * When the plan's card is taken on React Native.
 *
 * The web is pay-first: nothing is created until the money is in, because a card that fails then
 * leaves nothing behind. A native app that may be billed through a store cannot afford that order -
 * a StoreKit or Play purchase that succeeds before a registration that then fails strands a paid
 * subscription with no account to attach it to, and unwinding that is a support ticket rather than a
 * void. An account with no plan is the cheaper failure and the recoverable one, so the account comes
 * first and the card after it.
 */
export const DEFAULT_SIGNUP_PAYMENT_ORDER: SignupPaymentOrder = 'afterAccount';

/** The order the flow is driven in: the host's, else this stack's default. */
export function signupPaymentOrder(order: SignupPaymentOrder | undefined): SignupPaymentOrder {
  return order ?? DEFAULT_SIGNUP_PAYMENT_ORDER;
}

/**
 * The packs a signup link may carry in, deduped and capped at the platform's {@link MAX_ADDON_SELECTION}.
 *
 * The cap is applied here, before the ids ever reach the flow, so a link carrying hundreds of them
 * cannot make the signup quote a basket the server would refuse. Which of them the app actually
 * sells is the catalog's answer and is settled inside the flow - this only bounds the request.
 */
export function cappedPreSelectedPackIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])].slice(0, MAX_ADDON_SELECTION);
}

/** Which body the signup view renders. Every value but the last two is also a `testID`. */
export type SignupBody =
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
  | 'failed'
  | 'success'
  /** A signed-in visitor: the notice, and no second account on offer. */
  | 'signedIn'
  /** Store-billed: the plan is bought from the App Store or Play, not with a card. */
  | 'storePayment'
  /** Store-billed with no product mapped to the plan, so nothing here can take the money. */
  | 'storeUnavailable';

export interface SignupBodyInput {
  /** The machine's step. */
  step: SignupStep;
  /** The visitor already had a session when the flow started. */
  alreadySignedIn: boolean;
  /** A plan is being carried, resolved against the live catalog. */
  hasPlan: boolean;
  /** The registration form has been submitted. */
  formSubmitted: boolean;
  /** The app's payment configuration says this device must pay through its store. */
  storeOnly: boolean;
  /** A store product is mapped to the plan being bought. */
  hasStoreProduct: boolean;
}

/**
 * Which body applies.
 *
 * Every step but `payment` is its own body. `payment` is the one that can arrive with nothing to
 * charge for - no plan left in the catalog, or a form that was never submitted - and a card form
 * shown there would take money with nothing to attach it to. The flow has already dispatched the way
 * out of that state, so what shows meanwhile is the loading panel, not a card.
 */
export function signupBody(input: SignupBodyInput): SignupBody {
  if (input.alreadySignedIn) return 'signedIn';
  if (input.step === 'done') return 'success';
  if (input.step !== 'payment') return input.step;

  if (!input.hasPlan || !input.formSubmitted) return 'loading';
  if (!input.storeOnly) return 'payment';
  return input.hasStoreProduct ? 'storePayment' : 'storeUnavailable';
}

/**
 * Whether what a registration token granted is shown beside a body - asked in ONE place.
 *
 * The web renders `TokenPlanSummary` in its outer frame, above whichever step is on screen, so a
 * visitor arriving on a link can always see what it already paid for. This stack cannot simply copy
 * that, because one of its steps returns a frame of its own: `DisclaimerComponent` brings its own
 * `flex: 1` scroller, which collapses inside the outer one, so the disclaimers step is rendered
 * outside it. A rule kept in the JSX of each frame is a rule the next frame can quietly drop, so it
 * is asked here instead and every frame renders the same answer.
 *
 * `signedIn` is the one body the web leaves it out of - that early return offers a notice and no
 * second account - and there is no grant behind it in any case, since the flow never ran.
 */
export function showsTokenPlanSummary(
  body: SignupBody,
  grant: RegistrationTokenAppGrant | null | undefined,
): grant is RegistrationTokenAppGrant {
  return grant != null && body !== 'signedIn';
}

export interface SignupSuccessInput {
  labels: RegistrationSubscriptionLabels;
  /** The plan name a registration token granted, when the signup ran on one. */
  tokenPlanName?: string | null;
  /** Whether a registration token granted a plan at all. */
  hasTokenGrant: boolean;
  /** Whether the signup chose a plan of its own. */
  hasPlan: boolean;
  /** The server refused the subscription after the account was made. */
  subscriptionFailed: boolean;
  /** The account exists but its card was walked away from (account-first order only). */
  planActivationPending: boolean;
  /** Free-trial days on the plan that was paid for. */
  trialDays: number;
}

/**
 * What the success panel says, by what actually happened - in the same order the web resolves it,
 * with one addition this stack needs: an account-first signup whose card was abandoned has an
 * account and no plan, which is exactly what "activation is pending" already says.
 */
export function signupSuccessMessage(input: SignupSuccessInput): string {
  const { labels } = input;
  if (input.hasTokenGrant) {
    return formatLabel(labels.signupCompleteToken, { tier: input.tokenPlanName ?? 'plan' });
  }
  if (!input.hasPlan) return labels.signupCompletePlain;
  if (input.subscriptionFailed || input.planActivationPending) return labels.signupCompletePending;
  if (input.trialDays > 0) return formatLabel(labels.signupCompleteTrial, { days: input.trialDays });
  return labels.signupCompleteActive;
}

/** What the payment step charges for, taken off the plan the catalog quoted. */
export interface SignupPaymentProps {
  amount: number;
  currency: string;
  description: string;
  /** The pricing model behind the option, so the server starts a subscription and not a charge. */
  pricingModelId?: string;
  isSubscription: true;
  /** Omitted rather than zero, so `PaymentComponent` offers a trial only when there is one. */
  trialDays?: number;
}

/**
 * The payment props for a plan.
 *
 * The amount is the pricing option's own price - never a prorated figure, never a remembered one -
 * because this is a first subscription and the option is what the server will bill.
 */
export function signupPaymentProps(
  tier: AppTierModel,
  pricing: AppTierPricingModel | null | undefined,
  currency: string,
  trialDays: number,
): SignupPaymentProps {
  return {
    amount: pricing?.price ?? 0,
    currency,
    description: tier.name,
    pricingModelId: pricing?.pricingModelId,
    isSubscription: true,
    trialDays: trialDays > 0 ? trialDays : undefined,
  };
}

/** The per-period suffix shown beside a plan's price. Empty for a frequency with no period. */
export function planPeriodSuffix(billingFrequency: string | undefined): string {
  const frequency = (billingFrequency ?? '').trim().toLowerCase();
  return frequency ? `/${frequency}` : '';
}

/* ------------------------------------------------------------------------------------------------
 * Packs
 * ---------------------------------------------------------------------------------------------- */

/** How a pack basket's card is dealt with on this device. */
export type PackCheckoutCardBranch =
  /** The quote found a card already on file: the basket is bought against it. */
  | 'savedCard'
  /** A card is needed and the host's handler can confirm a SetupIntent: collected once, here. */
  | 'handlerCard'
  /** A card is needed and nothing on this device can take one. */
  | 'finishOnWeb';

export interface PackCheckoutCardInput {
  /** The quote's answer: there is no card to reuse. */
  requiresPaymentMethod: boolean;
  /** The payment-action handler in force can confirm a SetupIntent. */
  canConfirmCardSetup: boolean;
}

/**
 * Which of the three the basket is on.
 *
 * The important branch is the last one. With no handler this package has nothing that can put a card
 * field or a bank challenge in front of the customer, so the flow does NOT ask the server for a
 * SetupIntent it could never confirm - it says where the purchase can be finished instead. That is
 * the rule `usePackCheckoutFlow` follows; this states it where the view can act on it.
 */
export function packCheckoutCardBranch(input: PackCheckoutCardInput): PackCheckoutCardBranch {
  if (!input.requiresPaymentMethod) return 'savedCard';
  return input.canConfirmCardSetup ? 'handlerCard' : 'finishOnWeb';
}

/**
 * Whether a failed basket is worth offering "Try Again" for.
 *
 * A basket that failed because this device cannot take a card will fail again for exactly the same
 * reason, so the only honest way on is to leave the packs unbought and finish the signup.
 */
export function packCheckoutCanRetry(branch: PackCheckoutCardBranch): boolean {
  return branch !== 'finishOnWeb';
}

/** What the pack-checkout status line says while it is working. */
export function packCheckoutStatusText(
  step: PackCheckoutStep,
  packName: string,
  labels: RegistrationSubscriptionLabels,
): string {
  if (step === 'authenticating' || step === 'completing') {
    return formatLabel(labels.authenticatingPack, { name: packName });
  }
  return labels.buyingPacks;
}

/**
 * Whether packs may be BOUGHT on this device.
 *
 * An app billed through the App Store or Play has no store product mapped to an add-on - pack
 * checkout is a card purchase and nothing else - so on a store-billed device the purchase is not
 * offered. What a registration token granted is unaffected: nothing is being charged for it.
 */
export function packPurchaseOffered(storeOnly: boolean): boolean {
  return !storeOnly;
}

/**
 * The outcome for a basket that cannot be bought on this device at all.
 *
 * Reported rather than dropped: the visitor asked for these packs, and a signup that quietly
 * forgets them leaves them thinking they have something they do not.
 */
export function unbuyablePackOutcomes(
  items: readonly AddOnCheckoutItemInput[],
  names: Record<string, string> | undefined,
  message: string,
): SignupPackOutcome[] {
  return items.map((item) => ({
    addOnId: item.addOnId,
    name: names?.[item.addOnId] ?? item.addOnId,
    status: 'failed',
    errorMessage: message,
  }));
}
