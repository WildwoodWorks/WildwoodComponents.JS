import { useState, useEffect, useCallback } from 'react';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { useAppTier } from '../../hooks/useAppTier.js';
import { PaymentComponent } from '../payment/PaymentComponent.js';

export interface AppTierComponentProps {
  title?: string;
  subtitle?: string;
  showAddOns?: boolean;
  showBillingToggle?: boolean;
  showCurrentPlan?: boolean;
  showFeatureComparison?: boolean;
  currency?: string;
  annualDiscount?: number;
  customerId?: string;
  onTierChanged?: (tierId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  autoLoad?: boolean;
  className?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
  INR: '\u20B9',
};

function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
}

type Step = 'tiers' | 'confirm' | 'payment' | 'success' | 'cancel-confirm';

export function AppTierComponent({
  title,
  subtitle,
  showAddOns = false,
  showBillingToggle = true,
  showCurrentPlan = true,
  showFeatureComparison = true,
  currency = 'USD',
  annualDiscount,
  customerId,
  onTierChanged,
  onError,
  onCancel,
  autoLoad = true,
  className,
}: AppTierComponentProps) {
  const { tiers, userSubscription, loading, error, getTiers, getUserSubscription, changeTier } = useAppTier();

  const [step, setStep] = useState<Step>('tiers');
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [selectedTier, setSelectedTier] = useState<AppTierModel | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<AppTierPricingModel | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (autoLoad) {
      getTiers();
      getUserSubscription();
    }
  }, [autoLoad, getTiers, getUserSubscription]);

  useEffect(() => {
    if (changeError) onError?.(changeError);
  }, [changeError, onError]);

  const getPricing = useCallback(
    (tier: AppTierModel): AppTierPricingModel | undefined => {
      if (!tier.pricingOptions || tier.pricingOptions.length === 0) return undefined;
      if (billingAnnual) {
        const annual = tier.pricingOptions.find(
          (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
        );
        if (annual) return annual;
      }
      return tier.pricingOptions.find((p) => p.isDefault) ?? tier.pricingOptions[0];
    },
    [billingAnnual],
  );

  const getAnnualDiscount = useCallback(
    (tier: AppTierModel): number | null => {
      if (annualDiscount) return annualDiscount;
      if (!tier.pricingOptions || tier.pricingOptions.length < 2) return null;
      const monthly = tier.pricingOptions.find((p) => p.billingFrequency?.toLowerCase() === 'monthly');
      const annual = tier.pricingOptions.find(
        (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
      );
      if (!monthly || !annual) return null;
      const monthlyTotal = monthly.price * 12;
      if (annual.price < monthlyTotal) {
        return Math.round(((monthlyTotal - annual.price) / monthlyTotal) * 100);
      }
      return null;
    },
    [annualDiscount],
  );

  const handleSelectTier = useCallback(
    (tier: AppTierModel) => {
      const pricing = getPricing(tier);
      setSelectedTier(tier);
      setSelectedPricing(pricing ?? null);
      setChangeError(null);

      if (tier.isFreeTier) {
        handleConfirmChange(tier, pricing);
      } else {
        setStep('confirm');
      }
    },
    [getPricing],
  );

  const handleConfirmChange = useCallback(
    async (tier?: AppTierModel, pricing?: AppTierPricingModel | null) => {
      const t = tier ?? selectedTier;
      const p = pricing !== undefined ? pricing : selectedPricing;
      if (!t) return;

      setChangeError(null);
      setChangeLoading(true);
      try {
        const result = await changeTier(t.id, p?.pricingModelId);
        if (result.success) {
          if (result.isScheduled) {
            setSuccessMessage(
              `Tier change to ${t.name} is scheduled for ${result.effectiveDate ? new Date(result.effectiveDate).toLocaleDateString() : 'your next billing cycle'}.`,
            );
          } else {
            setSuccessMessage(`Successfully switched to ${t.name}!`);
          }
          setStep('success');
          onTierChanged?.(t.id);
        } else if (!result.success && !result.errorMessage) {
          // No explicit error but failed — likely requires payment
          setStep('payment');
        } else {
          setChangeError(result.errorMessage ?? 'Tier change failed');
        }
      } catch (err) {
        setChangeError(err instanceof Error ? err.message : 'Tier change failed');
      } finally {
        setChangeLoading(false);
      }
    },
    [selectedTier, selectedPricing, changeTier, onTierChanged],
  );

  const handlePaymentSuccess = useCallback(async () => {
    if (!selectedTier) return;
    // After payment, retry the tier change
    await handleConfirmChange();
  }, [selectedTier, handleConfirmChange]);

  const handleCancelSubscription = useCallback(async () => {
    if (!userSubscription) return;
    setChangeError(null);
    setChangeLoading(true);
    try {
      // Find the free tier and switch to it
      const freeTier = tiers.find((t) => t.isFreeTier);
      if (freeTier) {
        const result = await changeTier(freeTier.id);
        if (result.success) {
          setSuccessMessage(
            'Your plan has been cancelled. You will retain access until the end of your billing period.',
          );
          setStep('success');
          onTierChanged?.(freeTier.id);
        } else {
          setChangeError(result.errorMessage ?? 'Cancellation failed');
        }
      } else {
        setChangeError('No free tier available for downgrade');
      }
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setChangeLoading(false);
    }
  }, [userSubscription, tiers, changeTier, onTierChanged]);

  // Success view
  if (step === 'success') {
    return (
      <div className={`ww-apptier-component ${className ?? ''}`}>
        <div className="ww-apptier-success">
          <div className="ww-apptier-success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>{successMessage}</h3>
          {userSubscription?.trialEndDate && (
            <p className="ww-text-muted">Trial ends: {new Date(userSubscription.trialEndDate).toLocaleDateString()}</p>
          )}
          <button
            type="button"
            className="ww-btn ww-btn-primary"
            onClick={() => {
              setStep('tiers');
              getUserSubscription();
            }}
          >
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  // Cancel confirmation view
  if (step === 'cancel-confirm') {
    return (
      <div className={`ww-apptier-component ${className ?? ''}`}>
        <div className="ww-apptier-cancel-confirm">
          <h3>Cancel Plan</h3>
          <p>
            Are you sure you want to cancel your <strong>{userSubscription?.tierName}</strong> plan?
          </p>
          {userSubscription?.currentPeriodEnd && (
            <p className="ww-text-muted">
              You will retain access until {new Date(userSubscription.currentPeriodEnd).toLocaleDateString()}.
            </p>
          )}
          {changeError && <div className="ww-alert ww-alert-danger">{changeError}</div>}
          <div className="ww-apptier-cancel-actions">
            <button
              type="button"
              className="ww-btn ww-btn-danger"
              onClick={handleCancelSubscription}
              disabled={changeLoading}
            >
              {changeLoading ? 'Cancelling...' : 'Yes, Cancel Plan'}
            </button>
            <button
              type="button"
              className="ww-btn ww-btn-outline"
              onClick={() => setStep('tiers')}
              disabled={changeLoading}
            >
              Keep Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Payment step
  if (step === 'payment' && selectedTier) {
    const pricing = selectedPricing;
    return (
      <div className={`ww-apptier-component ${className ?? ''}`}>
        <div className="ww-apptier-payment-step">
          <div className="ww-apptier-payment-layout">
            {/* Order Summary */}
            <div className="ww-apptier-order-summary">
              <h4>Order Summary</h4>
              <div className="ww-order-summary-card">
                <div className="ww-order-summary-plan">
                  <span className="ww-order-summary-name">{selectedTier.name}</span>
                  {pricing && (
                    <span className="ww-order-summary-price">
                      {formatPrice(pricing.price, currency)}/{pricing.billingFrequency?.toLowerCase() ?? 'month'}
                    </span>
                  )}
                </div>
                {selectedTier.description && <p className="ww-text-muted ww-text-sm">{selectedTier.description}</p>}
                {userSubscription && !userSubscription.isFreeTier && (
                  <div className="ww-order-summary-upgrade-alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Upgrading from {userSubscription.tierName}
                  </div>
                )}
                {selectedTier.features && selectedTier.features.length > 0 && (
                  <div className="ww-order-summary-features">
                    <h5>What&apos;s included</h5>
                    <ul>
                      {selectedTier.features
                        .filter((f) => f.isEnabled)
                        .map((f) => (
                          <li key={f.id}>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {f.displayName}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Form */}
            <div className="ww-apptier-payment-form">
              <h4>Payment Details</h4>
              <PaymentComponent
                amount={pricing?.price ?? 0}
                customerId={customerId}
                onPaymentSuccess={handlePaymentSuccess}
              />
            </div>
          </div>

          <div className="ww-apptier-payment-back">
            <button type="button" className="ww-btn ww-btn-link" onClick={() => setStep('confirm')}>
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirm view
  if (step === 'confirm' && selectedTier) {
    const pricing = selectedPricing;
    const discount = billingAnnual ? getAnnualDiscount(selectedTier) : null;
    return (
      <div className={`ww-apptier-component ${className ?? ''}`}>
        <div className="ww-apptier-confirm">
          <h3>Confirm Plan Change</h3>
          <div className="ww-apptier-confirm-card">
            <div className="ww-apptier-confirm-name">{selectedTier.name}</div>
            {selectedTier.description && <p className="ww-text-muted">{selectedTier.description}</p>}
            {pricing && (
              <div className="ww-apptier-confirm-price">
                {formatPrice(pricing.price, currency)}
                <span className="ww-text-muted">/{pricing.billingFrequency?.toLowerCase() ?? 'month'}</span>
              </div>
            )}
            {discount && (
              <div className="ww-apptier-confirm-discount">
                <span className="ww-badge ww-badge-success">Save {discount}% with annual billing</span>
              </div>
            )}
            {selectedTier.features && selectedTier.features.length > 0 && (
              <ul className="ww-tier-features">
                {selectedTier.features.map((f) => (
                  <li key={f.id} className={`ww-tier-feature-item ${f.isEnabled ? '' : 'ww-tier-feature-disabled'}`}>
                    {f.isEnabled ? (
                      <svg
                        className="ww-tier-feature-check"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        className="ww-tier-feature-x"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                    {f.displayName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {changeError && <div className="ww-alert ww-alert-danger">{changeError}</div>}
          <div className="ww-apptier-confirm-actions">
            <button
              type="button"
              className="ww-btn ww-btn-primary"
              onClick={() => handleConfirmChange()}
              disabled={changeLoading}
            >
              {changeLoading ? 'Processing...' : 'Confirm Change'}
            </button>
            <button
              type="button"
              className="ww-btn ww-btn-outline"
              onClick={() => setStep('tiers')}
              disabled={changeLoading}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main tier selection view
  return (
    <div className={`ww-apptier-component ${className ?? ''}`}>
      {(title || subtitle) && (
        <div className="ww-apptier-header-section">
          {title && <h2 className="ww-apptier-title">{title}</h2>}
          {subtitle && <p className="ww-apptier-subtitle">{subtitle}</p>}
        </div>
      )}

      {error && <div className="ww-alert ww-alert-danger">{error}</div>}
      {changeError && <div className="ww-alert ww-alert-danger">{changeError}</div>}

      {/* Current Subscription */}
      {showCurrentPlan && userSubscription && (
        <div className="ww-apptier-current">
          <div className="ww-apptier-current-info">
            <h4>Current Plan</h4>
            <div className="ww-apptier-current-name">
              <strong>{userSubscription.tierName}</strong>
              <span className={`ww-badge ${userSubscription.isFreeTier ? 'ww-badge-secondary' : 'ww-badge-primary'}`}>
                {userSubscription.status}
              </span>
            </div>
            {userSubscription.tierDescription && (
              <p className="ww-text-muted ww-text-sm">{userSubscription.tierDescription}</p>
            )}
            {userSubscription.currentPeriodEnd && (
              <p className="ww-text-muted ww-text-sm">
                Renews: {new Date(userSubscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {userSubscription.trialEndDate && (
              <p className="ww-text-sm">
                <span className="ww-badge ww-badge-info">
                  Trial ends: {new Date(userSubscription.trialEndDate).toLocaleDateString()}
                </span>
              </p>
            )}
            {userSubscription.pendingTierName && (
              <p className="ww-text-sm ww-text-warning">
                Pending change to <strong>{userSubscription.pendingTierName}</strong>
                {userSubscription.pendingChangeDate &&
                  ` on ${new Date(userSubscription.pendingChangeDate).toLocaleDateString()}`}
              </p>
            )}
          </div>
          {!userSubscription.isFreeTier && (
            <button
              type="button"
              className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
              onClick={() => setStep('cancel-confirm')}
            >
              Cancel Plan
            </button>
          )}
        </div>
      )}

      {/* Billing Toggle */}
      {showBillingToggle &&
        tiers.some((t) =>
          t.pricingOptions?.some(
            (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
          ),
        ) && (
          <div className="ww-apptier-billing-toggle">
            <span className={!billingAnnual ? 'ww-billing-active' : ''}>Monthly</span>
            <button
              type="button"
              className={`ww-toggle ${billingAnnual ? 'ww-toggle-on' : ''}`}
              onClick={() => setBillingAnnual(!billingAnnual)}
              aria-label="Toggle annual billing"
            >
              <span className="ww-toggle-slider" />
            </button>
            <span className={billingAnnual ? 'ww-billing-active' : ''}>
              Annual
              {(() => {
                const maxDiscount = tiers.reduce((max, t) => {
                  const d = getAnnualDiscount(t);
                  return d && d > max ? d : max;
                }, 0);
                return maxDiscount > 0 ? (
                  <span className="ww-badge ww-badge-success ww-badge-sm">Save up to {maxDiscount}%</span>
                ) : null;
              })()}
            </span>
          </div>
        )}

      {/* Tiers Grid */}
      {loading ? (
        <div className="ww-apptier-loading">
          <div className="ww-spinner" />
          <span>Loading plans...</span>
        </div>
      ) : (
        <div className="ww-tier-grid">
          {tiers.map((tier) => {
            const isCurrent = userSubscription?.appTierId === tier.id;
            const pricing = getPricing(tier);
            const discount = billingAnnual ? getAnnualDiscount(tier) : null;

            return (
              <div
                key={tier.id}
                className={`ww-tier-card ${isCurrent ? 'ww-tier-current' : ''} ${tier.isDefault ? 'ww-tier-default' : ''}`}
              >
                {tier.isDefault && !isCurrent && <div className="ww-tier-default-badge">Popular</div>}
                <div className="ww-tier-header">
                  {tier.iconClass && <span className={`ww-tier-icon ${tier.iconClass}`} />}
                  <h3>{tier.name}</h3>
                  {tier.badgeColor && <span className={`ww-badge ww-badge-${tier.badgeColor}`}>{tier.status}</span>}
                  <div className="ww-tier-price">
                    {tier.isFreeTier && !pricing ? (
                      <span className="ww-tier-price-amount">Free</span>
                    ) : pricing ? (
                      <>
                        <span className="ww-tier-price-amount">{formatPrice(pricing.price, currency)}</span>
                        <span className="ww-tier-price-interval">
                          /{pricing.billingFrequency?.toLowerCase() ?? 'month'}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {discount && <div className="ww-tier-discount">Save {discount}%</div>}
                </div>

                {tier.description && <p className="ww-tier-description">{tier.description}</p>}

                {/* Features */}
                {showFeatureComparison && tier.features && tier.features.length > 0 && (
                  <ul className="ww-tier-features">
                    {tier.features.map((f) => (
                      <li
                        key={f.id}
                        className={`ww-tier-feature-item ${f.isEnabled ? '' : 'ww-tier-feature-disabled'}`}
                      >
                        {f.isEnabled ? (
                          <svg
                            className="ww-tier-feature-check"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            className="ww-tier-feature-x"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                        <span>{f.displayName}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Limits */}
                {tier.limits && tier.limits.length > 0 && (
                  <div className="ww-tier-limits">
                    {tier.limits.map((l) => (
                      <div key={l.id} className="ww-tier-limit-item">
                        <span className="ww-tier-limit-value">
                          {l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}
                        </span>
                        <span className="ww-tier-limit-name">
                          {l.displayName}
                          {l.unit ? ` (${l.unit})` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add-Ons placeholder: showAddOns prop reserved for future use when AppTierModel supports addOns */}

                <div className="ww-tier-footer">
                  {isCurrent ? (
                    <span className="ww-badge ww-badge-success">Current Plan</span>
                  ) : (
                    <button
                      type="button"
                      className={`ww-btn ${tier.isDefault ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
                      onClick={() => handleSelectTier(tier)}
                      disabled={changeLoading}
                    >
                      {tier.isFreeTier
                        ? 'Get Started Free'
                        : userSubscription
                          ? `Switch to ${tier.name}`
                          : 'Select Plan'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onCancel && (
        <div className="ww-apptier-footer">
          <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
