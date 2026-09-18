/**
 * Picking a plan previews the change and then asks the user to confirm it. The confirmation modal used
 * to be rendered only by the tabbed return, so in a stacked (single-panel) layout the click previewed
 * and then nothing happened at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { AppTierModel } from '@wildwood/core';

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
  changeTier: vi.fn().mockResolvedValue({ success: true }),
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
    TierChangeConfirmationModal: () => createElement('div', null, 'confirm tier change'),
  };
});

const { SubscriptionAdminComponent } = await import('../components/subscription/admin/SubscriptionAdminComponent.js');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SubscriptionAdminComponent layouts', () => {
  it('confirms the change in a stacked plans layout', async () => {
    render(<SubscriptionAdminComponent appId="app-1" displayMode="tiers" />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));

    expect(await screen.findByText('confirm tier change')).toBeTruthy();
  });

  it('still confirms the change in the tabbed layout', async () => {
    render(<SubscriptionAdminComponent appId="app-1" showStatusAboveTabs />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));

    expect(await screen.findByText('confirm tier change')).toBeTruthy();
  });
});
