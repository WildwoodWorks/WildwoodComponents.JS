// The seam between a flow that has to get an intent confirmed and the SDK that can confirm it.
//
// The flows below this file are DOM-free on purpose: React Native and SwiftUI share them, and
// neither may take a Stripe.js dependency. So the one thing the flows cannot do themselves — put a
// bank's 3-D Secure challenge in front of the customer — is injected.
//
// The web supplies an adapter backed by Stripe.js and behaves exactly as it always has. A native
// host may supply one backed by its own payment SDK, or supply none at all: without an adapter a
// flow never claims it can answer a challenge (it does not ask the server to park one) and reports
// a challenge it meets anyway as "finish this on the web" rather than as a silent failure.

/**
 * What became of one confirmation.
 *
 * `cancelled` is the customer dismissing the sheet, which is not a failure and carries no message
 * to show them; `failed` always carries one, even if only the empty string, so a caller can fall
 * back to its own words.
 */
export type PaymentActionOutcome =
  | { status: 'succeeded' }
  | { status: 'failed'; message: string }
  | { status: 'cancelled' };

/** What a host plugs in so the shared flows can have an intent confirmed. */
export interface PaymentActionAdapter {
  /** Confirm a PaymentIntent (3-D Secure / requires_action) for a card already on file. */
  confirmPayment(clientSecret: string, publishableKey?: string): Promise<PaymentActionOutcome>;
  /** Confirm a SetupIntent that saves a card. Optional: a web host drives this through its own card element. */
  confirmCardSetup?(clientSecret: string, publishableKey?: string): Promise<PaymentActionOutcome>;
}
