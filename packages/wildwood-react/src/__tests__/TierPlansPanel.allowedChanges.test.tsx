/**
 * The plans grid offers only the switches the subscriber's current plan allows. The server refuses
 * the rest ("Upgrades are not allowed from current tier"), so a button for one is a button that can
 * only fail. Found on a live app whose Pro plan allows neither upgrades nor downgrades.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { AppTierModel } from '@wildwood/core';
import { TierPlansPanel } from '../components/subscription/admin/TierPlansPanel.js';

function tier(id: string, name: string, displayOrder: number, allowUpgrades: boolean, allowDowngrades: boolean) {
  return {
    id,
    appId: 'app',
    name,
    description: '',
    displayOrder,
    isDefault: false,
    isFreeTier: displayOrder === 1,
    allowUpgrades,
    allowDowngrades,
    status: 'Active',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    features: [],
    limits: [],
    // Priced, so the paid plans are switchable plans rather than contact-only ("Custom") ones.
    pricingOptions:
      displayOrder === 1
        ? []
        : [{ id: `${id}-m`, appTierId: id, price: displayOrder * 10, billingFrequency: 'Monthly', isDefault: true }],
  } as unknown as AppTierModel;
}

const free = tier('free', 'Free', 1, true, false);
const pro = tier('pro', 'Pro', 2, false, false);
const business = tier('business', 'Business', 3, true, true);
const tiers = [free, pro, business];

const footerOf = (name: string) =>
  screen.getByRole('heading', { name }).closest('.ww-tier-card')!.querySelector('.ww-tier-footer')!;

afterEach(cleanup);

describe('TierPlansPanel - allowed changes', () => {
  it('replaces the switches a locked plan cannot make with a marker', () => {
    render(<TierPlansPanel tiers={tiers} currentTierId="pro" />);

    for (const name of ['Free', 'Business']) {
      const footer = footerOf(name);
      expect(footer.querySelector('button')).toBeNull();
      expect(footer.querySelector('.ww-tier-unavailable')?.textContent).toBe('Not available on your plan');
    }
    expect(footerOf('Pro').textContent).toBe('Current Plan');
  });

  it('keeps the switches the current plan allows', () => {
    render(<TierPlansPanel tiers={tiers} currentTierId="free" />);

    // Free allows upgrades: both paid plans stay one click away.
    expect(screen.getByRole('button', { name: 'Switch to Pro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch to Business' })).toBeTruthy();
  });

  it('offers every plan to someone with no subscription yet', () => {
    render(<TierPlansPanel tiers={tiers} />);

    expect(document.querySelectorAll('.ww-tier-unavailable')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
