/**
 * A plan change in the native admin surface used to end in one of two silences: a stacked layout
 * previewed and then rendered nothing, and a change that needed a card with no `onPaymentRequired`
 * wired threw "Wire the onPaymentRequired callback" at the user.
 *
 * This package has no React renderer, so the rule is exercised as the function the notice calls,
 * driven by the SAME machine the shared `usePlanChangeFlow` runs; the layout fact is a source guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TierChangePreviewModel } from '@wildwood/core';
import {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as LABELS,
  initialPlanChangeState,
  planChangeTransition,
} from '@wildwood/react-shared';
import type { PlanChangeState } from '@wildwood/react-shared';
import { planChangeNoticeContent } from '../components/registrationSubscription/parts/PlanChangeNotice';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf8');
/** The code, without the comments - which name the seam and the old error on purpose. */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const preview = (over: Partial<TierChangePreviewModel> = {}): TierChangePreviewModel =>
  ({ success: true, paymentRequired: true, newTierName: 'Pro', newPrice: 39, ...over }) as TierChangePreviewModel;

/** Drive the real machine from idle to wherever a priced change stops. */
function priceAndConfirm(over: Partial<TierChangePreviewModel> = {}): PlanChangeState {
  let state = initialPlanChangeState({ appId: 'app-1' });
  state = planChangeTransition(state, {
    type: 'PREVIEW_REQUESTED',
    appId: 'app-1',
    tierId: 'tier-pro',
    pricingId: 'atp-pro-monthly',
  });
  state = planChangeTransition(state, { type: 'PREVIEW_RECEIVED', token: state.token!, preview: preview(over) });
  expect(state.step).toBe('confirm');
  return planChangeTransition(state, { type: 'CONFIRMED', immediate: true });
}

describe('planChangeNoticeContent', () => {
  it('says nothing while the change is waiting on the customer or has not started', () => {
    for (const step of ['idle', 'previewing', 'confirm', 'changing', 'done'] as const) {
      expect(planChangeNoticeContent({ step, paymentRequest: null, error: null, canRetry: false }, LABELS).kind).toBe(
        'none',
      );
    }
  });

  it('says what a parked change is doing', () => {
    expect(
      planChangeNoticeContent({ step: 'authenticating', paymentRequest: null, error: null, canRetry: false }, LABELS),
    ).toMatchObject({ kind: 'progress', message: LABELS.authenticatingChange });
    expect(
      planChangeNoticeContent({ step: 'completing', paymentRequest: null, error: null, canRetry: false }, LABELS),
    ).toMatchObject({ kind: 'progress', message: LABELS.applyingChange });
  });

  it('says where a card can be given when the surface cannot take one', () => {
    // The flow hands out `paymentRequest` only when no host handler owns the card step. A surface
    // that mounts no card sheet of its own has nothing to offer for it - the old code threw here
    // instead. (The manage view and SubscriptionAdminComponent DO mount one: see manageView.test.)
    const content = planChangeNoticeContent(
      {
        step: 'collectingPayment',
        paymentRequest: { tierId: 'tier-pro', tierName: 'Pro', price: 39 },
        error: null,
        canRetry: false,
      },
      LABELS,
    );

    expect(content).toMatchObject({ kind: 'payment', message: LABELS.finishOnWeb, canDismiss: true });
    expect(content.message).not.toContain('onPaymentRequired');
  });

  it('stays quiet while the host collects the card itself', () => {
    // A host handler means `paymentRequest` is null: that modal is the host's, not ours to explain.
    expect(
      planChangeNoticeContent({ step: 'collectingPayment', paymentRequest: null, error: null, canRetry: false }, LABELS)
        .kind,
    ).toBe('none');
  });

  it('reports a failure with the way back', () => {
    const content = planChangeNoticeContent(
      { step: 'failed', paymentRequest: null, error: 'Card declined.', canRetry: true },
      LABELS,
    );

    expect(content).toMatchObject({
      kind: 'failed',
      title: LABELS.planChangeFailed,
      message: 'Card declined.',
      canRetry: true,
      canDismiss: true,
    });
  });
});

describe('the no-handler payment path, through the real machine', () => {
  it('parks in collectingPayment and the notice explains it instead of throwing', () => {
    const state = priceAndConfirm();

    expect(state.step).toBe('collectingPayment');
    // What `usePlanChangeFlow` exposes with no host handler: the request a card sheet would take.
    // On a surface that mounts none, the notice speaks for it.
    const content = planChangeNoticeContent(
      {
        step: state.step,
        paymentRequest: { tierId: 'tier-pro', tierName: 'Pro', price: 39 },
        error: null,
        canRetry: false,
      },
      LABELS,
    );
    expect(content.kind).toBe('payment');
  });

  it('goes straight to the change when the preview wants no money', () => {
    expect(priceAndConfirm({ paymentRequired: false }).step).toBe('changing');
  });
});

describe('SubscriptionAdminComponent source', () => {
  const source = readCode('components/subscription/SubscriptionAdminComponent.tsx');

  it('renders the confirmation modal in every display mode', () => {
    // It used to live only in the tabbed return, so a `displayMode` panel previewed and then showed
    // nothing at all. Both returns now render the one `confirmationModal`.
    expect(source.match(/\{confirmationModal\}/g)).toHaveLength(2);
    expect(source).toContain('const confirmationModal = flow.preview ?');
  });

  it('drives the change through the shared flow and never throws the missing-callback error', () => {
    expect(source).toContain('usePlanChangeFlow');
    expect(source).toContain('onTierSelected={flow.selectTier}');
    expect(source).not.toContain('PAYMENT_CALLBACK_MISSING_MESSAGE');
  });

  it('asks the server for a 3-D Secure park only from a device that can answer one', () => {
    // The adapter is whatever `usePaymentActionHandler` found - the component's prop, then the
    // provider's, then nothing. The shared flow posts the plain change when it is undefined, so a
    // device with no payment SDK never tells the server it can answer a challenge.
    expect(source).toContain('const handler = usePaymentActionHandler(paymentActionHandler)');
    expect(source).toContain('paymentActions: handler');
    expect(source).not.toContain('supportsPaymentAction: true');
  });

  it('says a failure once: the data-layer alert stands down while the notice speaks', () => {
    expect(source).toContain("admin.error && flow.step !== 'failed'");
  });
});
