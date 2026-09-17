/**
 * The subscription row keeps a trial's end date after the trial is over (the server uses it to give each
 * account one trial), so the panel shows "Trial Ends" only while a trial is running.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { UserTierSubscriptionModel } from '@wildwood/core';
import { SubscriptionStatusPanel } from '../components/subscription/admin/SubscriptionStatusPanel.js';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function sub(overrides: Partial<UserTierSubscriptionModel>): UserTierSubscriptionModel {
  return {
    id: 'sub-1',
    appTierId: 'tier-pro',
    tierName: 'Pro',
    isFreeTier: false,
    status: 'Trialing',
    startDate: inDays(-2),
    ...overrides,
  } as UserTierSubscriptionModel;
}

afterEach(cleanup);

describe('SubscriptionStatusPanel trial end', () => {
  it('shows when a running trial ends', () => {
    render(<SubscriptionStatusPanel subscription={sub({ status: 'Trialing', trialEndDate: inDays(12) })} />);
    expect(screen.getByText('Trial Ends')).toBeTruthy();
  });

  it('hides a leftover trial date on a plan that is being paid for', () => {
    render(<SubscriptionStatusPanel subscription={sub({ status: 'Active', trialEndDate: inDays(12) })} />);
    expect(screen.queryByText('Trial Ends')).toBeNull();
  });

  it('hides a trial that has already ended', () => {
    render(<SubscriptionStatusPanel subscription={sub({ status: 'PastDue', trialEndDate: inDays(-1) })} />);
    expect(screen.queryByText('Trial Ends')).toBeNull();
  });
});
