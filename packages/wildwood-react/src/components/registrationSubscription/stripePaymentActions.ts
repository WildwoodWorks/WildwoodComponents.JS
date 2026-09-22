'use client';

// Stripe.js, behind the shared flows' `PaymentActionAdapter`.
//
// The flows themselves are DOM-free so React Native can share them, which means the one thing they
// cannot do — put a bank's 3-D Secure challenge in front of the customer — is injected. This file
// is the web's answer, and it is the same code the flows used to hold inline, so the wire and the
// words are exactly what they were.
//
// There are two of them because the surfaces they serve load Stripe.js differently, and that
// difference is load-bearing: the plan change has no card field of its own and takes core's cached
// loader, while the pack checkout mounts a card Element first and must confirm on the very
// instance that Element belongs to.

import { getStripeInstance } from '@wildwood/core';
import type { PaymentActionAdapter, PaymentActionOutcome } from '@wildwood/react-shared';
import { createStripeInstance } from '../payment/useStripeCardElement.js';

/** The only thing either loader is asked for here. */
interface ConfirmsCardPayment {
  confirmCardPayment: (clientSecret: string) => Promise<{ error?: { message?: string } }>;
}

/** A Stripe.js confirmation, as an outcome. A refused card is `failed`, never a throw. */
async function confirmPaymentWith(
  load: (publishableKey: string) => Promise<ConfirmsCardPayment>,
  clientSecret: string,
  publishableKey: string | undefined,
): Promise<PaymentActionOutcome> {
  try {
    const stripe = await load(publishableKey ?? '');
    const { error } = await stripe.confirmCardPayment(clientSecret);
    if (error) return { status: 'failed', message: error.message ?? '' };
    return { status: 'succeeded' };
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : '' };
  }
}

/**
 * The adapter the plan change uses: core's `getStripeInstance`, which loads Stripe.js once per
 * publishable key and caches it. There is no card field on that surface — the charge is against a
 * card already on file — so nothing has to share an instance with anything.
 */
export const stripePaymentActions: PaymentActionAdapter = {
  confirmPayment: (clientSecret, publishableKey) => confirmPaymentWith(getStripeInstance, clientSecret, publishableKey),
};

/**
 * The adapter the pack checkout uses. `createStripeInstance` is the same loader `useStripeCardElement`
 * mounts its card field with, so a pack's 3-D Secure is confirmed on the instance that field belongs
 * to rather than on a second one built beside it.
 *
 * It deliberately carries no `confirmCardSetup`: on the web the SetupIntent is confirmed by the card
 * Element in `CardSetupForm`, which is why the checkout is driven with `hostCollectsCard`.
 */
export const stripeElementPaymentActions: PaymentActionAdapter = {
  confirmPayment: (clientSecret, publishableKey) =>
    confirmPaymentWith(createStripeInstance, clientSecret, publishableKey),
};
