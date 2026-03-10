import { useState, useEffect, useCallback } from 'react';
import type {
  AppPaymentConfigurationDto,
  PaymentProviderDto,
  SavedPaymentMethodDto,
  PaymentCompletionResult,
  PaymentProviderType,
} from '@wildwood/core';
import { usePayment } from '../../hooks/usePayment.js';

export interface PaymentComponentProps {
  appId?: string;
  amount: number;
  currency?: string;
  description?: string;
  customerId?: string;
  customerEmail?: string;
  orderId?: string;
  subscriptionId?: string;
  pricingModelId?: string;
  isSubscription?: boolean;
  showAmount?: boolean;
  requireBillingAddress?: boolean;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
  /** Pre-loaded providers (skip API fetch) */
  preloadedProviders?: PaymentProviderDto[];
  preselectedProviderId?: string;
  onPaymentSuccess?: (result: PaymentCompletionResult) => void;
  onPaymentFailure?: (error: string) => void;
  onCancel?: () => void;
  className?: string;
}

const PROVIDER_LABELS: Record<number, string> = {
  1: 'Stripe',
  2: 'PayPal',
  3: 'Square',
  4: 'Braintree',
  5: 'Authorize.Net',
  10: 'App Store',
  11: 'Google Play',
  20: 'Apple Pay',
  21: 'Google Pay',
  30: 'Klarna',
  31: 'Affirm',
  32: 'Afterpay',
};

