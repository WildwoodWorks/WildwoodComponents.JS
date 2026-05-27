'use client';

import { useState } from 'react';
import type { TierChangePreviewModel } from '@wildwood/core';

export interface TierChangeConfirmationModalProps {
  preview: TierChangePreviewModel;
  onConfirm: (options: { immediate: boolean; bypassPayment: boolean }) => void;
  onCancel: () => void;
  loading?: boolean;
}

function formatCurrency(amount: number | undefined | null, currency: string): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function TierChangeConfirmationModal({
  preview,
  onConfirm,
  onCancel,
  loading,
}: TierChangeConfirmationModalProps) {
  const [immediate, setImmediate] = useState(true);
  const [bypassPayment, setBypassPayment] = useState(false);

  const showPaymentBypass = preview.paymentBypassAllowed && preview.paymentRequired;
  const effectivePaymentRequired = preview.paymentRequired && !bypassPayment;
  const title = preview.isUpgrade ? `Upgrade to ${preview.newTierName}` : `Downgrade to ${preview.newTierName}`;

  const confirmLabel = loading
    ? 'Processing...'
    : bypassPayment
      ? 'Apply change (no charge)'
      : preview.isUpgrade && preview.proratedChargeToday
        ? `Upgrade for ${formatCurrency(preview.proratedChargeToday, preview.currency)}`
        : preview.isDowngrade
          ? 'Confirm Downgrade'
          : `Switch to ${preview.newTierName}`;

  return (
    <div className="ww-modal-overlay" onClick={onCancel}>
      <div className="ww-modal ww-tier-change-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ww-modal-header">
          <h3 className="ww-modal-title">{title}</h3>
          <button type="button" className="ww-modal-close" onClick={onCancel} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="ww-modal-body">
          {/* Plan comparison */}
          <div className="ww-tier-change-comparison">
            <div className="ww-tier-change-plan">
              <span className="ww-tier-change-plan-label">Current</span>
              <span className="ww-tier-change-plan-name">{preview.currentTierName}</span>
              {preview.currentPrice != null && (
                <span className="ww-tier-change-plan-price">
                  {formatCurrency(preview.currentPrice, preview.currency)}/
                  {preview.currentBillingFrequency?.toLowerCase() ?? 'mo'}
                </span>
              )}
            </div>
            <span className="ww-tier-change-arrow">&rarr;</span>
            <div className="ww-tier-change-plan">
              <span className="ww-tier-change-plan-label">New</span>
              <span className="ww-tier-change-plan-name">{preview.newTierName}</span>
              {preview.newPrice != null && (
                <span className="ww-tier-change-plan-price">
                  {formatCurrency(preview.newPrice, preview.currency)}/
                  {preview.newBillingFrequency?.toLowerCase() ?? 'mo'}
                </span>
              )}
            </div>
          </div>

          {/* Billing frequency savings */}
          {preview.isBillingFrequencyChange &&
            preview.monthlyEquivalentCurrent != null &&
            preview.monthlyEquivalentNew != null &&
            preview.monthlyEquivalentNew < preview.monthlyEquivalentCurrent && (
              <div className="ww-tier-change-savings">
                Save{' '}
                {Math.round(
                  ((preview.monthlyEquivalentCurrent - preview.monthlyEquivalentNew) /
                    preview.monthlyEquivalentCurrent) *
                    100,
                )}
                % &mdash; {formatCurrency(preview.monthlyEquivalentNew, preview.currency)}/mo billed{' '}
                {preview.newBillingFrequency?.toLowerCase()}
              </div>
            )}

          {/* Proration / charge details for upgrades */}
          {preview.isUpgrade && effectivePaymentRequired && preview.proratedChargeToday != null && (
            <div className="ww-tier-change-charge">
              <div className="ww-tier-change-charge-header">Today's charge</div>
              {preview.creditAmount != null && preview.creditAmount > 0 && (
                <div className="ww-tier-change-line-item">
                  <span>
                    Credit ({preview.daysRemainingInPeriod} unused days on {preview.currentTierName})
                  </span>
                  <span className="ww-tier-change-credit">
                    -{formatCurrency(preview.creditAmount, preview.currency)}
                  </span>
                </div>
              )}
              <div className="ww-tier-change-line-item">
                <span>
                  {preview.newTierName} ({preview.daysRemainingInPeriod} days)
                </span>
                <span>
                  {formatCurrency((preview.proratedChargeToday ?? 0) + (preview.creditAmount ?? 0), preview.currency)}
                </span>
              </div>
              <div className="ww-tier-change-total">
                <span>Net charge today</span>
                <span>{formatCurrency(preview.proratedChargeToday, preview.currency)}</span>
              </div>
              {preview.nextBillingDate && (
                <div className="ww-tier-change-next-billing">
                  Next billing: {new Date(preview.nextBillingDate).toLocaleDateString()} &mdash;{' '}
                  {formatCurrency(preview.nextBillingAmount, preview.currency)}/
                  {preview.newBillingFrequency?.toLowerCase() ?? 'mo'}
                </div>
              )}
            </div>
          )}

          {/* Downgrade credit */}
          {preview.isDowngrade && preview.creditAmount != null && preview.creditAmount > 0 && (
            <div className="ww-tier-change-credit-info">
              {formatCurrency(preview.creditAmount, preview.currency)} credit will be applied to your next bill.
            </div>
          )}

          {/* Feature diff */}
          {preview.featuresGained.length > 0 && (
            <div className="ww-tier-change-features">
              <div className="ww-tier-change-features-label">You'll gain:</div>
              <ul className="ww-tier-change-features-list">
                {preview.featuresGained.map((f) => (
                  <li key={f} className="ww-tier-change-feature-gained">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.featuresLost.length > 0 && (
            <div className="ww-tier-change-features">
              <div className="ww-tier-change-features-label">You'll lose access to:</div>
              <ul className="ww-tier-change-features-list">
                {preview.featuresLost.map((f) => (
                  <li key={f} className="ww-tier-change-feature-lost">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Downgrade timing choice */}
          {preview.isDowngrade && preview.allowScheduledChange && (
            <div className="ww-tier-change-timing">
              <div className="ww-tier-change-timing-label">When should this take effect?</div>
              <label className="ww-tier-change-timing-option">
                <input type="radio" name="timing" checked={!immediate} onChange={() => setImmediate(false)} />
                <div>
                  <strong>
                    End of billing period
                    {preview.nextBillingDate ? ` (${new Date(preview.nextBillingDate).toLocaleDateString()})` : ''}
                  </strong>
                  <span className="ww-tier-change-timing-desc">
                    Keep {preview.currentTierName} features until then.
                    {preview.creditAmount != null && preview.creditAmount > 0 && (
                      <> {formatCurrency(preview.creditAmount, preview.currency)} credit on your next bill.</>
                    )}
                  </span>
                </div>
              </label>
              <label className="ww-tier-change-timing-option">
                <input type="radio" name="timing" checked={immediate} onChange={() => setImmediate(true)} />
                <div>
                  <strong>Immediately</strong>
                  <span className="ww-tier-change-timing-desc">
                    Switch to {preview.newTierName} now.
                    {preview.creditAmount != null && preview.creditAmount > 0 && (
                      <> {formatCurrency(preview.creditAmount, preview.currency)} credit on your next bill.</>
                    )}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* No payment provider warning */}
          {effectivePaymentRequired && !preview.paymentProviderAvailable && !preview.paymentBypassAllowed && (
            <div className="ww-alert ww-alert-warning">
              Payment processing is not configured for this application. Contact your administrator.
            </div>
          )}

          {/* Admin bypass toggle */}
          {showPaymentBypass && (
            <label className="ww-tier-change-bypass">
              <input type="checkbox" checked={bypassPayment} onChange={(e) => setBypassPayment(e.target.checked)} />
              <span>Bypass payment (admin override)</span>
            </label>
          )}
        </div>

        <div className="ww-modal-footer">
          <button type="button" className="ww-btn ww-btn-outline" onClick={onCancel} disabled={loading}>
            Keep Current Plan
          </button>
          <button
            type="button"
            className={`ww-btn ${preview.isUpgrade ? 'ww-btn-primary' : 'ww-btn-outline'}`}
            onClick={() => onConfirm({ immediate, bypassPayment })}
            disabled={
              loading ||
              (effectivePaymentRequired && !preview.paymentProviderAvailable && !preview.paymentBypassAllowed)
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
