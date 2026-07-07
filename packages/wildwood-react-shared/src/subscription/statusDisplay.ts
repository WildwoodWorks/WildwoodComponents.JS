// Shared display constants/copy for the SubscriptionStatusPanel (web + native).
// Colors/classes stay platform-local (CSS classes on web, hex colors on native);
// the labels, cancellable-status set, and notice copy are identical by design.

import type { UserTierSubscriptionModel } from '@wildwood/core';

/** Human-readable labels for multi-word subscription statuses; fall back to the raw status. */
export const STATUS_LABEL: Record<string, string> = {
  PastDue: 'Past Due',
  PendingUpgrade: 'Upgrade Scheduled',
  PendingDowngrade: 'Downgrade Scheduled',
  PendingCancellation: 'Cancellation Scheduled',
};

// Statuses from which the user can still cancel. Excluding Trialing/PastDue locked those
// subscribers out of cancelling entirely; Pending* changes are cancelled via the plans tab.
export const CANCELLABLE_STATUSES = ['Active', 'Trialing', 'PastDue'];

/** Copy for the scheduled-cancellation notice shown while status is PendingCancellation. */
export function pendingCancellationNotice(subscription: UserTierSubscriptionModel): string {
  const until = subscription.pendingChangeDate ?? subscription.endDate;
  const access = until ? ` and access continues until ${new Date(until).toLocaleDateString()}` : '';
  return `Your plan is cancelled${access}. Choose a plan from the Plans tab to stay subscribed.`;
}
