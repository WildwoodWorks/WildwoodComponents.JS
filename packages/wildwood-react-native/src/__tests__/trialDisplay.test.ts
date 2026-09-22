import { describe, it, expect } from 'vitest';
import type { UserTierSubscriptionModel } from '@wildwood/core';

// Both rules are exported from the components that apply them: this package has no React renderer
// (no react-dom / @testing-library), so the rule is tested as the function the component calls.
import { showsTrialEnd } from '../components/subscription/SubscriptionStatusPanel';
import { showsTrialLine } from '../components/tier/TierCardHeader';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-18T12:00:00Z');
const future = new Date(NOW + 7 * DAY).toISOString();
const past = new Date(NOW - 7 * DAY).toISOString();

const subscription = (
  over: Partial<UserTierSubscriptionModel>,
): Pick<UserTierSubscriptionModel, 'status' | 'trialEndDate'> => ({
  status: 'Trialing',
  ...over,
});

describe('showsTrialEnd', () => {
  it('shows a running trial', () => {
    expect(showsTrialEnd(subscription({ status: 'Trialing', trialEndDate: future }), NOW)).toBe(true);
  });

  it('hides it on a plan that is already being paid for', () => {
    // The server keeps the date on the row after the trial converts — it records that the account
    // has had its trial. Showing it said "Trial Ends <future date>" on an Active, charged plan.
    expect(showsTrialEnd(subscription({ status: 'Active', trialEndDate: future }), NOW)).toBe(false);
  });

  it('hides it once the date has passed', () => {
    expect(showsTrialEnd(subscription({ status: 'Trialing', trialEndDate: past }), NOW)).toBe(false);
  });

  it('hides it when the subscription never had a trial', () => {
    expect(showsTrialEnd(subscription({ status: 'Trialing', trialEndDate: undefined }), NOW)).toBe(false);
  });
});

describe('showsTrialLine', () => {
  const paid = { price: 79, trialDays: 14 };

  it('advertises a trial on a priced plan', () => {
    expect(showsTrialLine({ showPrice: true, isEnterprise: false, isFreeTier: false, pricing: paid })).toBe(true);
  });

  it('says nothing when the pricing starts no trial', () => {
    expect(
      showsTrialLine({ showPrice: true, isEnterprise: false, isFreeTier: false, pricing: { price: 79, trialDays: 0 } }),
    ).toBe(false);
    expect(
      showsTrialLine({
        showPrice: true,
        isEnterprise: false,
        isFreeTier: false,
        pricing: { price: 79, trialDays: undefined },
      }),
    ).toBe(false);
  });

  it('says nothing when there is nothing to trial', () => {
    // A zero-price plan, a free tier, an enterprise "contact us" card, a card that hides its price.
    expect(
      showsTrialLine({ showPrice: true, isEnterprise: false, isFreeTier: false, pricing: { price: 0, trialDays: 14 } }),
    ).toBe(false);
    expect(showsTrialLine({ showPrice: true, isEnterprise: false, isFreeTier: true, pricing: paid })).toBe(false);
    expect(showsTrialLine({ showPrice: true, isEnterprise: true, isFreeTier: false, pricing: paid })).toBe(false);
    expect(showsTrialLine({ showPrice: false, isEnterprise: false, isFreeTier: false, pricing: paid })).toBe(false);
    expect(showsTrialLine({ showPrice: true, isEnterprise: false, isFreeTier: false, pricing: undefined })).toBe(false);
  });
});
