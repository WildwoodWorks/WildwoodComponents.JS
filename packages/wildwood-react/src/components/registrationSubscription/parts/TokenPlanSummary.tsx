'use client';

// What a registration token sets up, in the words the server used.
//
// Everything here comes from the token's detailed validation — the tier, the pricing option, the
// packs and the extra features, with the display names the server sent. Nothing is priced: the
// visitor is not paying for any of it, and a price beside a granted plan would say they were.

import type { RegistrationTokenAppGrant } from '@wildwood/core';
import type { RegistrationSubscriptionLabels } from '../labels.js';

export interface TokenPlanSummaryProps {
  /** The grant for THIS app, as `getRegistrationTokenDetails` reported it. */
  grant: RegistrationTokenAppGrant;
  labels: RegistrationSubscriptionLabels;
}

/** One entry per granted id, named the way the server named it — or by its id when it did not. */
function named(ids: string[] | undefined, names: string[] | undefined): { id: string; name: string }[] {
  return (ids ?? []).map((id, index) => ({ id, name: names?.[index] ?? id }));
}

export function TokenPlanSummary({ grant, labels }: TokenPlanSummaryProps) {
  const packs = named(grant.addOnIds, grant.addOnNames);
  const features = named(grant.featureCodes, grant.featureNames);

  return (
    <div className="ww-token-plan-summary">
      <div className="ww-token-plan-summary-content">
        <h4 className="ww-token-plan-summary-title">{labels.tokenPlanIncludes}</h4>

        <p className="ww-token-plan-tier">
          <strong>{grant.appTierName ?? grant.appTierId}</strong>
          {grant.pricingName ? <span className="ww-token-plan-pricing"> ({grant.pricingName})</span> : null}
        </p>

        {packs.length > 0 ? (
          <div className="ww-token-plan-group">
            <span className="ww-token-plan-group-title">{labels.tokenPlanPacks}</span>
            <ul className="ww-token-plan-list">
              {packs.map((entry) => (
                <li key={entry.id}>{entry.name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {features.length > 0 ? (
          <div className="ww-token-plan-group">
            <span className="ww-token-plan-group-title">{labels.tokenPlanFeatures}</span>
            <ul className="ww-token-plan-list">
              {features.map((entry) => (
                <li key={entry.id}>{entry.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
