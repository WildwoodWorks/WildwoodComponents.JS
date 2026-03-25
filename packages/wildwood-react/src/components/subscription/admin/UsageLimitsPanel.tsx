// UsageLimitsPanel - ported from WildwoodComponents.Blazor Subscription/Admin/UsageLimitsPanel.razor

import { useState, useCallback } from 'react';
import type { AppTierLimitStatusModel } from '@wildwood/core';

export interface UsageLimitsPanelProps {
  limitStatuses: AppTierLimitStatusModel[];
  isAdmin?: boolean;
  loading?: boolean;
  className?: string;
  onUpdateLimit?: (limitCode: string, newMaxValue: number) => Promise<void>;
  onResetUsage?: (limitCode: string) => Promise<void>;
}

function getStatusBadge(limit: AppTierLimitStatusModel): { text: string; cls: string } {
  if (limit.isUnlimited) return { text: 'Unlimited', cls: 'ww-badge-success' };
  if (limit.isHardBlocked) return { text: 'Blocked', cls: 'ww-badge-danger' };
  if (limit.isExceeded) return { text: 'Exceeded', cls: 'ww-badge-danger' };
  if (limit.isAtWarningThreshold) return { text: 'Warning', cls: 'ww-badge-warning' };
  return { text: 'OK', cls: 'ww-badge-success' };
}

export function UsageLimitsPanel({
  limitStatuses,
  isAdmin = false,
  loading,
  className,
  onUpdateLimit,
  onResetUsage,
}: UsageLimitsPanelProps) {
  const [editingLimitCode, setEditingLimitCode] = useState<string | null>(null);
  const [editMaxValue, setEditMaxValue] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const startEditLimit = useCallback((limit: AppTierLimitStatusModel) => {
    setEditingLimitCode(limit.limitCode);
    setEditMaxValue(limit.maxValue);
  }, []);

  const cancelEditLimit = useCallback(() => {
    setEditingLimitCode(null);
  }, []);

  const saveLimitMaxValue = useCallback(
    async (limitCode: string) => {
      if (!onUpdateLimit || isProcessing) return;
      setIsProcessing(true);
      try {
        await onUpdateLimit(limitCode, editMaxValue);
        setEditingLimitCode(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [onUpdateLimit, isProcessing, editMaxValue],
  );

  const handleResetUsage = useCallback(
    async (limitCode: string) => {
      if (!onResetUsage || isProcessing) return;
      setIsProcessing(true);
      try {
        await onResetUsage(limitCode);
      } finally {
        setIsProcessing(false);
      }
    },
    [onResetUsage, isProcessing],
  );

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
          const isEditing = editingLimitCode === limit.limitCode;

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
                ) : isAdmin && isEditing ? (
                  <div className="ww-usage-edit-row">
                    <span className="ww-usage-card-count">{limit.currentUsage.toLocaleString()} /</span>
                    <input
                      type="number"
                      className="ww-usage-edit-input"
                      aria-label="Max value"
                      value={editMaxValue}
                      onChange={(e) => setEditMaxValue(Number(e.target.value))}
                      min={0}
                      disabled={isProcessing}
                    />
                    <button
                      type="button"
                      className="ww-btn ww-btn-sm ww-btn-success"
                      onClick={() => saveLimitMaxValue(limit.limitCode)}
                      disabled={isProcessing}
                      title="Save"
                    >
                      &#x2713;
                    </button>
                    <button
                      type="button"
                      className="ww-btn ww-btn-sm ww-btn-secondary"
                      onClick={cancelEditLimit}
                      disabled={isProcessing}
                      title="Cancel"
                    >
                      &#x2717;
                    </button>
                  </div>
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

              {isAdmin && !isEditing && (
                <div className="ww-usage-card-actions">
                  {!limit.isUnlimited && onUpdateLimit && (
                    <button
                      type="button"
                      className="ww-btn ww-btn-sm ww-btn-outline-primary"
                      onClick={() => startEditLimit(limit)}
                      disabled={isProcessing}
                      title="Edit max value"
                    >
                      Edit Limit
                    </button>
                  )}
                  {limit.currentUsage > 0 && onResetUsage && (
                    <button
                      type="button"
                      className="ww-btn ww-btn-sm ww-btn-outline-warning"
                      onClick={() => handleResetUsage(limit.limitCode)}
                      disabled={isProcessing}
                      title="Reset current usage to zero"
                    >
                      Reset Usage
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
