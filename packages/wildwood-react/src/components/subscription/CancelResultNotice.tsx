'use client';

// What a cancellation did, said once and dismissible.
//
// Scheduled or immediate, and - when the subscription is billed by a store - the part this
// platform cannot do for the customer: Apple and Google keep charging until the subscription is
// cancelled in their own settings, so the instructions and the link travel with the notice.
//
// Only a successful cancel renders here. A failed one belongs in the surrounding error alert, not
// in a notice that reads like confirmation.

import type { AppTierCancelResultModel } from '@wildwood/core';

export interface CancelResultNoticeProps {
  result: AppTierCancelResultModel | null;
  onDismiss: () => void;
}

export function CancelResultNotice({ result, onDismiss }: CancelResultNoticeProps) {
  if (!result?.success) return null;

  return (
    <div className="ww-alert ww-alert-info ww-sub-cancel-notice">
      <span>
        {result.isScheduled
          ? `Your cancellation is scheduled — access continues until ${
              result.effectiveDate
                ? new Date(result.effectiveDate).toLocaleDateString()
                : 'the end of the billing period'
            }.`
          : 'Your subscription has been cancelled.'}
        {result.requiresUserAction && (
          <>
            {' '}
            {result.userActionInstructions ?? 'Also cancel the subscription in your store settings.'}
            {result.userActionUrl && (
              <>
                {' '}
                <a href={result.userActionUrl} target="_blank" rel="noopener noreferrer">
                  Open subscription settings
                </a>
              </>
            )}
          </>
        )}
      </span>
      <button type="button" className="ww-alert-dismiss" onClick={onDismiss}>
        &times;
      </button>
    </div>
  );
}
