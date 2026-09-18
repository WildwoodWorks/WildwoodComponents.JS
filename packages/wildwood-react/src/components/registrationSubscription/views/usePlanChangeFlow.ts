'use client';

// Changing an existing subscriber's plan, driven.
//
// The order lives in react-shared's `planChangeMachine`; this hook is the half that touches the
// world. Every layout confirms the preview first, and from there a change either applies straight
// away or the processor wants the prorated charge authenticated:
//
//   preview -> confirm -> [card] -> change -> [3-D Secure -> complete] -> done
//
// Two rules keep it honest, the same two the signup flow follows:
//
//  · Every async step is claimed by the machine's step token before it starts. StrictMode runs
//    mount effects twice, a customer can double-click anything, and a payment SDK can call back
//    twice - all three land on a token that has already been claimed, so nothing is previewed,
//    charged or changed twice.
//
//  · A `processing` completion is a "not yet", not a failure: the money is in and the server is
//    still applying the change, so it is asked again on the machine's bounded budget. A manual
//    "Try Again" starts that budget over.
//
// The card, when one is needed before the change is posted, comes from the host's own
// `onPaymentRequired` when it passed one - that handler predates this hook and keeps winning - and
// otherwise from the view's built-in `PaymentModal`, which is what `paymentRequest` is for.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';
import { PaymentProviderType, getStripeInstance } from '@wildwood/core';
import {
  initialPlanChangeState,
  planChangeTransition,
  type EntitlementsChangedReason,
  type PlanChangeState,
  type PlanChangeStep,
  type StepToken,
  type UseSubscriptionAdminReturn,
} from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood.js';
import type { PaymentRequiredArgs } from '../../subscription/admin/SubscriptionAdminComponent.js';
import type { TierSelectedEventArgs } from '../../subscription/admin/TierPlansPanel.js';
import { DEFAULT_LABELS, type RegistrationSubscriptionLabels } from '../labels.js';
import type { RegistrationSubscriptionError } from '../types.js';

/** How long a `processing` answer is left alone before the completion is asked again. */
export const COMPLETE_RETRY_DELAY_MS = 500;

export interface PlanChangeFlowOptions {
  /** The app the subscription belongs to. */
  appId: string;
  /** Set for an admin acting on one user's subscription. Such a change never collects a card. */
  userId?: string;
  /** Set for an admin acting on a company's subscription. Never collects a card either. */
  companyId?: string;
  /** The data layer, shared with the panels around the flow. */
  admin: UseSubscriptionAdminReturn;
  /**
   * The host's own card modal. Given one, it is used instead of the built-in modal and its answer
   * is final: a transaction id completes the change, null or undefined abandons it.
   */
  onPaymentRequired?: (args: PaymentRequiredArgs) => Promise<string | null | undefined>;
  /** Reload whatever shows the subscription once a change has landed. */
  onChanged?: () => void | Promise<void>;
  /** Told after a change lands, so the host can refresh its own gates. */
  onEntitlementsChanged?: (reason: EntitlementsChangedReason) => void;
  /** Told about every failure, with a stable code. */
  onError?: (error: RegistrationSubscriptionError) => void;
  /** Copy for the messages the flow produces. Defaults to the shipped labels. */
  labels?: RegistrationSubscriptionLabels;
}

export interface PlanChangeFlow {
  state: PlanChangeState;
  /** The value of `data-ww-step`. */
  step: PlanChangeStep;
  /** The preview to confirm, or null when nothing is waiting on the customer. */
  preview: TierChangePreviewModel | null;
  /** What the built-in card modal should collect, or null (no card needed, or the host's own). */
  paymentRequest: PaymentRequiredArgs | null;
  /** Whether a server call is in flight: the confirmation's button reads "Processing...". */
  busy: boolean;
  /** Why the change stopped, in words. Null unless the flow failed. */
  error: string | null;
  /** The server's machine-readable reason, when it sent one. */
  errorCode?: string;
  /** Whether a failure can be retried from where it stopped. */
  canRetry: boolean;
  /** Price the change and show the confirmation. */
  selectTier: (args: TierSelectedEventArgs) => void;
  /** The customer confirmed the preview. */
  confirm: (options: { immediate: boolean; bypassPayment: boolean }) => void;
  /** The customer backed out of the confirmation. */
  cancel: () => void;
  /** The built-in modal's answer: a transaction id, or null when the customer closed it. */
  providePayment: (paymentTransactionId: string | null | undefined) => void;
  /** Run the failed step again. */
  retry: () => void;
  /** Forget the whole attempt. */
  reset: () => void;
}

