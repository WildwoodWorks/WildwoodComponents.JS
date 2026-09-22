// Where a React Native host plugs its payment SDK in.
//
// This package takes NO Stripe dependency — not @stripe/stripe-react-native, not Stripe.js, nothing.
// A native card sheet needs a native module, a rebuild and (on iOS) merchant configuration, so it
// cannot be something every consumer of the SDK inherits just by installing it. The one thing the
// components cannot do for themselves — put a card sheet or a bank's 3-D Secure challenge in front of
// the customer — is therefore injected, exactly as `FeedbackComponent`'s `captureScreenshot` and
// `AuthenticationComponent`'s `onProviderSignIn` are.
//
// The adapter type itself is the shared one (`@wildwood/react-shared`), so a handler wired here is the
// same handler the pack-checkout and plan-change flows take.
//
// Two ways in, because both are needed: a `paymentActionHandler` prop on the component for a screen
// that wires its own, and the same prop on `WildwoodProvider` so an app wires it once for every
// Wildwood surface. The prop wins over the provider — a screen that names a handler means that one.

import { createContext, useContext } from 'react';
import type { PaymentActionAdapter } from '@wildwood/react-shared';

/**
 * The app-wide payment-action handler, seeded by `WildwoodProvider`'s `paymentActionHandler` prop.
 *
 * `undefined` is the honest default and the supported state: with no handler the components never
 * tell the server they can confirm an intent, never ask for a SetupIntent, and fall back to the
 * provider's own web page rather than failing silently.
 */
export const PaymentActionContext = createContext<PaymentActionAdapter | undefined>(undefined);

/**
 * The payment-action handler in force, with a component's own prop taking precedence over the one
 * `WildwoodProvider` supplies.
 *
 * ```tsx
 * // undefined means no card can be confirmed on this device.
 * const handler = usePaymentActionHandler(props.paymentActionHandler);
 * ```
 */
export function usePaymentActionHandler(override?: PaymentActionAdapter): PaymentActionAdapter | undefined {
  const fromProvider = useContext(PaymentActionContext);
  return override ?? fromProvider;
}
