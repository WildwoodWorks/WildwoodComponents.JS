// UsageLimitsPanel - ported from WildwoodComponents.Blazor Subscription/Admin/UsageLimitsPanel.razor

import type { AppTierLimitStatusModel } from '@wildwood/core';

export interface UsageLimitsPanelProps {
  limitStatuses: AppTierLimitStatusModel[];
  loading?: boolean;
  className?: string;
}

function getBarClass(limit: AppTierLimitStatusModel): string {
  if (limit.isUnlimited) return 'ww-bar-success';
  if (limit.isHardBlocked) return 'ww-bar-danger';
  if (limit.isExceeded) return 'ww-bar-danger';
  if (limit.isAtWarningThreshold) return 'ww-bar-warning';
  return 'ww-bar-success';
}

function getStatusBadge(limit: AppTierLimitStatusModel): { text: string; cls: string } {
  if (limit.isUnlimited) return { text: 'Unlimited', cls: 'ww-badge-success' };
  if (limit.isHardBlocked) return { text: 'Blocked', cls: 'ww-badge-danger' };
  if (limit.isExceeded) return { text: 'Exceeded', cls: 'ww-badge-danger' };
  if (limit.isAtWarningThreshold) return { text: 'Warning', cls: 'ww-badge-warning' };
  return { text: 'OK', cls: 'ww-badge-success' };
}

export function UsageLimitsPanel({ limitStatuses, loading, className }: UsageLimitsPanelProps) {
  if (loading) {
    return (
      <div className={`ww-usage-limits-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!limitStatuses.length) {
    return (
      <div className={`ww-usage-limits-panel ${className ?? ''}`}>
        <div className="ww-alert ww-alert-info">No usage limits configured.</div>
      </div>
    );
  }

  return (
    <div className={`ww-usage-limits-panel ${className ?? ''}`}>
      {limitStatuses.map((limit) => {
        const badge = getStatusBadge(limit);
        const barWidth = limit.isUnlimited ? 100 : Math.min(limit.usagePercent, 100);

        return (
          <div key={limit.limitCode} className="ww-usage-limit-item">
            <div className="ww-usage-limit-header">
              <span className="ww-usage-limit-name">
                {limit.displayName}
                {limit.unit && <span className="ww-text-muted ww-text-sm"> ({limit.unit})</span>}
              </span>
              <span className={`ww-badge ${badge.cls}`}>{badge.text}</span>
            </div>

            <div className="ww-usage-limit-bar">
              <div className={`ww-usage-limit-bar-fill ${getBarClass(limit)}`} style={{ width: `${barWidth}%` }} />
            </div>

            <div className="ww-usage-limit-details ww-text-sm ww-text-muted">
              {limit.isUnlimited ? (
                <span>{limit.currentUsage.toLocaleString()} used</span>
              ) : (
                <>
                  <span>
                    {limit.currentUsage.toLocaleString()} / {limit.maxValue.toLocaleString()}
                  </span>
                  <span>{Math.round(limit.usagePercent)}%</span>
                </>
              )}
            </div>

            {limit.statusMessage && (
              <div className="ww-usage-limit-message ww-text-sm ww-text-muted">{limit.statusMessage}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
