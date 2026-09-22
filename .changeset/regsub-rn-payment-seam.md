---
'@wildwood/react-native': minor
---

React Native: a host payment seam, and `PaymentComponent` learns about trials

**A card can now be confirmed on the device, without this package depending on a payment SDK.** A
native card sheet or a bank's 3-D Secure challenge needs a native module, a rebuild and (on iOS)
merchant configuration, so it cannot be something every consumer inherits by installing the SDK. It
is injected instead — the same pattern as `FeedbackComponent`'s `captureScreenshot` and
`AuthenticationComponent`'s `onProviderSignIn`. Wire a `PaymentActionAdapter` once on
`WildwoodProvider`'s new `paymentActionHandler` prop, or per component through the prop of the same
name (the component's wins); `usePaymentActionHandler()` reads whichever is in force, so a host's own
screen follows the same rule the components do. The README has the recipe for
`@stripe/stripe-react-native`, which stays the app's dependency and never becomes this package's.

**With no handler nothing is asked of the app and nothing changes.** `supportsSetupIntent` is never
sent, no intent is confirmed here, and a provider's redirect is followed exactly as before. A handler
that confirms payments but not card setups counts as no handler for trials: a `SetupIntent` nothing
can confirm would leave a trial with no saved card and renew into a failed charge.

**`PaymentComponent` can be paid a plan rather than an amount.** New `amount`, `currency`,
`description`, `pricingModelId`, `isSubscription`, `trialDays`, `billingAddress`, `appId` and
`paymentActionHandler` props; omit `amount` and it is the free-form payment screen it always was. A
plan with a trial offers "Start 14-day free trial" rather than a charge, says what is due when the
trial ends, and — with a handler — saves the card through a `SetupIntent` instead of charging it
today. The server confirm uses the id the SERVER recorded (a subscription's first invoice), not one
read back from a client SDK.

**A declined card no longer starts a second subscription.** The intent is kept, keyed by
provider/plan/amount, so a retry confirms the same one. A dismissed card sheet returns to the form
with no error at all, because cancelling is a decision and not a failure.

**A trial the account cannot have is confirmed before anything is charged.** When the plan advertised
a trial and the server answers with a charge instead, the component says so and waits for a second
press rather than taking the money; the question is asked again only if the form moves to another
plan.

**A payment is reported once.** `onPaymentSuccess` (the whole `PaymentCompletionResult`) and the
existing `onPaymentComplete` each fire exactly once, and the new `onContinue` is what advances the
host — there is no Continue button without it, so advancing can never re-run a host's success
handler.
