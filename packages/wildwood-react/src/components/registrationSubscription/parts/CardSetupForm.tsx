'use client';

// The one card entry in the pack checkout: an account with no card on file saves one here, and the
// purchase then charges it.
//
// It confirms a SetupIntent, never a payment — the packs are bought by the server afterwards, so
// this form can be shown once for a basket of any size.

import { useCallback, useState } from 'react';
import { useStripeCardElement } from '../../payment/useStripeCardElement.js';
import type { RegistrationSubscriptionLabels } from '../labels.js';

export interface CardSetupFormProps {
  /** The Stripe account to collect the card for. The form waits while this is unknown. */
  publishableKey?: string;
  /** The SetupIntent secret to confirm. The form waits while this is unknown. */
  clientSecret?: string;
  labels: RegistrationSubscriptionLabels;
  /** The card was saved. */
  onConfirmed: () => void;
  /** The card was refused, or Stripe could not be reached. */
  onFailed: (message: string) => void;
}

export function CardSetupForm({ publishableKey, clientSecret, labels, onConfirmed, onFailed }: CardSetupFormProps) {
  const { stripe, cardElement, containerRef, ready, loading, error, cardComplete, cardError } = useStripeCardElement({
    publishableKey,
    enabled: Boolean(publishableKey),
  });
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!stripe || !cardElement || !clientSecret || confirming) return;
    setConfirming(true);
    try {
      const { setupIntent, error: setupError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (setupError || !setupIntent || setupIntent.status !== 'succeeded') {
        onFailed(
          setupError?.message ??
            (setupIntent ? `Card setup status: ${setupIntent.status}. Please try again.` : 'Card setup failed'),
        );
        return;
      }
      onConfirmed();
    } catch (err) {
      onFailed(err instanceof Error ? err.message : 'Card setup failed');
    } finally {
      setConfirming(false);
    }
  }, [stripe, cardElement, clientSecret, confirming, onConfirmed, onFailed]);

  return (
    <div className="ww-stripe-card-section ww-regsub-card-setup">
      <label className="ww-form-label">{labels.cardDetails}</label>
      {loading && (
        <div className="ww-stripe-loading">
          <span className="ww-spinner ww-spinner-sm" />
        </div>
      )}
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}
      <div
        ref={containerRef}
        className={`ww-stripe-card-element ${cardError ? 'ww-stripe-card-error' : ''} ${cardComplete ? 'ww-stripe-card-complete' : ''}`}
      />
      {cardError && <div className="ww-stripe-card-error-text">{cardError}</div>}

      <button
        type="button"
        className="ww-btn ww-btn-primary ww-btn-block"
        onClick={() => void handleConfirm()}
        disabled={!ready || !cardComplete || !clientSecret || confirming}
      >
        {confirming ? <span className="ww-spinner ww-spinner-sm" /> : labels.saveCard}
      </button>
    </div>
  );
}
