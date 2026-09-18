---
"@wildwood/react": patch
"@wildwood/react-shared": patch
---

Four fixes in the subscription, payment and usage components

**`PaymentComponent` reported a successful payment twice.** The success panel's "Continue" button
called `onPaymentSuccess` again, so every host that advances on it ran its success handler a second
time — the signup wizard re-ran the whole registration. `onPaymentSuccess` now fires exactly once per
successful payment, and Continue has its own optional prop:

```tsx
<PaymentComponent onPaymentSuccess={complete} onContinue={goToDashboard} />
```

The button renders **only** when `onContinue` is given. A host that used to rely on Continue to
advance should pass one. The success interstitial's copy is unchanged.

`SignupWithSubscriptionComponent` passes one, and no longer replaces the payment step the instant the
payment succeeds — React batched the payment's completion and the wizard's step change into one
commit, so "Payment Successful!" and its Continue button were never painted. The wizard now runs the
signup **behind** the mounted success panel (its progress shows beside it) and leaves the payment step
when the signup needs the user (pending disclaimers), when it fails (the processing step's Try Again /
Start Over), or when Continue is pressed. Continue never starts a second signup: while one is in
flight it only records the request and advances when it lands.

**The billing address was collected and dropped.** With `requireBillingAddress`, the fields were
rendered, typed into, and never sent. They are now validated before anything is charged (an
incomplete address stops the request with "Please complete your billing address.") and travel with
`initiatePayment` as `billingAddress`; the key is left off entirely when the app does not ask for one.

**The tier-change confirmation modal only appeared in the tabbed layout.** In a stacked
(`displayMode` other than `tabs`) layout, picking a plan previewed the change and then showed
nothing. Every layout renders it now.

**`AddOnsPanel`.**

- The trial comes from the pricing option that is actually bought (falling back to the pack), so the
  panel promises the trial the processor will start. A pack with `trialDays: 0` no longer renders a
  literal "0".
- One access-granting rule decides what "subscribed" means — `Active`, `Trialing` or
  `PendingCancellation`, now `grantsAccess` / `ACCESS_GRANTING_STATUSES` exported from
  `@wildwood/react-shared` so the panels share it. A Cancelled or Expired row no longer badges a pack
  "Subscribed" instead of offering it, and a pack scheduled to cancel is not offered for sale again;
  it reads "Cancels on <date>" rather than "Renews" (or "Cancels at the end of the billing period" when
  the server sent no date).
- A refused `onSubscribe`/`onCancel` is reported. Resolving `false` or throwing now raises an inline
  `ww-alert ww-alert-danger`, cleared when the next attempt starts, instead of the panel showing
  nothing at all. Both callbacks may resolve `boolean | void`.
- Prices use the pack's own `currency` when it carries one, through `formatMoney`.

**Missing stylesheet rules.** `ww-addons-*`, `ww-loading`, `ww-badge-danger`/`-warning`,
`ww-sub-admin`, `ww-sub-cancel-notice`, `ww-pricing-display` and every `ww-usage-*` class the usage
dashboard uses had no rule at all — those surfaces rendered unstyled. Added, along with the
`ww-pack-*`, `ww-regsub-*`, `ww-token-plan-summary`, `ww-pricing-skeleton` and
`ww-modal-overlay--stacked` base rules the registration-and-subscription views build on. Colours come
from `--ww-*` variables only, so every theme applies. A test now asserts that these components name no
class the stylesheet lacks.
