import type { AppTierLimitStatusModel, UserTierSubscriptionModel } from '@wildwood/core';
import { useUsageDashboard } from '../../hooks/useUsageDashboard.js';
import type { UseUsageDashboardOptions } from '../../hooks/useUsageDashboard.js';

export interface UsageDashboardComponentProps {
  title?: string;
  subtitle?: string;
  showOverageInfo?: boolean;
  /** Percentage threshold at which to show warning state (default 80) */
  warningThreshold?: number;
  onUpgradeClick?: () => void;
  className?: string;
  /**
   * Override limit statuses instead of fetching from the Wildwood API.
   * When provided, the internal useUsageDashboard() hook is still called
   * but its limitStatuses are replaced with this value.
   */
  limitStatuses?: AppTierLimitStatusModel[];
  /**
   * Override subscription instead of fetching from the Wildwood API.
   * When provided, replaces the internal hook's subscription data.
   */
  subscription?: UserTierSubscriptionModel | null;
  /**
   * Options passed to the internal useUsageDashboard() hook.
   * Use this to configure refreshInterval or onMergeUsage callback.
   */
  usageDashboardOptions?: UseUsageDashboardOptions;
}

function getBarClass(percent: number, isExceeded: boolean, warningThreshold: number): string {
  if (isExceeded) return 'ww-usage-bar-exceeded';
  if (percent >= warningThreshold) return 'ww-usage-bar-warning';
  return 'ww-usage-bar-ok';
}

export function UsageDashboardComponent({
  title,
  subtitle,
  showOverageInfo = true,
  warningThreshold = 80,
  onUpgradeClick,
  className,
  limitStatuses: limitStatusesOverride,
  subscription: subscriptionOverride,
  usageDashboardOptions,
}: UsageDashboardComponentProps) {
  const hook = useUsageDashboard(usageDashboardOptions);

  const limitStatuses = limitStatusesOverride ?? hook.limitStatuses;
  const subscription = subscriptionOverride !== undefined ? subscriptionOverride : hook.subscription;
  const { loading, error, refresh } = hook;

  const anyAtWarning = limitStatuses.some((s) => s.usagePercent >= warningThreshold || s.isExceeded);
  const anyOverage = limitStatuses.some((s) => s.isExceeded && !s.isHardBlocked);

  if (loading && limitStatuses.length === 0) {
    return (
      <div className={`ww-usage-dashboard ${className ?? ''}`}>
        <div className="ww-usage-loading">
          <div className="ww-spinner" />
          <span>Loading usage data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`ww-usage-dashboard ${className ?? ''}`}>
        <div className="ww-alert ww-alert-danger">
          <p>{error}</p>
          <button type="button" className="ww-btn ww-btn-sm ww-btn-outline" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ww-usage-dashboard ${className ?? ''}`}>
      {/* Header */}
      {(title || subtitle || subscription) && (
        <div className="ww-usage-header">
          <div className="ww-usage-header-text">
            {title && <h2 className="ww-usage-title">{title}</h2>}
            {subtitle && <p className="ww-usage-subtitle">{subtitle}</p>}
          </div>
          {subscription && (
            <div className="ww-usage-tier-badge">
              <span className={`ww-badge ${subscription.isFreeTier ? 'ww-badge-secondary' : 'ww-badge-primary'}`}>
                {subscription.tierName}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Limit Progress Bars */}
      {limitStatuses.length === 0 ? (
        <div className="ww-usage-empty">
          <p className="ww-text-muted">No usage limits configured for your current plan.</p>
        </div>
      ) : (
        <div className="ww-usage-limits">
          {limitStatuses.map((status) => {
            const percent = status.isUnlimited ? 0 : Math.min(status.usagePercent, 100);
            const displayPercent = status.isUnlimited ? null : status.usagePercent;
            const barClass = getBarClass(status.usagePercent, status.isExceeded, warningThreshold);

            return (
              <div key={status.limitCode} className="ww-usage-limit-item">
                <div className="ww-usage-limit-header">
                  <span className="ww-usage-limit-label">
                    {status.displayName}
                    {status.unit ? ` (${status.unit})` : ''}
                  </span>
                  <span className="ww-usage-limit-value">
                    {status.currentUsage.toLocaleString()}
                    {' / '}
                    {status.isUnlimited ? 'Unlimited' : status.maxValue.toLocaleString()}
                    {displayPercent !== null && (
                      <span className="ww-usage-limit-percent"> ({Math.round(displayPercent)}%)</span>
                    )}
                  </span>
                </div>

                {!status.isUnlimited && (
                  <div className="ww-usage-bar-track">
                    <div
                      className={`ww-usage-bar-fill ${barClass}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                      role="progressbar"
                      aria-valuenow={status.currentUsage}
                      aria-valuemin={0}
                      aria-valuemax={status.maxValue}
                      aria-label={`${status.displayName}: ${Math.round(status.usagePercent)}%`}
                    />
                  </div>
                )}

                {status.isUnlimited && (
                  <div className="ww-usage-bar-track">
                    <div className="ww-usage-bar-fill ww-usage-bar-unlimited" style={{ width: '100%' }} />
                  </div>
                )}

                {/* Overage indicator for soft caps */}
                {showOverageInfo && status.isExceeded && !status.isHardBlocked && (
                  <div className="ww-usage-overage-indicator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Overage: {(status.currentUsage - status.maxValue).toLocaleString()} over limit</span>
                  </div>
                )}

                {/* Hard block indicator */}
                {status.isExceeded && status.isHardBlocked && (
                  <div className="ww-usage-blocked-indicator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    <span>Limit reached</span>
                  </div>
                )}

                {status.statusMessage && (
                  <p className="ww-usage-limit-message ww-text-muted ww-text-sm">{status.statusMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upgrade CTA */}
      {anyAtWarning && onUpgradeClick && (
        <div className="ww-usage-upgrade-cta">
          <div className="ww-usage-upgrade-message">
            {anyOverage ? 'You have exceeded one or more usage limits.' : 'You are approaching your usage limits.'}
          </div>
          <button type="button" className="ww-btn ww-btn-primary" onClick={onUpgradeClick}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            Upgrade Plan
          </button>
        </div>
      )}
    </div>
  );
}
