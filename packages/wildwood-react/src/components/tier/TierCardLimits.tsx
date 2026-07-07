import type { AppTierLimitModel } from '@wildwood/core';

export interface TierCardLimitsProps {
  limits: AppTierLimitModel[];
}

export function TierCardLimits({ limits }: TierCardLimitsProps) {
  if (!limits || limits.length === 0) return null;

  return (
    <div className="ww-tier-limits">
      {limits.map((l) => (
        <div key={l.id} className="ww-tier-limit-item">
          <span className="ww-tier-limit-value">{l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}</span>
          {/* Unit is intentionally omitted: "5 Active Pursuits (pursuits)" reads as noise —
              the value + display name already carry it. Units still show in usage dashboards. */}
          <span className="ww-tier-limit-name">{l.displayName}</span>
        </div>
      ))}
    </div>
  );
}
