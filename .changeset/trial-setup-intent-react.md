---
"@wildwood/react": minor
---

Free trials save the card at signup, and registration tokens with a plan skip plan selection

**Free trials.** A paid plan whose pricing has `trialDays` used to be sold as a charge ("Pay $99.00",
then "Payment Successful! Amount: $99.00") while nothing was actually collected. Stripe returned no
payment to confirm, `PaymentComponent` took that as success, and the card was never attached. The
subscription then reached the end of its trial with nothing to charge.

- `PaymentComponent` has a `trialDays` prop. With it the button reads "Start 14-day free trial", the
  form says nothing is charged today, and the success screen gives the date the first charge is due.
- For Stripe it asks the server for a SetupIntent (`supportsSetupIntent`), confirms it with
  `stripe.confirmCardSetup`, and verifies it on the server. A declined card now stops the flow the way a
  declined payment does.
- `SignupWithSubscriptionComponent` passes the selected pricing's trial through, shows
  "14-day free trial. Due today: $0.00" in the order summary and the trial on the plan summary card.
  Tier cards show the trial under the price.

This needs a WildwoodAPI that understands `supportsSetupIntent`. Against an older API the payment step
behaves as before.

A declined card is retried on the same Stripe intent instead of creating another subscription, and the
Stripe confirmation now sends the id the server recorded (a subscription's first invoice) so the server can
verify the payment with Stripe.

**Signup never hangs on a refused plan.** A self-subscribe the server refuses (a 4xx) finishes signup with
"Plan activation is pending" instead of leaving the wizard on "Activating your plan..." forever, and "Start
Over" clears the previous attempt's payment and plan.

**Registration tokens that carry a plan.** When the user registers with a token whose plan covers this
app, `SignupWithSubscriptionComponent` skips plan selection and payment and does not self-subscribe
afterwards. Registering with the token already subscribes the user, and a self-subscribe would have
cancelled that subscription. Tokens without a plan for the app keep the normal flow.
