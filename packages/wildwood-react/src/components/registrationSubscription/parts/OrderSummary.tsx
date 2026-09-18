'use client';

// What the packs in the basket cost, as the server just quoted them.
//
// Every figure is off the quote: its lines, its currency, its per-line trial and its total due
// today. Nothing is added up here — the server owns the arithmetic, because it is the one that
// will charge the card.

import type { AddOnCheckoutQuoteModel } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';

export interface OrderSummaryProps {
  /** A successful quote. */
  quote: AddOnCheckoutQuoteModel;
  labels: RegistrationSubscriptionLabels;
}

export function OrderSummary({ quote, labels }: OrderSummaryProps) {
  const currency = quote.currency;

  return (
    <div className="ww-order-summary-card ww-regsub-order-summary">
      <h4 className="ww-regsub-order-summary-title">{labels.orderSummary}</h4>

      {quote.lines.map((line) => {
        const trial = line.trialEligible ? trialLabel(line.trialDays) : '';
        return (
          <div className="ww-order-summary-plan" key={`${line.addOnId}:${line.pricingId}`} data-ww-pack={line.addOnId}>
            <span className="ww-order-summary-name">{line.name}</span>
            <span className="ww-order-summary-price">
              {formatMoney(line.price, currency)}
              {trial ? <span className="ww-order-summary-trial">{trial}</span> : null}
            </span>
          </div>
        );
      })}

      <div className="ww-order-summary-total">
        <span>{labels.dueToday}</span>
        <span>{formatMoney(quote.totalDueToday, currency)}</span>
      </div>

      {quote.savedCard ? (
        <p className="ww-regsub-saved-card">
          {formatLabel(labels.savedCardOnFile, {
            brand: quote.savedCard.brand ?? '',
            last4: quote.savedCard.last4 ?? '',
          })}
        </p>
      ) : null}
    </div>
  );
}
