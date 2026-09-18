/**
 * Picking a plan previews the change and then asks the user to confirm it. The confirmation modal used
 * to be rendered only by the tabbed return, so in a stacked (single-panel) layout the click previewed
 * and then nothing happened at all.
 *
 * A change that needs a card used to THROW when the host had not wired `onPaymentRequired` - the
 * upgrade simply died. The component now collects the card itself, and a host that does pass the
 * callback still owns that step.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { AppTierModel } from '@wildwood/core';
import { createWrapper } from './testUtils.js';

const proTier = {
  id: 'tier-pro',
  name: 'Pro',
  isFreeTier: false,
  pricingOptions: [{ id: 'atp-pro-monthly', appTierId: 'tier-pro', pricingModelId: 'pm-pro-monthly', price: 39 }],
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
  previewTierChange: vi.fn().mockResolvedValue({ success: true, paymentRequired: false, newPrice: 39 }),
  changeTierWithOptions: vi.fn().mockResolvedValue({ success: true }),
  completeTierChange: vi.fn().mockResolvedValue({ success: true }),
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
      createElement('div', null, 'confirm tier change', [
        createElement(
          'button',
          { type: 'button', key: 'confirm', onClick: () => onConfirm({ immediate: true, bypassPayment: false }) },
          'Confirm',
        ),
      ]),
  };
});

// The card form itself is PaymentComponent's business and is exercised in its own suites; here it
// only has to answer, so the modal around it can be seen doing its job.
vi.mock('../components/payment/PaymentComponent.js', async () => {
  const { createElement } = await import('react');
  return {
    PaymentComponent: ({
      onPaymentSuccess,
      onCancel,
    }: {
      onPaymentSuccess: (result: { transactionId: string }) => void;
      onCancel: () => void;
    }) =>
      createElement('div', null, [
        createElement(
          'button',
          { type: 'button', key: 'pay', onClick: () => onPaymentSuccess({ transactionId: 'txn-built-in' }) },
          'Pay now',
        ),
        createElement('button', { type: 'button', key: 'cancel', onClick: onCancel }, 'Cancel payment'),
      ]),
  };
});

const { SubscriptionAdminComponent } = await import('../components/subscription/admin/SubscriptionAdminComponent.js');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The flow reads the app's payment configuration to find the Stripe account a 3-D Secure charge
// belongs to, so the component needs a client even when its data hook is stubbed.
const Wrapper = createWrapper();

describe('SubscriptionAdminComponent layouts', () => {
  it('confirms the change in a stacked plans layout', async () => {
    render(<SubscriptionAdminComponent appId="app-1" displayMode="tiers" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));

    expect(await screen.findByText('confirm tier change')).toBeTruthy();
  });

  it('still confirms the change in the tabbed layout', async () => {
    render(<SubscriptionAdminComponent appId="app-1" showStatusAboveTabs />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));

    expect(await screen.findByText('confirm tier change')).toBeTruthy();
  });

  it('collects the card itself when the host wired no onPaymentRequired', async () => {
    admin.previewTierChange.mockResolvedValueOnce({
      success: true,
      paymentRequired: true,
      paymentProviderAvailable: true,
      newTierName: 'Pro',
      newPrice: 39,
    });
    render(<SubscriptionAdminComponent appId="app-1" showStatusAboveTabs />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    // The built-in modal, where the component used to throw "Wire the onPaymentRequired callback".
    expect(await screen.findByText('Upgrade to Pro')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pay now' }));

    await waitFor(() => expect(admin.changeTierWithOptions).toHaveBeenCalled());
    expect(admin.changeTierWithOptions).toHaveBeenCalledWith('app-1', {
      newTierId: 'tier-pro',
      newPricingId: 'atp-pro-monthly',
      immediate: true,
      paymentTransactionId: 'txn-built-in',
      supportsPaymentAction: true,
    });
  });

  it('leaves the card to the host when onPaymentRequired is given', async () => {
    admin.previewTierChange.mockResolvedValueOnce({
      success: true,
      paymentRequired: true,
      paymentProviderAvailable: true,
      newTierName: 'Pro',
      newPrice: 39,
    });
    const onPaymentRequired = vi.fn().mockResolvedValue('txn-host');
    render(<SubscriptionAdminComponent appId="app-1" showStatusAboveTabs onPaymentRequired={onPaymentRequired} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalled());
    expect(screen.queryByText('Upgrade to Pro')).toBeNull();
    await waitFor(() =>
      expect(admin.changeTierWithOptions).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ paymentTransactionId: 'txn-host' }),
      ),
    );
  });
});
