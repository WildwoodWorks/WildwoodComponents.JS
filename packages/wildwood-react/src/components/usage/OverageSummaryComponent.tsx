import { useMemo } from 'react';
import { useUsageDashboard } from '../../hooks/useUsageDashboard.js';

export interface OverageSummaryComponentProps {
  /** Cost per unit of overage (default 0.003) */
  overageRate?: number;
  onViewDetails?: () => void;
  className?: string;
}

interface OverageItem {
  limitCode: string;
  displayName: string;
  overageCount: number;
  cost: number;
  unit: string;
}

export function OverageSummaryComponent({
  overageRate = 0.003,
  onViewDetails,
  className,
}: OverageSummaryComponentProps) {
  const { limitStatuses, loading } = useUsageDashboard();

  const overageItems: OverageItem[] = useMemo(() => {
    return limitStatuses
      .filter((s) => s.isExceeded && !s.isHardBlocked && !s.isUnlimited)
      .map((s) => {
        const overageCount = s.currentUsage - s.maxValue;
        return {
          limitCode: s.limitCode,
          displayName: s.displayName,
          overageCount,
          cost: overageCount * overageRate,
          unit: s.unit,
        };
      });
  }, [limitStatuses, overageRate]);

  const totalCost = useMemo(() => overageItems.reduce((sum, item) => sum + item.cost, 0), [overageItems]);

  // Don't render if no overages or still loading with no data
  if (overageItems.length === 0) {
    return null;
  }

  return (
    <div className={`ww-overage-summary ${className ?? ''}`}>
      <div className="ww-overage-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <h4 className="ww-overage-title">Overage Charges</h4>
      </div>

      <div className="ww-overage-items">
        {overageItems.map((item) => (
          <div key={item.limitCode} className="ww-overage-item">
            <div className="ww-overage-item-info">
              <span className="ww-overage-item-name">{item.displayName}</span>
              <span className="ww-overage-item-count">
                {item.overageCount.toLocaleString()} over limit
                {item.unit ? ` (${item.unit})` : ''}
              </span>
            </div>
            <div className="ww-overage-item-cost">${item.cost.toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="ww-overage-total">
        <span className="ww-overage-total-label">Estimated Total</span>
        <span className="ww-overage-total-amount">${totalCost.toFixed(2)}</span>
      </div>

      <p className="ww-overage-rate-note ww-text-muted ww-text-sm">Rate: ${overageRate.toFixed(4)} per unit</p>

      {onViewDetails && (
        <button type="button" className="ww-btn ww-btn-link ww-btn-sm" onClick={onViewDetails}>
          View Details
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
