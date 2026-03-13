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
      <div className="ww-usage-limits-grid">
        {limitStatuses.map((limit) => {
          const badge = getStatusBadge(limit);
          const barWidth = limit.isUnlimited ? 100 : Math.min(limit.usagePercent, 100);
          const statusKey =
            limit.isHardBlocked || limit.isExceeded ? 'danger' : limit.isAtWarningThreshold ? 'warning' : 'success';

          return (
            <div key={limit.limitCode} className={`ww-usage-card ww-usage-card-${statusKey}`}>
              <div className="ww-usage-card-header">
                <div className="ww-usage-card-title">
                  <span className={`ww-usage-card-icon ww-usage-card-icon-${statusKey}`} />
                  <span className="ww-usage-card-name">{limit.displayName}</span>
                </div>
                <span className={`ww-badge ${badge.cls}`}>{badge.text}</span>
              </div>

              {limit.unit && <span className="ww-usage-card-unit">{limit.unit}</span>}

              <div className="ww-usage-card-bar-wrapper">
                <div className="ww-usage-card-bar">
                  <div className={`ww-usage-card-bar-fill ww-bar-${statusKey}`} style={{ width: `${barWidth}%` }} />
                </div>
              </div>

              <div className="ww-usage-card-stats">
                {limit.isUnlimited ? (
                  <span className="ww-usage-card-count">{limit.currentUsage.toLocaleString()} used</span>
                ) : (
                  <>
                    <span className="ww-usage-card-count">
                      {limit.currentUsage.toLocaleString()} / {limit.maxValue.toLocaleString()}
                    </span>
                    <span className="ww-usage-card-percent">{Math.round(limit.usagePercent)}%</span>
                  </>
                )}
              </div>

              {limit.statusMessage && <div className="ww-usage-card-message">{limit.statusMessage}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
