import { describe, it, expect, vi } from 'vitest';
import type { AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';

// The seam is a plain module (type-only core imports, no react-native), so it is unit-testable
// even though this package has no React renderer and cannot mount AppTierComponent itself.
import {
  PAYMENT_CALLBACK_MISSING_MESSAGE,
  paymentAmountForPreview,
  shouldPreviewTierChange,
  runTierChangeWithPayment,
} from '../components/subscription/paymentSeam';
import type { PaymentRequiredArgs, OnPaymentRequired } from '../components/subscription/paymentSeam';

const tier = (over: Partial<{ id: string; name: string; isFreeTier: boolean }> = {}) => ({
  id: 'tier-pro',
  name: 'Pro',
  isFreeTier: false,
  ...over,
});

const preview = (over: Partial<TierChangePreviewModel> = {}): TierChangePreviewModel => ({
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
  daysRemainingInPeriod: 30,
  allowImmediateChange: true,
  allowScheduledChange: true,
  ...over,
});

const ok: AppTierChangeResultModel = { success: true, errorMessage: '', isScheduled: false };
const failed: AppTierChangeResultModel = { success: false, errorMessage: 'Server said no', isScheduled: false };

describe('paymentAmountForPreview', () => {
  it('prefers the prorated charge over the list price', () => {
    expect(paymentAmountForPreview({ proratedChargeToday: 12.5, newPrice: 40 })).toBe(12.5);
  });

  it('falls back to the new price, then to zero', () => {
    expect(paymentAmountForPreview({ proratedChargeToday: undefined, newPrice: 40 })).toBe(40);
    expect(paymentAmountForPreview({ proratedChargeToday: undefined, newPrice: undefined })).toBe(0);
  });

  it('keeps a zero prorated charge rather than sliding to the list price', () => {
    // ?? not || — a fully credited upgrade really does cost nothing today.
    expect(paymentAmountForPreview({ proratedChargeToday: 0, newPrice: 40 })).toBe(0);
  });
});

describe('shouldPreviewTierChange', () => {
  it('previews paid targets and skips free ones', () => {
    expect(shouldPreviewTierChange({ isFreeTier: false })).toBe(true);
    expect(shouldPreviewTierChange({ isFreeTier: true })).toBe(false);
  });
});

describe('runTierChangeWithPayment', () => {
  it('skips the preview entirely for a free target tier', async () => {
    const previewTierChange = vi.fn();
    const applyChange = vi.fn().mockResolvedValue(ok);

    const outcome = await runTierChangeWithPayment({
      tier: tier({ isFreeTier: true }),
      previewTierChange,
      applyChange,
    });

    expect(previewTierChange).not.toHaveBeenCalled();
    expect(applyChange).toHaveBeenCalledWith(); // no transaction id
    expect(outcome).toEqual({ status: 'changed' });
  });

  it('changes directly when the preview says no payment is required', async () => {
    const onPaymentRequired = vi.fn();
    const applyChange = vi.fn().mockResolvedValue(ok);

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: false })),
      applyChange,
      onPaymentRequired,
    });

    expect(onPaymentRequired).not.toHaveBeenCalled();
    expect(applyChange).toHaveBeenCalledWith(); // no transaction id
    expect(outcome).toEqual({ status: 'changed' });
  });

  it('collects payment and retries with the transaction id', async () => {
    const seen: PaymentRequiredArgs[] = [];
    const onPaymentRequired: OnPaymentRequired = async (args) => {
      seen.push(args);
      return 'txn-123';
    };
    const applyChange = vi.fn().mockResolvedValue(ok);

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi
        .fn()
        .mockResolvedValue(preview({ paymentRequired: true, proratedChargeToday: 12.5, newPrice: 40 })),
      applyChange,
      onPaymentRequired,
    });

    expect(seen).toEqual([{ tierId: 'tier-pro', tierName: 'Pro', price: 12.5 }]);
    expect(applyChange).toHaveBeenCalledWith('txn-123');
    expect(outcome).toEqual({ status: 'changed' });
  });

  it.each([[null], [undefined]])('treats %s from the payment callback as a cancellation', async (result) => {
    const applyChange = vi.fn();

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: true, newPrice: 40 })),
      applyChange,
      onPaymentRequired: async () => result,
    });

    // Cancelling must not fire the change, and must not surface as an error.
    expect(applyChange).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('reports the wiring message when payment is required and no callback is supplied', async () => {
    const applyChange = vi.fn().mockRejectedValue(new Error('400: Payment is required to upgrade'));

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: true, newPrice: 40 })),
      applyChange,
    });

    // Today's direct call is still attempted, but the raw 400 gives way to actionable guidance.
    expect(applyChange).toHaveBeenCalledWith(); // no transaction id
    expect(outcome).toEqual({ status: 'failed', errorMessage: PAYMENT_CALLBACK_MISSING_MESSAGE });
  });

  it('lets an unwired change through when the server allows it anyway', async () => {
    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: true, newPrice: 40 })),
      applyChange: vi.fn().mockResolvedValue(ok),
    });

    expect(outcome).toEqual({ status: 'changed' });
  });

  it('degrades to the direct change when the preview rejects', async () => {
    const onPaymentRequired = vi.fn();
    const applyChange = vi.fn().mockResolvedValue(ok);

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockRejectedValue(new Error('preview-change unavailable')),
      applyChange,
      onPaymentRequired,
    });

    expect(onPaymentRequired).not.toHaveBeenCalled();
    expect(applyChange).toHaveBeenCalledWith(); // no transaction id
    expect(outcome).toEqual({ status: 'changed' });
  });

  it('degrades to the direct change when the preview comes back unsuccessful', async () => {
    const applyChange = vi.fn().mockResolvedValue(ok);

    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      // A success:false preview carries no trustworthy paymentRequired flag.
      previewTierChange: vi.fn().mockResolvedValue(preview({ success: false, paymentRequired: true })),
      applyChange,
      onPaymentRequired: vi.fn(),
    });

    expect(applyChange).toHaveBeenCalledWith(); // no transaction id
    expect(outcome).toEqual({ status: 'changed' });
  });

  it('surfaces the server message when the change itself fails', async () => {
    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: false })),
      applyChange: vi.fn().mockResolvedValue(failed),
    });

    expect(outcome).toEqual({ status: 'failed', errorMessage: 'Server said no' });
  });

  it('falls back to a generic message when the failure carries no text', async () => {
    const outcome = await runTierChangeWithPayment({
      tier: tier(),
      previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: false })),
      applyChange: vi.fn().mockResolvedValue({ success: false, errorMessage: '', isScheduled: false }),
    });

    expect(outcome).toEqual({ status: 'failed', errorMessage: 'Tier change failed' });
  });

  it('propagates a throw from a change that was not payment-gated', async () => {
    await expect(
      runTierChangeWithPayment({
        tier: tier(),
        previewTierChange: vi.fn().mockResolvedValue(preview({ paymentRequired: false })),
        applyChange: vi.fn().mockRejectedValue(new Error('network down')),
      }),
    ).rejects.toThrow('network down');
  });
});
