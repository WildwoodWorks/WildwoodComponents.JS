/**
 * What a pack row says has to be true: a pack the account no longer has is on offer again, a pack
 * nothing paid for promises no renewal and cannot be reactivated at a provider, and a refused
 * subscribe or cancel is reported rather than swallowed.
 *
 * This package has no React renderer (no react-dom / @testing-library), so the rules are exercised
 * as the functions the panel calls; the rendered behaviour is covered in @wildwood/react's
 * `AddOnsPanel.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { ACCESS_GRANTING_STATUSES } from '@wildwood/react-shared';
import {
  DEFAULT_ADDON_LABELS,
  addOnFailureMessage,
  addOnRowRules,
  addOnTrialLabel,
  isComplimentaryAddOn,
  ownsAddOn,
} from '../components/subscription/AddOnsPanel';
import { showsIncludedBadge } from '../components/subscription/FeaturesPanel';

const row = (over: Partial<UserAddOnSubscriptionModel> = {}): UserAddOnSubscriptionModel =>
  ({
    id: 'sub-1',
    userId: 'user-1',
    appId: 'app-1',
    appTierAddOnId: 'addon-seats',
    status: 'Active',
    paymentTransactionId: 'txn-seats',
    addOnName: 'Extra Seats',
    isBundled: false,
    startDate: '2026-01-01T00:00:00Z',
    ...over,
  }) as UserAddOnSubscriptionModel;

/** Every status the server can put on a pack subscription. */
const EVERY_STATUS = ['Active', 'Trialing', 'PendingCancellation', 'Cancelled', 'Expired', 'Suspended'] as const;

describe('ownsAddOn', () => {
  it.each(EVERY_STATUS)('matches grantsAccess for %s', (status) => {
    const owned = (ACCESS_GRANTING_STATUSES as readonly string[]).includes(status);
    expect(ownsAddOn([row({ status })], 'addon-seats')).toBe(owned);
  });

  it('offers a pack again once its subscription is cancelled or expired', () => {
    // The live bug: ANY row - Cancelled included - badged the pack "Subscribed" and hid the offer.
    expect(ownsAddOn([row({ status: 'Cancelled' })], 'addon-seats')).toBe(false);
    expect(ownsAddOn([row({ status: 'Expired' })], 'addon-seats')).toBe(false);
  });

  it('still counts a pack scheduled to cancel as owned, so it is not sold twice', () => {
    expect(ownsAddOn([row({ status: 'PendingCancellation' })], 'addon-seats')).toBe(true);
  });

  it('compares ids case-insensitively and ignores other packs', () => {
    expect(ownsAddOn([row({ appTierAddOnId: 'ADDON-SEATS' })], 'addon-seats')).toBe(true);
    expect(ownsAddOn([row({ appTierAddOnId: 'addon-storage' })], 'addon-seats')).toBe(false);
    expect(ownsAddOn([], 'addon-seats')).toBe(false);
  });
});

describe('isComplimentaryAddOn', () => {
  it('is true only for a row nothing paid for and no plan bundles', () => {
    expect(isComplimentaryAddOn(row({ paymentTransactionId: undefined }))).toBe(true);
    expect(isComplimentaryAddOn(row({ paymentTransactionId: 'txn-seats' }))).toBe(false);
    expect(isComplimentaryAddOn(row({ paymentTransactionId: undefined, isBundled: true }))).toBe(false);
  });
});

