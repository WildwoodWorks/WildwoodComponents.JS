'use client';

// What became of each pack. One line per pack, including the ones that failed.
//
// A basket is not a transaction: one pack can fail while the rest run, so this never collapses the
// list into a single "done" — the customer is told, per pack, what they ended up with.

import type { SignupPackOutcome, SignupPackStatus } from '@wildwood/react-shared';
import type { RegistrationSubscriptionLabels } from '../labels.js';

export interface PackOutcomeListProps {
  packs: SignupPackOutcome[];
  labels: RegistrationSubscriptionLabels;
}

function statusLabel(status: SignupPackStatus, labels: RegistrationSubscriptionLabels): string {
  switch (status) {
    case 'trialing':
      return labels.packStatusTrialing;
    case 'active':
      return labels.packStatusActive;
    case 'granted':
      return labels.packStatusGranted;
    default:
      return labels.packStatusFailed;
  }
}

/** A trial end date in the visitor's own locale, or nothing when the server sent no usable date. */
function trialEndText(trialEnd: string | undefined): string {
  if (!trialEnd) return '';
  const date = new Date(trialEnd);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export function PackOutcomeList({ packs, labels }: PackOutcomeListProps) {
  if (packs.length === 0) return null;

  return (
    <ul className="ww-pack-outcome-list">
      {packs.map((pack) => {
        const trialEnd = trialEndText(pack.trialEnd);
        return (
          <li
            className={`ww-pack-outcome ww-pack-outcome--${pack.status}`}
            key={pack.addOnId}
            data-ww-pack={pack.addOnId}
          >
            <span className="ww-pack-outcome-name">{pack.name}</span>
            <span className="ww-pack-outcome-status">{statusLabel(pack.status, labels)}</span>
            {trialEnd ? <span className="ww-pack-outcome-trial">{trialEnd}</span> : null}
            {pack.errorMessage ? <span className="ww-pack-outcome-error">{pack.errorMessage}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
