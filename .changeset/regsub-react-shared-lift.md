---
'@wildwood/react': patch
---

Registration & Subscription: the flow logic moves to `@wildwood/react-shared`

An internal move, so React Native can share the signup, plan-change and pack-checkout flows rather
than carry a second copy of them. Behaviour, wire calls and public exports are unchanged:
`useSignupFlow`, `usePlanChangeFlow`, `DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS` and the component's
types are all still exported from the same names and importable from the same paths.

What React keeps is the part that is genuinely a browser: Stripe.js. A new
`stripePaymentActions.ts` holds the `getStripeInstance` + `confirmCardPayment` code the plan change
used to hold inline, and a second adapter for the pack checkout that confirms on the very Stripe
instance its card Element was built with. React always supplies one, so the plan change still posts
`supportsPaymentAction: true` and still completes a parked change itself, and `CardSetupForm` still
confirms the SetupIntent with a real card field.