describe('addOnRowRules', () => {
  const opts = { canCancel: true, canReactivate: true };

  it('shows a granted pack as included, with no renewal date and no reactivate', () => {
    const rules = addOnRowRules(row({ paymentTransactionId: undefined, endDate: '2026-03-01T00:00:00Z' }), opts);

    expect(rules.complimentary).toBe(true);
    // Nothing bills it, so there is no renewal to promise even though the server sent an end date.
    expect(rules.dateLine).toBe('none');
    expect(rules.offersReactivate).toBe(false);
    expect(rules.offersCancel).toBe(true);
    expect(rules.cancelMessage).toBe(DEFAULT_ADDON_LABELS.cancelIncluded);
  });

  it('asks about the billing period before cancelling a billed pack', () => {
    const rules = addOnRowRules(row({ endDate: '2026-03-01T00:00:00Z' }), opts);

    expect(rules.dateLine).toBe('renews');
    expect(rules.cancelMessage).toBe(DEFAULT_ADDON_LABELS.cancelBilled);
    expect(rules.statusLabel).toBe('Active');
  });

  it('badges a scheduled cancellation and says when it ends', () => {
    const rules = addOnRowRules(row({ status: 'PendingCancellation', endDate: '2026-03-01T00:00:00Z' }), opts);

    expect(rules.statusLabel).toBe('Cancellation Scheduled');
    expect(rules.dateLine).toBe('cancels');
    expect(rules.offersReactivate).toBe(true);
    // Already cancelling: no second Cancel button.
    expect(rules.offersCancel).toBe(false);
  });

  it('still says a pack is scheduled to cancel when the server sent no end date', () => {
    expect(addOnRowRules(row({ status: 'PendingCancellation' }), opts).dateLine).toBe('cancelsAtPeriodEnd');
  });

  it('never offers reactivate on a granted or bundled row, or with no handler', () => {
    const cancelling = { status: 'PendingCancellation' as const, endDate: '2026-03-01T00:00:00Z' };

    expect(addOnRowRules(row({ ...cancelling, paymentTransactionId: undefined }), opts).offersReactivate).toBe(false);
    expect(addOnRowRules(row({ ...cancelling, isBundled: true }), opts).offersReactivate).toBe(false);
    expect(addOnRowRules(row(cancelling), { canCancel: true }).offersReactivate).toBe(false);
  });

  it('offers nothing on a bundled row, and nothing without the handlers', () => {
    expect(addOnRowRules(row({ isBundled: true }), opts).offersCancel).toBe(false);
    expect(addOnRowRules(row(), {}).offersCancel).toBe(false);
  });

  it("takes the host's cancel copy when it supplies one", () => {
    const rules = addOnRowRules(row({ paymentTransactionId: undefined }), {
      ...opts,
      labels: { cancelIncluded: 'Cancelling gives it back.' },
    });

    expect(rules.cancelMessage).toBe('Cancelling gives it back.');
  });
});

describe('addOnFailureMessage', () => {
  it('names the pack and the action when the refusal carried no words', () => {
    expect(addOnFailureMessage('subscribe', 'Extra Seats')).toBe(
      'Could not subscribe to Extra Seats. Please try again.',
    );
    expect(addOnFailureMessage('cancel', 'Extra Seats')).toBe('Could not cancel Extra Seats. Please try again.');
    expect(addOnFailureMessage('reactivate', 'Extra Seats')).toBe(
      'Could not reactivate Extra Seats. Please try again.',
    );
  });

  it("prefers the server's own refusal when the call threw one", () => {
    expect(addOnFailureMessage('subscribe', 'Extra Seats', new Error('Card declined.'))).toBe('Card declined.');
  });

  it('falls back when the thrown value says nothing useful', () => {
    expect(addOnFailureMessage('cancel', 'Extra Seats', new Error(''))).toContain('Could not cancel Extra Seats');
    expect(addOnFailureMessage('cancel', 'Extra Seats', 'nope')).toContain('Could not cancel Extra Seats');
  });
});

describe('addOnTrialLabel', () => {
  const pack = (over: Partial<AppTierAddOnModel> = {}) => ({ trialDays: 7, ...over }) as AppTierAddOnModel;

  it('takes the trial from the pricing option that is bought, not the pack', () => {
    expect(addOnTrialLabel(pack({ trialDays: 7 }), { trialDays: 14 })).toBe('14-day free trial');
  });

  it('falls back to the pack when the pricing option starts no trial', () => {
    expect(addOnTrialLabel(pack({ trialDays: 7 }), { trialDays: undefined })).toBe('7-day free trial');
    expect(addOnTrialLabel(pack({ trialDays: 7 }))).toBe('7-day free trial');
  });

  it('says nothing - and never renders a bare 0 - when there is no trial', () => {
    expect(addOnTrialLabel(pack({ trialDays: 0 }), { trialDays: 0 })).toBe('');
    expect(addOnTrialLabel(pack({ trialDays: undefined }))).toBe('');
  });
});

describe('showsIncludedBadge', () => {
  it('marks an enabled feature an override granted', () => {
    expect(
      showsIncludedBadge({ featureCode: 'REPORTS', isEnabled: true }, [{ featureCode: 'REPORTS', isEnabled: true }]),
    ).toBe(true);
  });

  it('says nothing about a feature the plan itself carries', () => {
    expect(showsIncludedBadge({ featureCode: 'REPORTS', isEnabled: true }, [])).toBe(false);
  });

  it('never marks a feature an override took away, or one that is off', () => {
    expect(
      showsIncludedBadge({ featureCode: 'REPORTS', isEnabled: true }, [{ featureCode: 'REPORTS', isEnabled: false }]),
    ).toBe(false);
    expect(
      showsIncludedBadge({ featureCode: 'REPORTS', isEnabled: false }, [{ featureCode: 'REPORTS', isEnabled: true }]),
    ).toBe(false);
  });
});
