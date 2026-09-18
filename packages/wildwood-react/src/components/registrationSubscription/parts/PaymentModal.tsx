'use client';

// The card an upgrade needs, in the component's own modal.
//
// Every site on the platform hand-built this: an overlay, a `PaymentComponent` inside it, and a
// promise resolved with the transaction id. They all got the same three things right and one of
// them wrong at least once, so it lives here now:
//
//  · It answers EXACTLY once. A payment SDK that calls back twice, or a close after a success,
//    cannot cancel a charge that already went through.
//  · A refused card is not the end of it: the modal stays put with its own message, so the
//    customer can fix the card and try again without losing the priced change behind it.
//  · A payment that succeeded with no id to complete the change with is reported rather than
//    passed off as a cancel - money moved, and somebody has to know.
//
// The transaction is attributed to the signed-in user afterwards, best effort and detached: the
// change must not wait on it, and `linkTransactionToUser` answers false rather than throwing.

import { useCallback, useRef } from 'react';
import type { PaymentCompletionResult } from '@wildwood/core';
import { useWildwood } from '../../../hooks/useWildwood.js';
import { PaymentComponent } from '../../payment/PaymentComponent.js';
import type { PaymentRequiredArgs } from '../../subscription/admin/SubscriptionAdminComponent.js';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';
import type { RegistrationSubscriptionError } from '../types.js';

export interface PaymentModalProps {
  /** The app the payment belongs to. Defaults to the client's configured app. */
  appId?: string;
  /** What the plan change needs paying for: the plan, its pricing model, price and trial. */
  request: PaymentRequiredArgs;
  /** The currency the plan is priced in. */
  currency?: string;
  labels: RegistrationSubscriptionLabels;
  /** Where a redirect-flow provider should come back to. Carried, never navigated to. */
  returnUrl?: string;
  /** Ask for a billing address before anything is charged. */
  requireBillingAddress?: boolean;
  /** Render above another modal (a confirmation still on screen). */
  stacked?: boolean;
  /** Called once: the transaction id to complete the change with, or null if nothing was paid. */
  onSettled: (paymentTransactionId: string | null) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
}

export function PaymentModal({
  appId,
  request,
  currency,
  labels,
  returnUrl,
  requireBillingAddress,
  stacked,
  onSettled,
  onError,
}: PaymentModalProps) {
  const client = useWildwood();
  const settled = useRef(false);

  const settle = useCallback(
    (paymentTransactionId: string | null) => {
      if (settled.current) return;
      settled.current = true;
      onSettled(paymentTransactionId);
    },
    [onSettled],
  );

  const cancel = useCallback(() => settle(null), [settle]);

  const succeeded = useCallback(
    (result: PaymentCompletionResult) => {
      const paymentTransactionId = result.transactionId ?? result.paymentIntentId ?? null;
      if (!paymentTransactionId) {
        onError?.({ code: 'payment_unconfirmed', message: labels.paymentUnconfirmed });
        settle(null);
        return;
      }
      // Complete the change first: attribution must not gate it.
      settle(paymentTransactionId);
      const userId = client.session.userId;
      // The server looks a transaction up by the provider's own id when there is one.
      const externalId = result.paymentIntentId ?? paymentTransactionId;
      if (userId) void client.payment.linkTransactionToUser(externalId, userId).catch(() => {});
    },
    [client, labels.paymentUnconfirmed, onError, settle],
  );

  const title = formatLabel(labels.upgradeToPlan, { tier: request.tierName });

  return (
    <div
      className={`ww-modal-overlay${stacked ? ' ww-modal-overlay--stacked' : ''}`}
      onClick={cancel}
      data-ww-modal="payment"
    >
      <div className="ww-modal ww-regsub-payment-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ww-modal-header">
          <h3 className="ww-modal-title">{title}</h3>
          <button type="button" className="ww-modal-close" onClick={cancel} aria-label={labels.closePayment}>
            &times;
          </button>
        </div>
        <div className="ww-modal-body">
          <PaymentComponent
            appId={appId}
            amount={request.price ?? 0}
            currency={currency}
            description={title}
            isSubscription
            pricingModelId={request.pricingModelId}
            trialDays={request.trialDays}
            customerId={client.session.userId ?? undefined}
            customerEmail={client.session.userEmail ?? undefined}
            returnUrl={returnUrl}
            requireBillingAddress={requireBillingAddress}
            onPaymentSuccess={succeeded}
            onPaymentFailure={() => {
              /* Deliberate: PaymentComponent shows its own message and stays mounted for a retry. */
            }}
            onCancel={cancel}
          />
        </div>
      </div>
    </div>
  );
}
