/**
 * What the shared flows do when nobody can answer a bank's challenge.
 *
 * React always supplies a Stripe.js `PaymentActionAdapter`, so these paths never run on the web —
 * they are React Native's and Swift's, where there is no payment SDK to take a 3-D Secure prompt.
 * They are asserted here because this is where the shared flows are tested from, and because the
 * rule is easy to break from the web side without noticing: the adapter decides what the SERVER is
 * told, not just what happens afterwards.
 *
 * Two promises are being kept. A flow that cannot answer a challenge never asks the server to park
 * one — the plain `changeTier` form, no `supportsPaymentAction`, no SetupIntent — so the server
 * refuses up front instead of leaving a half-made change behind. And a challenge that arrives
 * anyway is reported in words, never swallowed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AddOnCheckoutItemResultModel, AddOnCheckoutQuoteModel } from '@wildwood/core';
import {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as LABELS,
  usePackCheckoutFlow,
  usePlanChangeFlow,
  useSubscriptionAdmin,
  type PaymentActionAdapter,
  type SignupPackOutcome,
} from '@wildwood/react-shared';
import { createWrapper } from './testUtils.js';
import { manageClient, preview, type ManageStubs } from './manageHarness.js';
import { signupClient, type SignupStubs } from './signupHarness.js';

/** A change the server parked on 3-D Secure. Only ever answered when there is an adapter. */
const PARKED = {
  success: false,
  requiresAction: true,
  clientSecret: 'pi_secret',
  pendingChangeId: 'pending-1',
};

