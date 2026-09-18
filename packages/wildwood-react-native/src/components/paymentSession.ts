// Everything PaymentComponent decides, with no React and no renderer in it.
//
// This package has no component renderer under vitest, so the rules — which are where the bugs were —
// live here as a plain driver object (the same shape as `createIapSession`) and are tested directly.
// The web component makes the same decisions inline in `@wildwood/react`'s PaymentComponent, where a
// DOM test can reach them.
//
// The one real difference from the web is the card. Stripe.js is a script tag away on the web, so the
// web component always has an instance and always offers to confirm. React Native has no card element
// and this package takes no Stripe dependency, so confirming is something the HOST supplies through a
// `PaymentActionAdapter`. With no handler the component must behave exactly as it did before any of
// this existed: initiate, follow a redirect, and never claim a capability it does not have.

import { formatMoney, PaymentProviderType, trialLabel } from '@wildwood/core';
import type {
  BillingAddress,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  PaymentCompletionResult,
} from '@wildwood/core';
import type { PaymentActionAdapter, PaymentActionOutcome } from '@wildwood/react-shared';

/* ------------------------------------------------------------------------------------------------
 * Copy — the same sentences the web component says, so a customer reads one product.
 * ---------------------------------------------------------------------------------------------- */

/** Shown when the card was taken but the server could not confirm it with the provider. */
export const CARD_NOT_VERIFIED_MESSAGE = 'Your card could not be verified. Please try another card.';

const INITIATION_FAILED_MESSAGE = 'Payment initiation failed';
const CONFIRMATION_FAILED_MESSAGE = 'Payment confirmation failed';
const CARD_SETUP_FAILED_MESSAGE = 'Card setup failed';
const CARD_PAYMENT_FAILED_MESSAGE = 'Card payment failed';

/** The pay button: a trial is started, not bought. */
export function paymentButtonLabel(input: {
  amount: number;
  currency: string;
  trialDays?: number;
  trialUnavailable?: boolean;
}): string {
  if (hasTrialOffer(input.trialDays, input.trialUnavailable)) {
    return `Start ${trialLabel(input.trialDays)}`;
  }
  // Nothing typed yet on the free-form screen: the bare verb, as before.
  if (!(input.amount > 0)) return 'Pay';
  return `Pay ${formatMoney(input.amount, input.currency)}`;
}

/** The note under a trial's button: what is NOT happening today, and what happens later. */
export function trialChargeNote(amount: number, currency: string): string {
  return `You won't be charged today. ${formatMoney(amount, currency)} is due when the trial ends unless you cancel before then.`;
}

/** The warning shown when the plan offered a trial the account cannot have. */
export function trialUnavailableNotice(amount: number, currency: string): string {
  return `The free trial isn't available on your account, so ${formatMoney(amount, currency)} will be charged today. Select Pay to continue.`;
}

export interface PaymentSuccessCopy {
  title: string;
  /** The second line. Empty when there is nothing to add. */
  detail: string;
}

/** What the success panel says, which depends on what actually happened to the card. */
export function paymentSuccessCopy(input: {
  /** ISO date, set only when the card was saved for a trial rather than charged. */
  trialEndsAt: string | null;
  /** True when a handler confirmed the intent on this device. */
  confirmed: boolean;
  amount: number;
  currency: string;
}): PaymentSuccessCopy {
  const money = formatMoney(input.amount, input.currency);
  if (input.trialEndsAt) {
    return {
      title: 'Your free trial has started!',
      detail: `Your card is saved. You won't be charged until ${formatTrialEnd(input.trialEndsAt)}, when ${money} is due.`,
    };
  }
  if (input.confirmed) {
    return { title: 'Payment Successful!', detail: `Amount: ${money}` };
  }
  // No card was confirmed here: the server took it from the provider. Saying "initiated" is the
  // honest word, and it is the word this component has always used.
  return { title: 'Payment initiated successfully!', detail: '' };
}

