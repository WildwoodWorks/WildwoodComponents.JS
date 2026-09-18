---
'@wildwood/react-shared': minor
---

The registration-and-subscription flows move here, behind an injected payment-action adapter

The three machines have been in this package since the component shipped, but the halves that drive
them — the ones that read the catalog, register the account, quote the basket and post the change —
lived in `@wildwood/react`. React Native cannot import that package, so sharing them meant copying
them. They move here instead, whole:

- `useSignupFlow(options)` — the signup order, driven. Same hook, minus the two web words it used to
  say on its own: `platform` and `deviceInfo` are options now, filled in by the host (`'web'` plus
  the user agent, or `Platform.OS` plus its version), exactly as `useAuthenticationLogic` already
  takes them.
- `usePlanChangeFlow(options)` — preview, confirm, card, change, 3-D Secure, complete.
- `usePackCheckoutFlow(options)` — quote, one card at most, one purchase, then any pack the bank
  wants authenticated, one at a time. Extracted from React's `PackCheckout`; the card FIELD stays
  there, because Stripe Elements is a browser thing, and the flow is told so with
  `hostCollectsCard`.
- `DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS`, `formatRegistrationSubscriptionLabel`,
  `resolveRegistrationSubscriptionLabels` and the `RegistrationSubscriptionLabels` type — every
  string these surfaces say, so all of them say the same words.
- The DOM-free types the flows speak in: `RegistrationSubscriptionError`, `PricingBilling`,
  `SignupPlanSelection`, `SignupPackSelection`, `PaymentRequiredArgs`, `TierSelectedEventArgs`.

Nothing here imports `window`, `document`, `navigator` or Stripe, which is what makes the package
safe for React Native — and what the new `PaymentActionAdapter` is for:

```ts
interface PaymentActionAdapter {
  confirmPayment(clientSecret: string, publishableKey?: string): Promise<PaymentActionOutcome>;
  confirmCardSetup?(clientSecret: string, publishableKey?: string): Promise<PaymentActionOutcome>;
}
```

`succeeded | failed(message) | cancelled`. The web plugs in a Stripe.js-backed one and behaves
exactly as before. **Without an adapter the flows never claim they can answer a challenge**: the plan
change posts the plain `changeTier` form rather than the options form with `supportsPaymentAction`,
the pack checkout never asks for a SetupIntent it could not confirm, and a `requires_action` that
arrives anyway stops with the new `finishOnWeb` label ("This purchase has to be finished on the
web.") instead of a silent failure. No payment configuration is even read on that path.

`signupMachine` gains one option, `paymentOrder: 'beforeAccount' | 'afterAccount'`, defaulting to
`'beforeAccount'` — so the shipped order, every transition and every skip rule are untouched, and
the existing machine tests pass unmodified. `'afterAccount'` is what a store-billed stack wants: a
purchase that succeeds before a registration that then fails strands a paid subscription with no
account to attach it to. There, the `payment` step leaves the form's order and is entered after
`ACCOUNT_CREATED` instead, before the disclaimers, whenever the plan still needs paying for (the
same question the pay-first skip rule asks, now exported as `signupPlanNeedsPayment`).
`PAYMENT_COMPLETED` carries on to wherever `ACCOUNT_CREATED` would have gone; the new
`PAYMENT_ABANDONED` — valid only in that position — goes to the same place but sets
`planActivationPending`, which the outcome carries so a success screen can say the plan is still
pending rather than active. The account is never thrown away for it.
