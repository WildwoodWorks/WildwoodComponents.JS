/**
 * When AppTierComponent collects payment, and what it does with the payment afterwards.
 *
 * The component used to decide "this change needs paying for" by looking at a failed change
 * result that carried no error message — a guess that only fired after the server had already
 * refused. It now asks `previewTierChange` first, and it forwards the PaymentComponent's
 * transaction id back into the change call so the server sees the upgrade as paid.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import type {
  AppTierModel,
  AppTierChangeResultModel,
  PaymentCompletionResult,
  TierChangePreviewModel,
} from '@wildwood/core';
import { createTestClient, createWrapper } from './testUtils.js';

vi.mock('../components/payment/PaymentComponent.js', async () => {
  // A real payment form needs a provider, Stripe and a network. All this test needs from it is
  // the one thing AppTierComponent consumes: the completion result, with its transaction id.
  const { createElement } = await import('react');
  return {
    PaymentComponent: ({ onPaymentSuccess }: { onPaymentSuccess?: (result: PaymentCompletionResult) => void }) =>
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => onPaymentSuccess?.({ success: true, transactionId: 'txn-1' }),
        },
        'Complete payment',
      ),
  };
});

const { AppTierComponent } = await import('../components/apptier/AppTierComponent.js');

const paidTier: AppTierModel = {
  id: 'tier-pro',
  appId: 'test-app-id',
  name: 'Pro',
  description: 'Everything in Free, plus more',
  displayOrder: 1,
  isDefault: false,
  isFreeTier: false,
  allowUpgrades: true,
  allowDowngrades: true,
  status: 'Active',
  badgeColor: 'primary',
  iconClass: '',
  showSubscribeButton: true,
  showContactButton: false,
  showPrice: true,
  pricingOptions: [
    {
      id: 'atp-1',
      appTierId: 'tier-pro',
      pricingModelId: 'pm-monthly',
      isDefault: true,
      displayOrder: 0,
      pricingModelName: 'Monthly',
      price: 10,
      billingFrequency: 'Monthly',
    },
  ],
  features: [],
  limits: [],
};

const freeTier: AppTierModel = {
  id: 'tier-free',
  appId: 'test-app-id',
  name: 'Free',
  description: 'Get going',
  displayOrder: 0,
  isDefault: true,
  isFreeTier: true,
  allowUpgrades: true,
  allowDowngrades: true,
  status: 'Active',
  badgeColor: 'secondary',
  iconClass: '',
  showSubscribeButton: true,
  showContactButton: false,
  showPrice: true,
  pricingOptions: [],
  features: [],
  limits: [],
};

const changed: AppTierChangeResultModel = { success: true, errorMessage: '', isScheduled: false };

const preview = (paymentRequired: boolean): TierChangePreviewModel => ({
  success: true,
  isUpgrade: true,
  isDowngrade: false,
  isBillingFrequencyChange: false,
  paymentRequired,
  paymentBypassAllowed: false,
  paymentProviderAvailable: true,
  newTierName: 'Pro',
  currency: 'USD',
  featuresGained: [],
  featuresLost: [],
  daysRemainingInPeriod: 12,
  allowImmediateChange: true,
  allowScheduledChange: true,
});

/** Spies for the four appTier calls the component drives. */
function setup() {
  const client = createTestClient();
  const getTiers = vi.spyOn(client.appTier, 'getTiers').mockResolvedValue([freeTier, paidTier]);
  const getUserSubscription = vi.spyOn(client.appTier, 'getUserSubscription').mockResolvedValue(null);
  const previewTierChange = vi.spyOn(client.appTier, 'previewTierChange').mockResolvedValue(preview(false));
  const selfSubscribe = vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue(changed);
  return { client, getTiers, getUserSubscription, previewTierChange, selfSubscribe };
}

/**
 * Click a button and let the state updates its async handler schedules settle, so the awaited
 * preview/change calls do not land outside act().
 */
async function clickAndSettle(name: string) {
  const button = await screen.findByRole('button', { name });
  await act(async () => {
    fireEvent.click(button);
  });
}

/** Select the paid tier and press through its confirmation step. */
async function confirmPaidTier() {
  await clickAndSettle('Subscribe');
  await clickAndSettle('Confirm Change');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppTierComponent payment step', () => {
  it('previews the change and collects payment when the server says it is required', async () => {
    const { client, previewTierChange, selfSubscribe } = setup();
    previewTierChange.mockResolvedValue(preview(true));

    render(<AppTierComponent selfService />, { wrapper: createWrapper(client) });
    await confirmPaidTier();

    // Asked before charging anything, with the app id, the tier and the selected pricing model.
    await waitFor(() => expect(previewTierChange).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'pm-monthly'));
    await screen.findByRole('button', { name: 'Complete payment' });
    // Nothing was attempted against the tier before the money was collected.
    expect(selfSubscribe).not.toHaveBeenCalled();

    await clickAndSettle('Complete payment');

    await waitFor(() => expect(selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'pm-monthly', 'txn-1'));
    expect(await screen.findByText('Successfully switched to Pro!')).toBeTruthy();
  });

  it('changes the tier directly when the preview reports no payment is required', async () => {
    const { client, previewTierChange, selfSubscribe } = setup();
    previewTierChange.mockResolvedValue(preview(false));

    render(<AppTierComponent selfService />, { wrapper: createWrapper(client) });
    await confirmPaidTier();

    await waitFor(() => expect(selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'pm-monthly', undefined));
    expect(await screen.findByText('Successfully switched to Pro!')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Complete payment' })).toBeNull();
  });

  it('degrades to the direct change call when the preview is unavailable', async () => {
    // The server still guards the change, so an unreachable preview must not block the upgrade.
    const { client, previewTierChange, selfSubscribe } = setup();
    previewTierChange.mockRejectedValue(new Error('preview unavailable'));

    render(<AppTierComponent selfService />, { wrapper: createWrapper(client) });
    await confirmPaidTier();

    await waitFor(() => expect(selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'pm-monthly', undefined));
    expect(await screen.findByText('Successfully switched to Pro!')).toBeTruthy();
  });

  it('keeps the failed-without-a-message heuristic when the preview is unavailable', async () => {
    const { client, previewTierChange, selfSubscribe } = setup();
    previewTierChange.mockRejectedValue(new Error('preview unavailable'));
    selfSubscribe.mockResolvedValueOnce({ success: false, errorMessage: '', isScheduled: false });

    render(<AppTierComponent selfService />, { wrapper: createWrapper(client) });
    await confirmPaidTier();

    // Refused with nothing to say: the old signal that money is wanted first.
    await clickAndSettle('Complete payment');

    // The retry carries the payment, and does not re-run the preview.
    await waitFor(() =>
      expect(selfSubscribe).toHaveBeenLastCalledWith('test-app-id', 'tier-pro', 'pm-monthly', 'txn-1'),
    );
    expect(previewTierChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Successfully switched to Pro!')).toBeTruthy();
  });

  it('never previews a switch to a free tier', async () => {
    const { client, previewTierChange, selfSubscribe } = setup();

    render(<AppTierComponent selfService />, { wrapper: createWrapper(client) });
    await clickAndSettle('Get Started');

    await waitFor(() => expect(selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-free', undefined, undefined));
    expect(previewTierChange).not.toHaveBeenCalled();
  });
});