/** What the flow was asked to change to, kept out of the machine because only the calls need it. */
interface Selection {
  tierId: string;
  tierName: string;
  pricingId?: string;
  /** False when the account has no subscription yet, which is a subscribe rather than a change. */
  isChange: boolean;
}

/** The message for a refusal the server gave a code for. */
function messageForCode(
  labels: RegistrationSubscriptionLabels,
  errorCode: string | undefined,
  fallback: string | null,
): string | null {
  switch (errorCode) {
    case 'pending_change_expired':
      return labels.planChangeExpired;
    case 'pending_change_payment_failed':
      return labels.planChangePaymentFailed;
    case 'pending_change_superseded':
      return labels.planChangeSuperseded;
    case 'pending_change_not_found':
      return labels.planChangeNotFound;
    case 'tier_change_already_in_progress':
      return labels.planChangeInProgress;
    default:
      return fallback;
  }
}

/** The `onError` code for a failure, preferring the server's own. */
function codeForFailure(state: PlanChangeState): string {
  if (state.errorCode) return state.errorCode;
  switch (state.retryFrom) {
    case 'previewing':
      return 'tier_preview_failed';
    case 'authenticating':
      return 'tier_change_authentication_failed';
    case 'completing':
      return 'tier_change_completion_failed';
    default:
      return 'tier_change_failed';
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function usePlanChangeFlow(options: PlanChangeFlowOptions): PlanChangeFlow {
  const { appId, userId, companyId, admin, onPaymentRequired } = options;
  const labels = options.labels ?? DEFAULT_LABELS;
  const client = useWildwood();
  const [state, dispatch] = useReducer(planChangeTransition, undefined, () => initialPlanChangeState({ appId }));

  // Latest callbacks and data, so the driver effect never re-runs because the host re-rendered.
  const latest = useRef({ admin, options, labels });
  latest.current = { admin, options, labels };

  const selection = useRef<Selection | null>(null);
  // One run per step token. A doubled effect carries the token its first run already claimed.
  const runs = useRef<Record<string, StepToken | null>>({});
  const claim = (key: string, token: StepToken | null): boolean => {
    if (!token || runs.current[key] === token) return false;
    runs.current[key] = token;
    return true;
  };
  // The steps the machine does not tokenise: a card is asked for once per entry, a landed change
  // is announced once, and a failure is reported once.
  const paymentAsked = useRef(false);
  const doneHandled = useRef(false);
  const failureReported = useRef(false);
  // A timer must not outlive the component, and neither must the completion retry behind it.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const report = useCallback((code: string, message: string) => {
    latest.current.options.onError?.({ code, message });
  }, []);

  // ── The Stripe account the prorated charge was created on ───────────────────

  /** Looked up once and reused: the app's default Stripe provider, else its first. */
  const keyLookup = useRef<Promise<string | undefined> | null>(null);
  const resolvePublishableKey = useCallback((): Promise<string | undefined> => {
    if (!keyLookup.current) {
      keyLookup.current = client.payment
        .getAppPaymentConfiguration(appId)
        .then((config) => {
          const stripe = (config?.providers ?? []).filter(
            (candidate) =>
              candidate.providerType === PaymentProviderType.Stripe &&
              candidate.isEnabled !== false &&
              !!candidate.publishableKey,
          );
          const provider =
            (config?.defaultProviderId
              ? stripe.find((candidate) => candidate.id === config.defaultProviderId)
              : undefined) ??
            stripe.find((candidate) => candidate.isDefault) ??
            stripe[0];
          return provider?.publishableKey;
        })
        .catch(() => undefined);
    }
    return keyLookup.current;
  }, [client, appId]);

  // ── The server calls a step asks for ────────────────────────────────────────

  const runPreview = useCallback(
    async (token: StepToken) => {
      const chosen = selection.current;
      if (!chosen) return;
      try {
        const preview = await latest.current.admin.previewTierChange(appId, chosen.tierId, chosen.pricingId, userId);
        if (!preview?.success) {
          dispatch({
            type: 'PREVIEW_FAILED',
            token,
            message: preview?.errorMessage ?? 'The plan change could not be priced.',
          });
          return;
        }
        dispatch({ type: 'PREVIEW_RECEIVED', token, preview });
      } catch (err) {
        dispatch({ type: 'PREVIEW_FAILED', token, message: errorText(err, 'The plan change could not be priced.') });
      }
    },
    [appId, userId],
  );

  const runHostPayment = useCallback(async (request: PaymentRequiredArgs) => {
    const handler = latest.current.options.onPaymentRequired;
    if (!handler) return;
    try {
      const paymentTransactionId = await handler(request);
      // The host owns that modal, so closing it is the customer walking away from the whole
      // change - not a step back to a confirmation they have already dismissed.
      if (!paymentTransactionId) {
        dispatch({ type: 'RESET' });
        return;
      }
      dispatch({ type: 'PAYMENT_COMPLETED', paymentTransactionId });
    } catch (err) {
      dispatch({ type: 'PAYMENT_FAILED', message: errorText(err, 'The payment could not be taken.') });
    }
  }, []);

  const runChange = useCallback(
    async (token: StepToken, immediate: boolean, paymentTransactionId: string | undefined) => {
      const chosen = selection.current;
      if (!chosen) return;
      const { admin: data } = latest.current;
      const { tierId, pricingId, isChange } = chosen;

      try {
        let result: AppTierChangeResultModel;
        // An admin-scoped change is authorised server-side (IsAdminOverride) and its endpoints
        // carry no transaction id, so no card is ever collected for one.
        if (userId) {
          result = isChange
            ? await data.changeUserTier(appId, userId, tierId, pricingId, immediate)
            : await data.subscribeUserToTier(appId, userId, tierId, pricingId);
        } else if (companyId) {
          result = isChange
            ? await data.changeCompanyTier(appId, companyId, tierId, pricingId, immediate)
            : await data.subscribeCompanyToTier(appId, companyId, tierId, pricingId);
        } else if (isChange) {
          result = await data.changeTierWithOptions(appId, {
            newTierId: tierId,
            newPricingId: pricingId,
            immediate,
            paymentTransactionId,
            // This flow confirms the charge and completes the parked change, so the server may
            // park one instead of refusing it.
            supportsPaymentAction: true,
          });
        } else {
          result = await data.selfSubscribeTo(appId, tierId, pricingId, paymentTransactionId);
        }
        dispatch({ type: 'CHANGE_RESULT', token, result });
      } catch (err) {
        dispatch({ type: 'CHANGE_FAILED', token, message: errorText(err, 'The plan change was refused.') });
      }
    },
    [appId, userId, companyId],
  );

  const runAuthenticate = useCallback(
    async (token: StepToken, clientSecret: string | undefined) => {
      const unconfirmed = 'The charge could not be confirmed with your bank. Your plan has not changed.';
      try {
        const key = await resolvePublishableKey();
        if (!key || !clientSecret) {
          dispatch({ type: 'AUTH_FAILED', token, message: unconfirmed });
          return;
        }
        const stripe = await getStripeInstance(key);
        const { error } = await stripe.confirmCardPayment(clientSecret);
        if (error) {
          dispatch({ type: 'AUTH_FAILED', token, message: error.message ?? unconfirmed });
          return;
        }
        dispatch({ type: 'AUTHENTICATED', token });
      } catch (err) {
        dispatch({ type: 'AUTH_FAILED', token, message: errorText(err, unconfirmed) });
      }
    },
    [resolvePublishableKey],
  );

  const runComplete = useCallback(
    async (token: StepToken, pendingChangeId: string | undefined, attempt: number) => {
      if (!pendingChangeId) {
        dispatch({ type: 'COMPLETE_FAILED', token, message: latest.current.labels.planChangeNotFound });
        return;
      }
      // Only a `processing` answer waits: the first attempt asks immediately.
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, COMPLETE_RETRY_DELAY_MS));
        if (!alive.current) return;
      }
      try {
        const result = await latest.current.admin.completeTierChange(appId, pendingChangeId);
        dispatch({ type: 'COMPLETE_RESULT', token, result });
      } catch (err) {
        dispatch({
          type: 'COMPLETE_FAILED',
          token,
          message: errorText(err, 'The plan change could not be completed.'),
        });
      }
    },
    [appId],
  );

  const runDone = useCallback(async () => {
    const { options: current } = latest.current;
    try {
      await current.onChanged?.();
    } catch {
      // The host's own refresh failing is not this flow's failure: the plan HAS changed.
    }
    // The hook's mutation already invalidated the feature cache and emitted `entitlementsChanged`;
    // this is the host's own callback, for whatever else it keeps in sync.
    current.onEntitlementsChanged?.('tierChange');
  }, []);

  // ── What the built-in card modal is asked to collect ────────────────────────

  const paymentRequest = useMemo<PaymentRequiredArgs | null>(() => {
    const chosen = selection.current;
    if (!chosen || state.step !== 'collectingPayment') return null;
    // The payment starts the new plan's own subscription, billed at the plan's price, so it needs
    // the pricing MODEL (not the tier-pricing link id) and the price and trial that plan carries.
    const pricing = latest.current.admin.tiers
      .find((tier) => tier.id === chosen.tierId)
      ?.pricingOptions?.find((option) => option.id === chosen.pricingId);
    return {
      tierId: chosen.tierId,
      tierName: chosen.tierName,
      pricingId: chosen.pricingId,
      pricingModelId: pricing?.pricingModelId,
      price: pricing?.price ?? state.preview?.newPrice ?? state.preview?.proratedChargeToday ?? 0,
      trialDays: pricing?.trialDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.preview, admin.tiers]);

  // ── The driver. One effect, one switch: each step runs exactly once per token ──

  useEffect(() => {
    const token = state.token;
    switch (state.step) {
      case 'previewing':
        if (claim('preview', token)) void runPreview(token as StepToken);
        break;
      case 'collectingPayment':
        // Only the host's handler is driven from here; the built-in modal answers through
        // `providePayment` when the view renders it.
        if (onPaymentRequired && paymentRequest && !paymentAsked.current) {
          paymentAsked.current = true;
          void runHostPayment(paymentRequest);
        }
        break;
      case 'changing':
        if (claim('change', token)) {
          void runChange(token as StepToken, state.immediate, state.paymentTransactionId);
        }
        break;
      case 'authenticating':
        if (claim('authenticate', token)) void runAuthenticate(token as StepToken, state.clientSecret);
        break;
      case 'completing':
        if (claim('complete', token)) {
          void runComplete(token as StepToken, state.pendingChangeId, state.completeAttempts);
        }
        break;
      case 'done':
        if (!doneHandled.current) {
          doneHandled.current = true;
          void runDone();
        }
        break;
      default:
        break;
    }

    if (state.step !== 'collectingPayment') paymentAsked.current = false;
    if (state.step !== 'done') doneHandled.current = false;
  }, [
    state,
    paymentRequest,
    onPaymentRequired,
    runPreview,
    runHostPayment,
    runChange,
    runAuthenticate,
    runComplete,
    runDone,
  ]);

  // Every failure is reported once, with the server's own code when it sent one.
  const resolvedError = messageForCode(labels, state.errorCode, state.error);
  useEffect(() => {
    if (state.step !== 'failed') {
      failureReported.current = false;
      return;
    }
    if (failureReported.current) return;
    failureReported.current = true;
    report(codeForFailure(state), messageForCode(latest.current.labels, state.errorCode, state.error) ?? '');
  }, [state, report]);

  // ── What the view calls ─────────────────────────────────────────────────────

  const selectTier = useCallback(
    (args: TierSelectedEventArgs) => {
      selection.current = {
        tierId: args.tierId,
        tierName: args.tierName,
        pricingId: args.pricingId,
        isChange: args.isChange,
      };
      latest.current.admin.clearError();
      dispatch({ type: 'PREVIEW_REQUESTED', appId, tierId: args.tierId, pricingId: args.pricingId });
    },
    [appId],
  );

  const confirm = useCallback(
    (confirmOptions: { immediate: boolean; bypassPayment: boolean }) => {
      latest.current.admin.clearError();
      const preview = state.preview;
      // An admin-scoped change bypasses payment server-side, so a card is only ever asked for on
      // the customer's own subscription.
      const adminScoped = !!userId || !!companyId;
      const collectPayment =
        !adminScoped && !!preview?.paymentRequired && !confirmOptions.bypassPayment && !state.paymentTransactionId;
      dispatch({ type: 'CONFIRMED', collectPayment, immediate: confirmOptions.immediate });
    },
    [state, userId, companyId],
  );

  const cancel = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const providePayment = useCallback((paymentTransactionId: string | null | undefined) => {
    if (paymentTransactionId) dispatch({ type: 'PAYMENT_COMPLETED', paymentTransactionId });
    // The built-in modal is inside this flow, so closing it returns to the confirmation the
    // customer came from rather than throwing the priced change away.
    else dispatch({ type: 'PAYMENT_CANCELLED' });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    step: state.step,
    preview: state.step === 'confirm' ? state.preview : null,
    paymentRequest: onPaymentRequired ? null : paymentRequest,
    busy:
      state.step === 'previewing' ||
      state.step === 'changing' ||
      state.step === 'authenticating' ||
      state.step === 'completing',
    error: state.step === 'failed' ? resolvedError : null,
    errorCode: state.errorCode,
    canRetry: state.step === 'failed' && !!state.retryFrom,
    selectTier,
    confirm,
    cancel,
    providePayment,
    retry,
    reset,
  };
}