function stubAdapter(): PaymentActionAdapter {
  return { confirmPayment: vi.fn().mockResolvedValue({ status: 'succeeded' }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── The plan change ────────────────────────────────────────────────────────────

describe('plan change with no payment-action adapter', () => {
  let stubs: ManageStubs;

  beforeEach(() => {
    stubs = manageClient();
    stubs.preview.mockResolvedValue(preview());
  });

  function renderFlow(paymentActions?: PaymentActionAdapter, onError?: (e: unknown) => void) {
    return renderHook(
      () => {
        const admin = useSubscriptionAdmin();
        return usePlanChangeFlow({
          appId: 'test-app-id',
          admin,
          labels: LABELS,
          paymentActions,
          onError,
        });
      },
      { wrapper: createWrapper(stubs.client) },
    );
  }

  async function upgrade(result: { current: ReturnType<typeof usePlanChangeFlow> }) {
    act(() =>
      result.current.selectTier({
        tierId: 'tier-pro',
        tierName: 'Pro',
        pricingId: 'price-pro-monthly',
        isFreeTier: false,
        isChange: true,
      }),
    );
    await waitFor(() => expect(result.current.step).toBe('confirm'));
    act(() => result.current.confirm({ immediate: true, bypassPayment: false }));
  }

  it('posts the plain change, never the form that asks the server to park one', async () => {
    const { result } = renderFlow();
    await upgrade(result);

    await waitFor(() => expect(stubs.changeTier).toHaveBeenCalled());
    expect(stubs.changeTier).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'price-pro-monthly', true, undefined);
    // The options form takes an object; the plain one takes the ids. Nothing said it could answer.
    expect(typeof stubs.changeTier.mock.calls[0]?.[1]).toBe('string');
  });

  it('still uses the options form when there IS an adapter', async () => {
    const { result } = renderFlow(stubAdapter());
    await upgrade(result);

    await waitFor(() => expect(stubs.changeTier).toHaveBeenCalled());
    expect(stubs.changeTier).toHaveBeenCalledWith(
      'test-app-id',
      expect.objectContaining({ supportsPaymentAction: true }),
    );
  });

  it('says where a parked change can be finished rather than failing silently', async () => {
    stubs.changeTier.mockResolvedValue(PARKED as never);
    const onError = vi.fn();
    const { result } = renderFlow(undefined, onError);
    await upgrade(result);

    await waitFor(() => expect(result.current.step).toBe('failed'));
    expect(result.current.error).toBe(LABELS.finishOnWeb);
    expect(onError).toHaveBeenCalledWith({
      code: 'tier_change_authentication_failed',
      message: LABELS.finishOnWeb,
    });
    // Nothing was completed, and no Stripe account was even looked up: there is nothing to load.
    expect(stubs.completeTierChange).not.toHaveBeenCalled();
    expect(stubs.paymentConfig).not.toHaveBeenCalled();
  });
});

// ── The pack checkout ──────────────────────────────────────────────────────────

function quote(overrides: Partial<AddOnCheckoutQuoteModel> = {}): AddOnCheckoutQuoteModel {
  return {
    success: true,
    checkoutId: 'chk-1',
    providerId: 'prov-stripe',
    currency: 'USD',
    lines: [
      {
        addOnId: 'pack-docs',
        pricingId: 'ao-docs',
        name: 'Docs Pack',
        price: 9,
        billingFrequency: 'Monthly',
        trialDays: 0,
        trialEligible: false,
        dueToday: 9,
      },
    ],
    totalDueToday: 9,
    requiresPaymentMethod: false,
    ...overrides,
  };
}

describe('pack checkout with no payment-action adapter', () => {
  let stubs: SignupStubs;

  beforeEach(() => {
    stubs = signupClient();
  });

  function renderFlow(onFinished: (packs: SignupPackOutcome[]) => void, onError?: (e: unknown) => void) {
    return renderHook(
      () =>
        usePackCheckoutFlow({
          appId: 'test-app-id',
          items: [{ addOnId: 'pack-docs' }],
          names: { 'pack-docs': 'Docs Pack' },
          labels: LABELS,
          onFinished,
          onError,
        }),
      { wrapper: createWrapper(stubs.client) },
    );
  }

  it('never asks the server for a SetupIntent it cannot confirm', async () => {
    stubs.quote.mockResolvedValue(quote({ requiresPaymentMethod: true }));
    const onError = vi.fn();
    const onFinished = vi.fn();
    const { result } = renderFlow(onFinished, onError);

    await waitFor(() => expect(result.current.step).toBe('failed'));
    expect(result.current.state.error).toBe(LABELS.finishOnWeb);
    expect(onError).toHaveBeenCalledWith({ code: 'pack_card_failed', message: LABELS.finishOnWeb });
    // No card was asked for at all - not a card asked for and then abandoned.
    expect(stubs.createCard).not.toHaveBeenCalled();
    expect(stubs.checkout).not.toHaveBeenCalled();
  });

  it('marks only the pack the bank asked about, and says where to finish it', async () => {
    stubs.quote.mockResolvedValue(quote());
    stubs.checkout.mockResolvedValue({
      success: true,
      checkoutId: 'chk-1',
      results: [
        {
          addOnId: 'pack-docs',
          pricingId: 'ao-docs',
          status: 'requires_action',
          clientSecret: 'pi_docs_secret',
          paymentTransactionId: 'txn-docs',
        } as AddOnCheckoutItemResultModel,
      ],
    });
    const onFinished = vi.fn();
    renderFlow(onFinished);

    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    expect(onFinished.mock.calls[0]?.[0]).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'failed', errorMessage: LABELS.finishOnWeb },
    ]);
    // The pack was never completed, and nothing tried to load a payment SDK to confirm it.
    expect(stubs.completeCheckout).not.toHaveBeenCalled();
    expect(stubs.paymentConfig).not.toHaveBeenCalled();
  });

  it('buys a basket that needs no card at all, exactly as it always did', async () => {
    stubs.quote.mockResolvedValue(quote());
    stubs.checkout.mockResolvedValue({
      success: true,
      checkoutId: 'chk-1',
      results: [{ addOnId: 'pack-docs', pricingId: 'ao-docs', status: 'active' } as AddOnCheckoutItemResultModel],
    });
    const onFinished = vi.fn();
    renderFlow(onFinished);

    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    expect(stubs.checkout).toHaveBeenCalledWith('test-app-id', {
      checkoutId: 'chk-1',
      providerId: 'prov-stripe',
      useSavedCard: true,
      items: [{ addOnId: 'pack-docs' }],
    });
    expect(onFinished.mock.calls[0]?.[0]).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'active', trialEnd: undefined },
    ]);
  });
});