function formatTrialEnd(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** A trial is on offer while the plan carries one and the server has not refused it. */
export function hasTrialOffer(trialDays: number | null | undefined, trialUnavailable?: boolean): boolean {
  return (trialDays ?? 0) > 0 && !trialUnavailable;
}

/**
 * Whether this client may ask the server for a SetupIntent.
 *
 * Only a host that can confirm one may ask for one: a SetupIntent that nothing confirms leaves a
 * trial with no saved card, so the plan renews into a failed charge. A handler that confirms
 * payments but not card setups is treated here exactly as no handler at all.
 */
export function canConfirmCardSetup(handler: PaymentActionAdapter | null | undefined): boolean {
  return typeof handler?.confirmCardSetup === 'function';
}

/* ------------------------------------------------------------------------------------------------
 * The session
 * ---------------------------------------------------------------------------------------------- */

export type PaymentSessionStatus = 'idle' | 'processing' | 'complete';

export interface PaymentSessionState {
  status: PaymentSessionStatus;
  /** The failure to show. Never set by a cancelled card sheet — cancelling is not an error. */
  error: string | null;
  /**
   * The plan advertised a trial and the server started a paid subscription instead (the account has
   * already had its trial). Nothing is charged until the customer agrees to it.
   */
  trialUnavailable: boolean;
  result: PaymentCompletionResult | null;
  /** When the trial ends, set only when the completed payment saved a card instead of charging it. */
  trialEndsAt: string | null;
  /** True when a handler confirmed the intent here, rather than the server completing it elsewhere. */
  confirmed: boolean;
  /** The customer was sent to the provider's own page to finish. */
  redirected: boolean;
}

/** The plan a form is currently offering. Changing it re-offers the trial. */
export interface PaymentPlanKey {
  pricingModelId?: string;
  trialDays?: number;
  amount: number;
}

/** One press of the pay button, resolved from props, config and the form. */
export interface PaymentAttempt {
  providerId: string;
  appId: string;
  amount: number;
  currency: string;
  description?: string;
  customerId?: string;
  pricingModelId?: string;
  isSubscription?: boolean;
  trialDays?: number;
  billingAddress?: BillingAddress;
  /** The provider's publishable key, handed to the host handler so it confirms on the right account. */
  publishableKey?: string;
  /** Used for the server-side confirm when the initiate response does not name one. */
  providerType?: PaymentProviderType;
}

export interface PaymentSessionOptions {
  initiatePayment(request: InitiatePaymentRequest): Promise<InitiatePaymentResponse>;
  confirmPayment(paymentIntentId: string, providerType: PaymentProviderType): Promise<PaymentCompletionResult>;
  /** The host's payment SDK, read afresh on every attempt so a late-wired handler still counts. */
  getHandler?(): PaymentActionAdapter | undefined;
  /** `Linking.openURL`, for a provider that finishes on its own page. */
  openUrl?(url: string): Promise<unknown> | void;
  /** Fired exactly once per completed payment. */
  onSuccess?(result: PaymentCompletionResult): void;
  onFailure?(message: string): void;
}

export interface PaymentSession {
  getState(): PaymentSessionState;
  subscribe(listener: () => void): () => void;
  /** Tells the session which plan the form is showing; a different plan re-offers its trial. */
  setPlan(plan: PaymentPlanKey): void;
  pay(attempt: PaymentAttempt): Promise<void>;
  /** Back to an empty form — for a screen that takes more than one payment. */
  reset(): void;
}

const INITIAL_STATE: PaymentSessionState = {
  status: 'idle',
  error: null,
  trialUnavailable: false,
  result: null,
  trialEndsAt: null,
  confirmed: false,
  redirected: false,
};

function planKeyOf(plan: PaymentPlanKey): string {
  return [plan.pricingModelId ?? '', plan.trialDays ?? 0, plan.amount].join('|');
}

/**
 * @internal Exported for tests and for {@link import('./PaymentComponent').PaymentComponent}.
 */
export function createPaymentSession(options: PaymentSessionOptions): PaymentSession {
  let state: PaymentSessionState = { ...INITIAL_STATE };
  const listeners = new Set<() => void>();

  /**
   * The intent a declined card left behind. Keyed, because reusing it for a DIFFERENT plan or amount
   * would charge the wrong thing — and creating a new one for the SAME plan starts a second
   * subscription that nobody cancels.
   */
  let pending: { key: string; result: InitiatePaymentResponse } | null = null;
  /** The plan the current `trialUnavailable` answer was about. */
  let plan: string | null = null;

  /** Read through a call, so the guard at the top of `pay` does not narrow the status forever. */
  function currentStatus(): PaymentSessionStatus {
    return state.status;
  }

  function setState(patch: Partial<PaymentSessionState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function fail(message: string) {
    setState({ status: 'idle', error: message });
    options.onFailure?.(message);
  }

  function succeed(result: PaymentCompletionResult, trialEndsAt: string | null, confirmed: boolean) {
    pending = null;
    setState({ status: 'complete', error: null, result, trialEndsAt, confirmed });
    options.onSuccess?.(result);
  }

  async function runHandler(
    confirm: (clientSecret: string, publishableKey?: string) => Promise<PaymentActionOutcome>,
    clientSecret: string,
    publishableKey: string | undefined,
    failureFallback: string,
  ): Promise<boolean> {
    const outcome = await confirm(clientSecret, publishableKey);
    if (outcome.status === 'succeeded') return true;
    if (outcome.status === 'cancelled') {
      // Dismissing the sheet is a decision, not a failure: back to the form with nothing said, and
      // the intent kept so the next press confirms the same one.
      setState({ status: 'idle', error: null });
      return false;
    }
    fail(outcome.message || failureFallback);
    return false;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setPlan(next) {
      const key = planKeyOf(next);
      if (plan === null) {
        plan = key;
        return;
      }
      if (plan === key) return;
      plan = key;
      // The refusal was about the plan that was on screen; another plan gets its trial offered.
      if (state.trialUnavailable) setState({ trialUnavailable: false });
    },

    async pay(attempt) {
      if (state.status !== 'idle') return;
      if (!(attempt.amount > 0)) {
        setState({ error: 'Invalid amount' });
        return;
      }
      if (!attempt.providerId) {
        setState({ error: 'No payment provider configured' });
        return;
      }

      const handler = options.getHandler?.();
      const mayAskForSetupIntent = canConfirmCardSetup(handler);
      const intentKey = [
        attempt.providerId,
        attempt.pricingModelId ?? '',
        attempt.amount,
        attempt.isSubscription ? 'sub' : 'once',
      ].join('|');

      setState({ status: 'processing', error: null, redirected: false });
      try {
        const reusable = pending?.key === intentKey ? pending.result : null;
        const initResult =
          reusable ??
          (await options.initiatePayment({
            providerId: attempt.providerId,
            appId: attempt.appId,
            amount: attempt.amount,
            currency: attempt.currency,
            description: attempt.description || undefined,
            customerId: attempt.customerId || undefined,
            ...(attempt.pricingModelId ? { pricingModelId: attempt.pricingModelId } : {}),
            ...(attempt.isSubscription ? { isSubscription: true } : {}),
            ...(attempt.billingAddress ? { billingAddress: attempt.billingAddress } : {}),
            // Asked for ONLY when this device can confirm one. The key is absent otherwise, so the
            // server behaves for a handler-less app exactly as it did before this existed.
            ...(mayAskForSetupIntent ? { supportsSetupIntent: true } : {}),
          }));

        if (!initResult.success) {
          fail(initResult.errorMessage ?? INITIATION_FAILED_MESSAGE);
          return;
        }
        if (handler && initResult.clientSecret) pending = { key: intentKey, result: initResult };

        // A trial was offered and the server wants money today: never charge a card the customer
        // handed over for a free trial. Say so; the next press confirms this same intent.
        if (
          hasTrialOffer(attempt.trialDays, state.trialUnavailable) &&
          mayAskForSetupIntent &&
          initResult.clientSecret &&
          initResult.clientSecretType !== 'setup_intent'
        ) {
          setState({ status: 'idle', trialUnavailable: true });
          return;
        }

        // A provider that finishes on its own page (PayPal and friends).
        if (initResult.redirectUrl) {
          const url = initResult.redirectUrl.startsWith('http')
            ? initResult.redirectUrl
            : `https://${initResult.redirectUrl}`;
          await options.openUrl?.(url);
          setState({ status: 'idle', redirected: true });
          return;
        }

        if (handler && initResult.clientSecret) {
          const isSetup = initResult.clientSecretType === 'setup_intent';
          const confirm = isSetup ? handler.confirmCardSetup : handler.confirmPayment;
          if (confirm) {
            const confirmed = await runHandler(
              confirm.bind(handler),
              initResult.clientSecret,
              attempt.publishableKey,
              isSetup ? CARD_SETUP_FAILED_MESSAGE : CARD_PAYMENT_FAILED_MESSAGE,
            );
            if (!confirmed) return;

            // The id the SERVER recorded for this payment — a subscription's first invoice, or the
            // SetupIntent it created — not an id read back off the client's own SDK.
            const recordedId = initResult.paymentIntentId;
            const notVerified = isSetup ? CARD_NOT_VERIFIED_MESSAGE : CONFIRMATION_FAILED_MESSAGE;
            if (!recordedId) {
              fail(notVerified);
              return;
            }
            const providerType = initResult.providerType ?? attempt.providerType ?? PaymentProviderType.Stripe;
            const serverResult = await options.confirmPayment(recordedId, providerType);
            if (!serverResult.success) {
              fail(serverResult.errorMessage ?? notVerified);
              return;
            }
            succeed(
              {
                ...serverResult,
                paymentIntentId: serverResult.paymentIntentId ?? recordedId,
                subscriptionId: serverResult.subscriptionId ?? initResult.subscriptionId,
              },
              isSetup ? (initResult.trialEnd ?? null) : null,
              true,
            );
            return;
          }
        }

        // Nothing to confirm here: the server owns the rest. This is the path a handler-less app has
        // always taken, and the result it has always reported.
        succeed(
          {
            success: true,
            transactionId: initResult.paymentIntentId,
            paymentIntentId: initResult.paymentIntentId,
            subscriptionId: initResult.subscriptionId,
            amountPaid: attempt.amount,
            currency: attempt.currency,
            status: 'Completed',
            completedAt: new Date().toISOString(),
          },
          null,
          false,
        );
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Payment failed');
      } finally {
        // Nothing may leave the button spinning: every branch above either settled the payment or
        // said why it did not, but a branch added later might forget.
        if (currentStatus() === 'processing') setState({ status: 'idle' });
      }
    },

    reset() {
      pending = null;
      plan = null;
      setState({ ...INITIAL_STATE });
    },
  };
}
