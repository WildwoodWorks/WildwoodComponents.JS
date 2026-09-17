/**
 * An upgrade that needs payment hands the host app what PaymentComponent needs to start the new plan's
 * subscription: the pricing MODEL id (the SDK's `pricingId` is the tier-pricing link, which the server can't
 * price or bill from), the plan's price, and its trial days.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import type { AppTierModel } from '@wildwood/core';

const changeTier = vi.fn().mockResolvedValue({ success: true });

const proTier = {
  id: 'tier-pro',
  name: 'Pro',
  isFreeTier: false,
  pricingOptions: [
    {
      id: 'atp-pro-monthly',
      appTierId: 'tier-pro',
      pricingModelId: 'pm-pro-monthly',
      price: 39,
      billingFrequency: 'Monthly',
      trialDays: 14,
    },
  ],
} as unknown as AppTierModel;

// One stable hook value: the component's effects depend on its fields, and a fresh object per render loops.
const admin = {
  tiers: [proTier],
  subscription: { appTierId: 'tier-free' },
  limitStatuses: [],
  featureDefinitions: [],
  featureStatus: {},
  featureOverrides: [],
  addOns: [],
  addOnSubscriptions: [],
  loading: false,
  error: null,
  refreshAll: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  previewTierChange: vi
    .fn()
    .mockResolvedValue({ success: true, paymentRequired: true, proratedChargeToday: 12.5, newPrice: 39 }),
  changeTier,
};

vi.mock('../hooks/useSubscriptionAdmin.js', () => ({
  useSubscriptionAdmin: () => admin,
}));

vi.mock('../components/subscription/admin/TierPlansPanel.js', async () => {
  const { createElement } = await import('react');
  return {
    TierPlansPanel: ({ onTierSelected }: { onTierSelected: (args: unknown) => void }) =>
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            onTierSelected({
              tierId: 'tier-pro',
              tierName: 'Pro',
              pricingId: 'atp-pro-monthly',
              isFreeTier: false,
              isChange: true,
            }),
        },
        'Choose Pro',
      ),
  };
});

for (const panel of ['SubscriptionStatusPanel', 'FeaturesPanel', 'AddOnsPanel', 'UsageLimitsPanel', 'OverridesPanel']) {
  vi.doMock(`../components/subscription/admin/${panel}.js`, () => ({ [panel]: () => null }));
}

vi.mock('../components/subscription/TierChangeConfirmationModal.js', async () => {
  const { createElement } = await import('react');
  return {
    TierChangeConfirmationModal: ({
      onConfirm,
    }: {
      onConfirm: (o: { immediate: boolean; bypassPayment: boolean }) => void;
    }) =>
      createElement(
        'button',
        { type: 'button', onClick: () => onConfirm({ immediate: true, bypassPayment: false }) },
        'Confirm',
      ),
  };
});

const { SubscriptionAdminComponent } = await import('../components/subscription/admin/SubscriptionAdminComponent.js');

afterEach(() => {
  cleanup();
  changeTier.mockClear();
});

describe('SubscriptionAdminComponent upgrade payment', () => {
  it('passes the pricing model, the plan price and the trial to onPaymentRequired, then changes tier with the payment', async () => {
    const onPaymentRequired = vi.fn().mockResolvedValue('txn-1');
    // Tabs mode (the only mode that renders the confirmation modal), opened on the plans tab.
    render(<SubscriptionAdminComponent appId="app-1" showStatusAboveTabs onPaymentRequired={onPaymentRequired} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(changeTier).toHaveBeenCalled());
    expect(onPaymentRequired).toHaveBeenCalledWith({
      tierId: 'tier-pro',
      tierName: 'Pro',
      pricingId: 'atp-pro-monthly',
      pricingModelId: 'pm-pro-monthly',
      price: 39,
      trialDays: 14,
    });
    expect(changeTier).toHaveBeenCalledWith('app-1', 'tier-pro', 'atp-pro-monthly', true, 'txn-1');
  });
});
