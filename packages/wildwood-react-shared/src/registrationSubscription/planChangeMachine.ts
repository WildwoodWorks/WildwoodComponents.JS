// Changing an existing subscriber's plan, as a pure reducer.
//
//   idle -> previewing -> confirm -> [collectingPayment] -> changing
//        -> [authenticating -> completing] -> done
//
// Every layout confirms: the preview says what the change costs today and what it gains or loses,
// and nobody is billed without seeing it. From there the change either applies straight away, or
// the processor wants the prorated charge authenticated (3-D Secure) — which is a "not yet", not a
// refusal: confirm the `clientSecret`, then complete the parked change by its `pendingChangeId`.
// `processing` means the money is in and the server is still applying the change, so completion is
// retried rather than reported as a failure.
//
// `collectingPayment` is the pre-3-D-Secure path: a host that supplies its own `onPaymentRequired`
// handler, or the built-in card modal, produces a `paymentTransactionId` before the change is
// posted at all.

import type { AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';
import { issueStepToken, isCurrentStep, type StepToken } from './stepTokens.js';

export type PlanChangeStep =
  | 'idle'
  | 'previewing'
  | 'confirm'
  | 'collectingPayment'
  | 'changing'
  | 'authenticating'
  | 'completing'
  | 'done'
  | 'failed';

/** How many times a `processing` answer is retried before the flow gives up and says so. */
export const MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS = 5;

export interface PlanChangeState {
  step: PlanChangeStep;
  /** The async step in flight, or `null`. Results carrying another token are ignored. */
  token: StepToken | null;

  appId: string;
  tierId: string;
  pricingId?: string;
  immediate: boolean;

  preview: TierChangePreviewModel | null;
  /** A payment made before the change was posted (the legacy/modal path). */
  paymentTransactionId?: string;

  /** 3-D Secure, set when the server parks the change. Secret — never log `clientSecret`. */
  clientSecret?: string;
  pendingChangeId?: string;

  result: AppTierChangeResultModel | null;
  /** How many completion attempts the server has answered `processing`. */
  completeAttempts: number;

  error: string | null;
  /** The server's machine-readable refusal reason, when it sent one. */
  errorCode?: string;
  /** Which step a `RETRY` goes back to. */
  retryFrom: PlanChangeStep | null;
}

export type PlanChangeEvent =
  | { type: 'PREVIEW_REQUESTED'; appId: string; tierId: string; pricingId?: string; immediate?: boolean }
  | { type: 'PREVIEW_RECEIVED'; token: StepToken; preview: TierChangePreviewModel }
  | { type: 'PREVIEW_FAILED'; token: StepToken; message: string }
  /** The customer confirmed. `collectPayment` overrides what the preview implies. */
  | { type: 'CONFIRMED'; collectPayment?: boolean }
  | { type: 'PAYMENT_COMPLETED'; paymentTransactionId: string }
  | { type: 'PAYMENT_FAILED'; message: string }
  | { type: 'PAYMENT_CANCELLED' }
  | { type: 'CHANGE_RESULT'; token: StepToken; result: AppTierChangeResultModel }
  | { type: 'CHANGE_FAILED'; token: StepToken; message: string }
  /** The prorated charge was authenticated in the browser/app. */
  | { type: 'AUTHENTICATED'; token: StepToken }
  | { type: 'AUTH_FAILED'; token: StepToken; message: string }
  | { type: 'COMPLETE_RESULT'; token: StepToken; result: AppTierChangeResultModel }
  | { type: 'COMPLETE_FAILED'; token: StepToken; message: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export interface PlanChangeMachineOptions {
  appId?: string;
  tierId?: string;
  pricingId?: string;
  /** Apply the change now rather than at the end of the billing period. Defaults to true. */
  immediate?: boolean;
}

export function initialPlanChangeState(options: PlanChangeMachineOptions = {}): PlanChangeState {
  return {
    step: 'idle',
    token: null,
    appId: options.appId ?? '',
    tierId: options.tierId ?? '',
    pricingId: options.pricingId,
    immediate: options.immediate ?? true,
    preview: null,
    result: null,
    completeAttempts: 0,
    error: null,
    retryFrom: null,
  };
}

function enter(state: PlanChangeState, step: PlanChangeStep): PlanChangeState {
  const startsWork = step === 'previewing' || step === 'changing' || step === 'authenticating' || step === 'completing';
  return {
    ...state,
    step,
    token: startsWork ? issueStepToken() : null,
    error: null,
    errorCode: undefined,
    retryFrom: null,
  };
}

function fail(state: PlanChangeState, message: string, retryFrom: PlanChangeStep, errorCode?: string): PlanChangeState {
  return { ...state, step: 'failed', token: null, error: message, errorCode, retryFrom };
}

/** Whether the change has to be paid for up front rather than through the 3-D Secure path. */
function needsPaymentFirst(state: PlanChangeState): boolean {
  if (state.paymentTransactionId) return false;
  const preview = state.preview;
  if (!preview) return false;
  return preview.paymentRequired === true && preview.paymentBypassAllowed !== true;
}

/** Read the server's answer to a change or a completion and route on it. */
function applyChangeResult(
  state: PlanChangeState,
  result: AppTierChangeResultModel,
  from: 'changing' | 'completing',
): PlanChangeState {
  const next: PlanChangeState = { ...state, result };

  if (result.success) {
    return { ...next, step: 'done', token: null, error: null, errorCode: undefined, retryFrom: null };
  }

  // "Not yet", not "no": the processor accepted the change and is waiting on the customer.
  if (result.requiresAction && result.clientSecret && result.pendingChangeId) {
    return enter(
      {
        ...next,
        clientSecret: result.clientSecret,
        pendingChangeId: result.pendingChangeId,
        completeAttempts: 0,
      },
      'authenticating',
    );
  }

  // The money is in; the server is still applying the change. Ask again shortly.
  if (result.processing) {
    const attempts = state.completeAttempts + 1;
    if (attempts >= MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS) {
      return fail(
        { ...next, completeAttempts: attempts },
        result.errorMessage ||
          'The payment went through but the plan change is still being applied. Refresh in a moment.',
        'completing',
        result.errorCode,
      );
    }
    const pendingChangeId = result.pendingChangeId ?? state.pendingChangeId;
    return enter({ ...next, completeAttempts: attempts, pendingChangeId }, 'completing');
  }

  return fail(next, result.errorMessage || 'The plan change was refused.', from, result.errorCode);
}

/**
 * The plan-change reducer. Pure apart from issuing step tokens, and it returns the SAME state
 * object for an event it ignores.
 */
export function planChangeTransition(state: PlanChangeState, event: PlanChangeEvent): PlanChangeState {
  switch (event.type) {
    case 'PREVIEW_REQUESTED':
      // Re-previewing while one is in flight supersedes it (a StrictMode-doubled effect, or the
      // customer flipping the billing frequency); the older answer is then dropped as stale.
      if (
        state.step !== 'idle' &&
        state.step !== 'failed' &&
        state.step !== 'done' &&
        state.step !== 'confirm' &&
        state.step !== 'previewing'
      ) {
        return state;
      }
      return enter(
        {
          ...state,
          appId: event.appId,
          tierId: event.tierId,
          pricingId: event.pricingId,
          immediate: event.immediate ?? state.immediate,
          preview: null,
          result: null,
          completeAttempts: 0,
          clientSecret: undefined,
          pendingChangeId: undefined,
        },
        'previewing',
      );

    case 'PREVIEW_RECEIVED': {
      if (state.step !== 'previewing' || !isCurrentStep(state.token, event.token)) return state;
      if (!event.preview?.success) {
        return fail(
          { ...state, preview: event.preview ?? null },
          event.preview?.errorMessage ?? 'The plan change could not be priced.',
          'previewing',
        );
      }
      return enter({ ...state, preview: event.preview }, 'confirm');
    }

    case 'PREVIEW_FAILED':
      if (state.step !== 'previewing' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'previewing');

    case 'CONFIRMED': {
      if (state.step !== 'confirm') return state;
      const collect = event.collectPayment ?? needsPaymentFirst(state);
      return enter(state, collect ? 'collectingPayment' : 'changing');
    }

    case 'PAYMENT_COMPLETED':
      if (state.step !== 'collectingPayment') return state;
      return enter({ ...state, paymentTransactionId: event.paymentTransactionId }, 'changing');

    case 'PAYMENT_FAILED':
      if (state.step !== 'collectingPayment') return state;
      return fail(state, event.message, 'collectingPayment');

    case 'PAYMENT_CANCELLED':
      if (state.step !== 'collectingPayment') return state;
      return enter(state, 'confirm');

    case 'CHANGE_RESULT':
      if (state.step !== 'changing' || !isCurrentStep(state.token, event.token)) return state;
      return applyChangeResult({ ...state, token: null }, event.result, 'changing');

    case 'CHANGE_FAILED':
      if (state.step !== 'changing' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'changing');

    case 'AUTHENTICATED':
      if (state.step !== 'authenticating' || !isCurrentStep(state.token, event.token)) return state;
      return enter({ ...state, completeAttempts: 0 }, 'completing');

    case 'AUTH_FAILED':
      if (state.step !== 'authenticating' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'authenticating');

    case 'COMPLETE_RESULT':
      if (state.step !== 'completing' || !isCurrentStep(state.token, event.token)) return state;
      return applyChangeResult({ ...state, token: null }, event.result, 'completing');

    case 'COMPLETE_FAILED':
      if (state.step !== 'completing' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'completing');

    case 'RETRY':
      if (state.step !== 'failed' || !state.retryFrom) return state;
      return enter(state, state.retryFrom);

    case 'RESET':
      return initialPlanChangeState({
        appId: state.appId,
        tierId: state.tierId,
        pricingId: state.pricingId,
        immediate: state.immediate,
      });

    default:
      return state;
  }
}
