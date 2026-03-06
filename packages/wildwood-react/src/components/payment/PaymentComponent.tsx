import { useState, useEffect, useCallback } from 'react';
import type { AppPaymentConfigurationDto, SavedPaymentMethodDto } from '@wildwood/core';
import { usePayment } from '../../hooks/usePayment.js';

export interface PaymentComponentProps {
  customerId?: string;
  onPaymentComplete?: (paymentIntentId: string) => void;
  className?: string;
}

export function PaymentComponent({
  customerId,
  onPaymentComplete,
  className,
}: PaymentComponentProps) {
  const {
    loading, error, savedMethods,
    getAppPaymentConfiguration,
    initiatePayment, getSavedPaymentMethods,
    deleteSavedPaymentMethod, setDefaultPaymentMethod,
  } = usePayment();

  const [config, setConfig] = useState<AppPaymentConfigurationDto | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const appConfig = await getAppPaymentConfiguration();
      if (appConfig) setConfig(appConfig);
      if (customerId) {
        await getSavedPaymentMethods(customerId);
      }
    };
    load();
  }, [getAppPaymentConfiguration, getSavedPaymentMethods, customerId]);

  const handlePay = useCallback(async () => {
    setPaymentError(null);
    setSuccessMessage('');

    if (!amount || parseFloat(amount) <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    if (!config?.defaultProviderId) {
      setPaymentError('No payment provider configured');
      return;
    }

    try {
      const result = await initiatePayment({
        providerId: config.defaultProviderId,
        appId: config.appId,
        amount: parseFloat(amount),
        currency: config.defaultCurrency ?? 'USD',
        description: description || undefined,
        customerId: customerId || undefined,
      });

      if (result.success) {
        if (result.redirectUrl) {
          const url = new URL(result.redirectUrl, window.location.origin);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            window.location.href = url.href;
          } else {
            setPaymentError('Invalid redirect URL');
          }
        } else {
          setSuccessMessage('Payment initiated successfully!');
          setAmount('');
          setDescription('');
          onPaymentComplete?.(result.paymentIntentId ?? '');
        }
      } else {
        setPaymentError(result.errorMessage ?? 'Payment failed');
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    }
  }, [amount, config, description, customerId, initiatePayment, onPaymentComplete]);

  const handleDeleteMethod = useCallback(async (methodId: string) => {
    await deleteSavedPaymentMethod(methodId);
    if (selectedMethod === methodId) setSelectedMethod(null);
    if (customerId) await getSavedPaymentMethods(customerId);
  }, [deleteSavedPaymentMethod, selectedMethod, getSavedPaymentMethods, customerId]);

  const handleSetDefault = useCallback(async (methodId: string) => {
    await setDefaultPaymentMethod(methodId);
    if (customerId) await getSavedPaymentMethods(customerId);
  }, [setDefaultPaymentMethod, getSavedPaymentMethods, customerId]);

  return (
    <div className={`ww-payment-component ${className ?? ''}`}>
      {(error || paymentError) && <div className="ww-alert ww-alert-danger">{error || paymentError}</div>}
      {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}

      {/* Saved Payment Methods */}
      {savedMethods.length > 0 && (
        <div className="ww-payment-methods">
          <h4>Saved Payment Methods</h4>
          {savedMethods.map((method: SavedPaymentMethodDto) => (
            <div
              key={method.id}
              className={`ww-payment-method ${selectedMethod === method.id ? 'ww-selected' : ''}`}
              onClick={() => setSelectedMethod(method.id)}
            >
              <div className="ww-payment-method-info">
                <strong>{method.brand ?? method.type}</strong>
                {method.last4 && <span> ending in {method.last4}</span>}
                {method.isDefault && <span className="ww-badge ww-badge-primary">Default</span>}
              </div>
              <div className="ww-payment-method-actions">
                {!method.isDefault && (
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-outline"
                    onClick={(e) => { e.stopPropagation(); handleSetDefault(method.id); }}
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  className="ww-btn ww-btn-sm ww-btn-danger"
                  onClick={(e) => { e.stopPropagation(); handleDeleteMethod(method.id); }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Form */}
      <div className="ww-payment-form">
        <h4>Make a Payment</h4>
        <div className="ww-form-group">
          <label>Amount ({config?.defaultCurrency ?? 'USD'})</label>
          <input
            type="number"
            className="ww-form-control"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            disabled={loading}
          />
        </div>
        <div className="ww-form-group">
          <label>Description (optional)</label>
          <input
            type="text"
            className="ww-form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Payment description"
            disabled={loading}
          />
        </div>
        <button
          type="button"
          className="ww-btn ww-btn-primary ww-btn-block"
          onClick={handlePay}
          disabled={loading || !amount}
        >
          {loading ? 'Processing...' : `Pay ${amount ? `$${parseFloat(amount).toFixed(2)}` : ''}`}
        </button>
      </div>
    </div>
  );
}
