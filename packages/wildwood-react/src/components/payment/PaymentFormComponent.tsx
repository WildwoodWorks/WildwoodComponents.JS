import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { InitiatePaymentResponse } from '@wildwood/core';
import { usePayment } from '../../hooks/usePayment.js';

export interface PaymentFormComponentProps {
  providerId: string;
  appId: string;
  amount: number;
  currency?: string;
  description?: string;
  customerId?: string;
  onPaymentSuccess?: (response: InitiatePaymentResponse) => void;
  onPaymentError?: (error: string) => void;
  className?: string;
}

/**
 * Dedicated payment form component - for a specific payment with pre-set amount.
 * Unlike PaymentComponent which includes method management, this is just the form.
 */
export function PaymentFormComponent({
  providerId,
  appId,
  amount,
  currency = 'USD',
  description,
  customerId,
  onPaymentSuccess,
  onPaymentError,
  className,
}: PaymentFormComponentProps) {
  const { initiatePayment, loading } = usePayment();

  const [cardholderName, setCardholderName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      const result = await initiatePayment({
        providerId,
        appId,
        amount,
        currency,
        description,
        customerId,
        ...(cardholderName || email ? {
          metadata: {
            ...(cardholderName ? { cardholderName } : {}),
            ...(email ? { email } : {}),
          },
        } : {}),
      });

      if (result.success) {
        if (result.redirectUrl) {
          const url = new URL(result.redirectUrl, window.location.origin);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            window.location.href = url.href;
          } else {
            setError('Invalid redirect URL');
            return;
          }
        } else {
          setSuccess(true);
          onPaymentSuccess?.(result);
        }
      } else {
        setError(result.errorMessage ?? 'Payment failed');
        onPaymentError?.(result.errorMessage ?? 'Payment failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setError(msg);
      onPaymentError?.(msg);
    }
  }, [providerId, appId, amount, currency, description, customerId, cardholderName, email, initiatePayment, onPaymentSuccess, onPaymentError]);

  if (success) {
    return (
      <div className={`ww-payment-form-component ${className ?? ''}`}>
        <div className="ww-alert ww-alert-success">Payment successful!</div>
      </div>
    );
  }

  return (
    <div className={`ww-payment-form-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="ww-payment-summary">
          <h4>Payment Summary</h4>
          <div className="ww-payment-amount">
            <span className="ww-payment-currency">{currency}</span>
            <span className="ww-payment-value">${amount.toFixed(2)}</span>
          </div>
          {description && <p className="ww-text-muted">{description}</p>}
        </div>

        <div className="ww-form-group">
          <label htmlFor="ww-pf-name">Cardholder Name</label>
          <input
            id="ww-pf-name"
            type="text"
            className="ww-form-control"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            placeholder="Name on card"
            disabled={loading}
          />
        </div>

        <div className="ww-form-group">
          <label htmlFor="ww-pf-email">Email</label>
          <input
            id="ww-pf-email"
            type="email"
            className="ww-form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Receipt email"
            disabled={loading}
          />
        </div>

        <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={loading}>
          {loading ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
        </button>
      </form>
    </div>
  );
}
