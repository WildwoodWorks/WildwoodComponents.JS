'use client';

// Buying the packs a new account asked for, on screen.
//
// The driving — quote, card intent, purchase, then any pack the bank wants authenticated, one at a
// time, each claimed by the machine's step token — is `usePackCheckoutFlow` in
// `@wildwood/react-shared`, so React Native buys packs the same way rather than a second way. What
// stays here is the part that is genuinely web: Stripe Elements.
//
// The card is collected by `CardSetupForm`, which mounts a real card field and confirms the
// SetupIntent itself, so the flow is driven with `hostCollectsCard` and simply waits to be told.
// The 3-D Secure a bought pack may still need has no field to mount, so that one goes through the
// adapter — on the very Stripe instance the card field was built with.

import type { AddOnCheckoutItemInput } from '@wildwood/core';
import { usePackCheckoutFlow, type SignupPackOutcome } from '@wildwood/react-shared';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';
import { stripeElementPaymentActions } from '../stripePaymentActions.js';
import type { RegistrationSubscriptionError } from '../types.js';
import { CardSetupForm } from './CardSetupForm.js';
import { OrderSummary } from './OrderSummary.js';

export interface PackCheckoutProps {
  appId: string;
  /** The packs still to buy — the chosen ones, minus anything a registration token granted. */
  items: AddOnCheckoutItemInput[];
  /** Pack names from the catalog, so an outcome can name a pack the quote never priced. */
  names?: Record<string, string>;
  labels: RegistrationSubscriptionLabels;
  /** Every requested pack's outcome, including the ones that failed or were skipped. */
  onFinished: (packs: SignupPackOutcome[]) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
}

export function PackCheckout({ appId, items, names, labels, onFinished, onError }: PackCheckoutProps) {
  const flow = usePackCheckoutFlow({
    appId,
    items,
    names,
    labels,
    hostCollectsCard: true,
    paymentActions: stripeElementPaymentActions,
    onFinished,
    onError,
  });
  const { state } = flow;

  return (
    <div className="ww-regsub-pack-checkout">
      {state.quote?.success ? <OrderSummary quote={state.quote} labels={labels} /> : null}

      {flow.step === 'collectingCard' && (
        <CardSetupForm
          publishableKey={flow.publishableKey}
          clientSecret={flow.cardClientSecret}
          labels={labels}
          onConfirmed={flow.cardConfirmed}
          onFailed={flow.cardFailed}
        />
      )}

      {(flow.step === 'idle' || flow.step === 'quoting' || flow.busy) && (
        <div className="ww-signup-step-status" role="status">
          <span className="ww-spinner ww-spinner-sm" />
          <span className="ww-text-muted">
            {flow.step === 'authenticating' || flow.step === 'completing'
              ? formatLabel(labels.authenticatingPack, { name: flow.authenticatingName })
              : labels.buyingPacks}
          </span>
        </div>
      )}

      {flow.step === 'failed' && (
        <div className="ww-regsub-pack-checkout-failed">
          <div className="ww-alert ww-alert-danger" role="alert">
            {state.error ?? labels.packsUnavailable}
          </div>
          <div className="ww-signup-processing-actions">
            <button type="button" className="ww-btn ww-btn-primary" onClick={flow.retry}>
              {labels.tryAgain}
            </button>
            <button type="button" className="ww-btn ww-btn-link" onClick={flow.skip}>
              {labels.skipForNow}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