function getProviderLabel(provider: PaymentProviderDto): string {
  return provider.displayName ?? provider.name ?? PROVIDER_LABELS[provider.providerType] ?? 'Payment';
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function PaymentComponent({
  appId,
  amount,
  currency = 'USD',
  description,
  customerId,
  customerEmail,
  orderId,
  subscriptionId,
  pricingModelId,
  isSubscription = false,
  showAmount = true,
  requireBillingAddress = false,
  returnUrl,
  cancelUrl,
  metadata,
  preloadedProviders,
  preselectedProviderId,
  onPaymentSuccess,
  onPaymentFailure,
  onCancel,
  className,
}: PaymentComponentProps) {
  const {
    loading,
    error,
    savedMethods,
    getAppPaymentConfiguration,
    initiatePayment,
    getSavedPaymentMethods,
    deleteSavedPaymentMethod,
    setDefaultPaymentMethod,
  } = usePayment();

  // Config & providers
  const [config, setConfig] = useState<AppPaymentConfigurationDto | null>(null);
  const [providers, setProviders] = useState<PaymentProviderDto[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProviderDto | null>(null);

  // Payment state
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentCompletionResult | null>(null);

  // Saved methods
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  // Billing address
  const [billingFirstName, setBillingFirstName] = useState('');
  const [billingLastName, setBillingLastName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [billingCountry, setBillingCountry] = useState('US');

  // Load providers
  useEffect(() => {
    if (preloadedProviders) {
      setProviders(preloadedProviders);
      const preselected = preselectedProviderId
        ? preloadedProviders.find((p) => p.id === preselectedProviderId)
        : (preloadedProviders.find((p) => p.isDefault) ?? preloadedProviders[0]);
      setSelectedProvider(preselected ?? null);
      return;
    }

    const load = async () => {
      const appConfig = await getAppPaymentConfiguration();
      if (appConfig) {
        setConfig(appConfig);
        const enabled = appConfig.providers?.filter((p) => p.isEnabled) ?? [];
        setProviders(enabled);
        const def = appConfig.defaultProviderId
          ? enabled.find((p) => p.id === appConfig.defaultProviderId)
          : (enabled.find((p) => p.isDefault) ?? enabled[0]);
        setSelectedProvider(def ?? null);
      }
      if (customerId) {
        await getSavedPaymentMethods(customerId);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = useCallback(async () => {
    setPaymentError(null);

    if (amount <= 0) {
      setPaymentError('Invalid amount');
      return;
    }

    const providerId = selectedProvider?.id ?? config?.defaultProviderId;
    if (!providerId) {
      setPaymentError('No payment provider configured');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await initiatePayment({
        providerId,
        appId: appId ?? config?.appId ?? '',
        amount,
        currency: currency ?? config?.defaultCurrency ?? 'USD',
        description,
        customerId,
        customerEmail,
        orderId,
        subscriptionId,
        pricingModelId,
        isSubscription,
        returnUrl,
        cancelUrl,
        metadata,
      });

      if (result.success) {
        if (result.redirectUrl || result.approvalUrl) {
          const url = result.redirectUrl ?? result.approvalUrl!;
          try {
            const parsed = new URL(url, window.location.origin);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
              window.location.href = parsed.href;
              return;
            }
          } catch {
            /* fall through */
          }
          setPaymentError('Invalid redirect URL');
          return;
        }

        const completionResult: PaymentCompletionResult = {
          success: true,
          transactionId: result.paymentIntentId,
          paymentIntentId: result.paymentIntentId,
          subscriptionId: result.subscriptionId,
          amountPaid: amount,
          currency,
          status: 'Completed',
          completedAt: new Date().toISOString(),
        };
        setPaymentResult(completionResult);
        setPaymentComplete(true);
        onPaymentSuccess?.(completionResult);
      } else {
        const msg = result.errorMessage ?? 'Payment failed';
        setPaymentError(msg);
        onPaymentFailure?.(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setPaymentError(msg);
      onPaymentFailure?.(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [
    amount,
    currency,
    selectedProvider,
    config,
    description,
    customerId,
    customerEmail,
    orderId,
    subscriptionId,
    pricingModelId,
    isSubscription,
    appId,
    returnUrl,
    cancelUrl,
    metadata,
    initiatePayment,
    onPaymentSuccess,
    onPaymentFailure,
  ]);

  const handleDeleteMethod = useCallback(
    async (methodId: string) => {
      await deleteSavedPaymentMethod(methodId);
      if (selectedMethodId === methodId) setSelectedMethodId(null);
      if (customerId) await getSavedPaymentMethods(customerId);
    },
    [deleteSavedPaymentMethod, selectedMethodId, getSavedPaymentMethods, customerId],
  );

  const handleSetDefault = useCallback(
    async (methodId: string) => {
      await setDefaultPaymentMethod(methodId);
      if (customerId) await getSavedPaymentMethods(customerId);
    },
    [setDefaultPaymentMethod, getSavedPaymentMethods, customerId],
  );

  const retryPayment = () => {
    setPaymentError(null);
    setPaymentComplete(false);
    setPaymentResult(null);
  };

  // Loading state
  if (loading && !paymentComplete) {
    return (
      <div className={`ww-payment ${className ?? ''}`}>
        <div className="ww-payment-loading">
          <span className="ww-spinner" />
          <p className="ww-text-muted">Loading payment options...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (paymentComplete && paymentResult) {
    return (
      <div className={`ww-payment ${className ?? ''}`}>
        <div className="ww-payment-success">
          <div className="ww-payment-success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--ww-success, #198754)">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h4>Payment Successful!</h4>
          {paymentResult.transactionId && (
            <p className="ww-payment-transaction">
              Transaction ID: <code>{paymentResult.transactionId}</code>
            </p>
          )}
          <p>
            Amount: <strong>{formatAmount(amount, currency)}</strong>
          </p>
          {paymentResult.receiptUrl && (
            <a
              href={paymentResult.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ww-btn ww-btn-outline"
            >
              View Receipt
            </a>
          )}
          {onPaymentSuccess && (
            <button type="button" className="ww-btn ww-btn-primary" onClick={() => onPaymentSuccess(paymentResult)}>
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error state (full page)
  if (paymentError && !providers.length) {
    return (
      <div className={`ww-payment ${className ?? ''}`}>
        <div className="ww-payment-error-page">
          <div className="ww-alert ww-alert-danger">{paymentError}</div>
          <button type="button" className="ww-btn ww-btn-outline" onClick={retryPayment}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ww-payment ${className ?? ''}`}>
      {/* Inline error */}
      {paymentError && (
        <div className="ww-alert ww-alert-danger ww-payment-error-inline">
          <span>{paymentError}</span>
          <button type="button" className="ww-alert-close" onClick={() => setPaymentError(null)}>
            &times;
          </button>
        </div>
      )}
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      {/* Amount display */}
      {showAmount && (
        <div className="ww-payment-amount-display">
          <span className="ww-payment-amount-value">{formatAmount(amount, currency)}</span>
          {description && <p className="ww-text-muted">{description}</p>}
          {isSubscription && <span className="ww-badge ww-badge-primary">Subscription</span>}
        </div>
      )}

      {/* Provider selection */}
      {providers.length > 1 && (
        <div className="ww-payment-providers">
          <label className="ww-payment-providers-label">Payment Method</label>
          <div className="ww-payment-provider-list">
            {providers.map((p) => (
              <div
                key={p.id}
                className={`ww-payment-provider-option ${selectedProvider?.id === p.id ? 'ww-selected' : ''}`}
                onClick={() => setSelectedProvider(p)}
              >
                <span className="ww-payment-provider-name">{getProviderLabel(p)}</span>
                {p.isDefault && <span className="ww-badge ww-badge-primary ww-badge-sm">Default</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved payment methods */}
      {savedMethods.length > 0 && (
        <div className="ww-payment-methods">
          <h5>Saved Payment Methods</h5>
          {savedMethods.map((method: SavedPaymentMethodDto) => (
            <div
              key={method.id}
              className={`ww-payment-method ${selectedMethodId === method.id ? 'ww-selected' : ''}`}
              onClick={() => setSelectedMethodId(method.id)}
            >
              <div className="ww-payment-method-info">
                <strong>{method.brand ?? method.type}</strong>
                {method.last4 && <span> ending in {method.last4}</span>}
                {method.expMonth && method.expYear && (
                  <span className="ww-text-muted">
                    {' '}
                    ({method.expMonth}/{method.expYear})
                  </span>
                )}
                {method.isDefault && <span className="ww-badge ww-badge-primary ww-badge-sm">Default</span>}
              </div>
              <div className="ww-payment-method-actions">
                {!method.isDefault && (
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetDefault(method.id);
                    }}
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  className="ww-btn ww-btn-sm ww-btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMethod(method.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Billing address */}
      {requireBillingAddress && (
        <div className="ww-payment-billing">
          <h5>Billing Address</h5>
          <div className="ww-form-row">
            <div className="ww-form-group">
              <label htmlFor="ww-billing-first">First Name</label>
              <input
                id="ww-billing-first"
                type="text"
                className="ww-form-control"
                value={billingFirstName}
                onChange={(e) => setBillingFirstName(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="ww-form-group">
              <label htmlFor="ww-billing-last">Last Name</label>
              <input
                id="ww-billing-last"
                type="text"
                className="ww-form-control"
                value={billingLastName}
                onChange={(e) => setBillingLastName(e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>
          <div className="ww-form-group">
            <label htmlFor="ww-billing-addr">Street Address</label>
            <input
              id="ww-billing-addr"
              type="text"
              className="ww-form-control"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <div className="ww-form-row">
            <div className="ww-form-group">
              <label htmlFor="ww-billing-city">City</label>
              <input
                id="ww-billing-city"
                type="text"
                className="ww-form-control"
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="ww-form-group ww-form-group-sm">
              <label htmlFor="ww-billing-state">State</label>
              <input
                id="ww-billing-state"
                type="text"
                className="ww-form-control"
                value={billingState}
                onChange={(e) => setBillingState(e.target.value)}
                maxLength={2}
                disabled={isProcessing}
              />
            </div>
            <div className="ww-form-group ww-form-group-sm">
              <label htmlFor="ww-billing-zip">ZIP</label>
              <input
                id="ww-billing-zip"
                type="text"
                className="ww-form-control"
                value={billingZip}
                onChange={(e) => setBillingZip(e.target.value)}
                maxLength={10}
                disabled={isProcessing}
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit button */}
      {selectedProvider && (
        <div className="ww-payment-submit">
          <button
            type="button"
            className="ww-btn ww-btn-primary ww-btn-block ww-btn-lg"
            onClick={handlePay}
            disabled={isProcessing || loading}
          >
            {isProcessing ? (
              <>
                <span className="ww-spinner ww-spinner-sm" />
                Processing...
              </>
            ) : (
              <>
                <svg className="ww-payment-lock-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
                Pay {formatAmount(amount, currency)}
              </>
            )}
          </button>
        </div>
      )}

      {/* No providers */}
      {providers.length === 0 && !loading && (
        <div className="ww-alert ww-alert-warning">No payment methods available. Please contact support.</div>
      )}

      {/* Security notice */}
      {selectedProvider && (
        <div className="ww-payment-security">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
          </svg>
          <small>Secured by {getProviderLabel(selectedProvider)}</small>
        </div>
      )}

      {/* Cancel */}
      {onCancel && (
        <div className="ww-payment-cancel">
          <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
