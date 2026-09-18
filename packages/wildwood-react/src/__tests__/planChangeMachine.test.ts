/**
 * The plan-change reducer: every layout confirms the preview, 3-D Secure is a "not yet" rather than
 * a refusal, and `processing` is retried instead of reported as a failure.
 */
import { describe, it, expect } from 'vitest';
import type { AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';
import {
  MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS,
  initialPlanChangeState,
  planChangeTransition,
  type PlanChangeState,
} from '@wildwood/react-shared';

const preview = (overrides: Partial<TierChangePreviewModel> = {}): TierChangePreviewModel => ({
  success: true,
  isUpgrade: true,
  isDowngrade: false,
  isBillingFrequencyChange: false,
  paymentRequired: false,
  paymentBypassAllowed: false,
  paymentProviderAvailable: true,
  featuresGained: [],
  featuresLost: [],
  currency: 'USD',
  daysRemainingInPeriod: 12,
  allowImmediateChange: true,
  allowScheduledChange: true,
  ...overrides,
});

const changeResult = (overrides: Partial<AppTierChangeResultModel> = {}): AppTierChangeResultModel => ({
  success: false,
  errorMessage: '',
  isScheduled: false,
  ...overrides,
});

function previewed(previewModel: TierChangePreviewModel): PlanChangeState {
  let state = planChangeTransition(initialPlanChangeState(), {
    type: 'PREVIEW_REQUESTED',
    appId: 'app-1',
    tierId: 'tier-pro',
    pricingId: 'atp-1',
  });
  state = planChangeTransition(state, { type: 'PREVIEW_RECEIVED', token: state.token!, preview: previewModel });
  return state;
}

describe('planChangeMachine', () => {
  it('previews, confirms and changes', () => {
    let state = previewed(preview());
    expect(state.step).toBe('confirm');
    expect(state.preview?.isUpgrade).toBe(true);

    state = planChangeTransition(state, { type: 'CONFIRMED' });
    expect(state.step).toBe('changing');

    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({ success: true }),
    });
    expect(state.step).toBe('done');
    expect(state.error).toBeNull();
  });

  it('parks on 3-D Secure, then completes', () => {
    let state = previewed(preview({ paymentRequired: true, paymentBypassAllowed: true, proratedChargeToday: 12.5 }));
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    expect(state.step).toBe('changing');

    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({
        requiresAction: true,
        clientSecret: 'pi_secret',
        pendingChangeId: 'pending-1',
        amountDue: 12.5,
        currency: 'USD',
      }),
    });
    expect(state.step).toBe('authenticating');
    expect(state.clientSecret).toBe('pi_secret');
    expect(state.pendingChangeId).toBe('pending-1');
    // "Not yet" is not a refusal: nothing is shown as an error.
    expect(state.error).toBeNull();

    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });
    expect(state.step).toBe('completing');

    state = planChangeTransition(state, {
      type: 'COMPLETE_RESULT',
      token: state.token!,
      result: changeResult({ success: true }),
    });
    expect(state.step).toBe('done');
  });

  it('retries completion while the server answers processing', () => {
    let state = previewed(preview());
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({ requiresAction: true, clientSecret: 's', pendingChangeId: 'pending-1' }),
    });
    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });

    const firstToken = state.token!;
    state = planChangeTransition(state, {
      type: 'COMPLETE_RESULT',
      token: firstToken,
      result: changeResult({ processing: true }),
    });
    expect(state.step).toBe('completing');
    expect(state.completeAttempts).toBe(1);
    // A fresh token, so the hook's effect runs the completion again.
    expect(state.token).not.toBe(firstToken);

    state = planChangeTransition(state, {
      type: 'COMPLETE_RESULT',
      token: state.token!,
      result: changeResult({ success: true }),
    });
    expect(state.step).toBe('done');
  });

  it('gives up after too many processing answers', () => {
    let state = previewed(preview());
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({ requiresAction: true, clientSecret: 's', pendingChangeId: 'pending-1' }),
    });
    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });

    for (let i = 0; i < MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS; i += 1) {
      state = planChangeTransition(state, {
        type: 'COMPLETE_RESULT',
        token: state.token!,
        result: changeResult({ processing: true }),
      });
    }
    expect(state.step).toBe('failed');
    expect(state.completeAttempts).toBe(MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS);
    expect(state.retryFrom).toBe('completing');
  });

  it('starts the completion budget over on a manual retry', () => {
    let state = previewed(preview());
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({ requiresAction: true, clientSecret: 's', pendingChangeId: 'pending-1' }),
    });
    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });

    for (let i = 0; i < MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS; i += 1) {
      state = planChangeTransition(state, {
        type: 'COMPLETE_RESULT',
        token: state.token!,
        result: changeResult({ processing: true }),
      });
    }
    expect(state.step).toBe('failed');

    // The budget belongs to one automatic run of retries: the customer's own retry gets a fresh
    // one, or it would give up on its first answer.
    state = planChangeTransition(state, { type: 'RETRY' });
    expect(state.step).toBe('completing');
    expect(state.completeAttempts).toBe(0);
  });

  it('carries the timing the customer chose into the change', () => {
    let state = previewed(preview({ isUpgrade: false, isDowngrade: true }));
    expect(state.immediate).toBe(true);

    state = planChangeTransition(state, { type: 'CONFIRMED', immediate: false });
    expect(state.step).toBe('changing');
    expect(state.immediate).toBe(false);
  });

  it('reports the server errorCode on a refusal', () => {
    let state = previewed(preview());
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({
        errorMessage: 'That change is already under way',
        errorCode: 'tier_change_already_in_progress',
      }),
    });
    expect(state.step).toBe('failed');
    expect(state.error).toBe('That change is already under way');
    expect(state.errorCode).toBe('tier_change_already_in_progress');
    expect(state.retryFrom).toBe('changing');
  });

  it('collects a payment first on the legacy path', () => {
    // paymentRequired with no bypass: the host's onPaymentRequired (or the built-in modal) runs
    // before the change is posted at all.
    let state = previewed(preview({ paymentRequired: true, paymentBypassAllowed: false, newPrice: 39 }));
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    expect(state.step).toBe('collectingPayment');

    state = planChangeTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-9' });
    expect(state.step).toBe('changing');
    expect(state.paymentTransactionId).toBe('txn-9');

    state = planChangeTransition(state, {
      type: 'CHANGE_RESULT',
      token: state.token!,
      result: changeResult({ success: true }),
    });
    expect(state.step).toBe('done');
  });

  it('a cancelled payment goes back to the confirmation, not to a failure', () => {
    let state = previewed(preview({ paymentRequired: true }));
    state = planChangeTransition(state, { type: 'CONFIRMED' });
    state = planChangeTransition(state, { type: 'PAYMENT_CANCELLED' });
    expect(state.step).toBe('confirm');
    expect(state.error).toBeNull();
  });

  it('ignores a result carrying a stale step token', () => {
    let state = planChangeTransition(initialPlanChangeState(), {
      type: 'PREVIEW_REQUESTED',
      appId: 'app-1',
      tierId: 'tier-pro',
    });
    const stale = state.token!;
    state = planChangeTransition(state, { type: 'PREVIEW_REQUESTED', appId: 'app-1', tierId: 'tier-pro' });

    const ignored = planChangeTransition(state, { type: 'PREVIEW_RECEIVED', token: stale, preview: preview() });
    expect(ignored).toBe(state);
    expect(ignored.step).toBe('previewing');
  });
});
