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
Server follow-up: WildwoodAPI's own `InitiatePaymentRequest` has no billing-address property yet, so
until it gains one the value is sent and ignored rather than stored.

**The tier-change confirmation modal only appeared in the tabbed layout.** In a stacked
(`displayMode` other than `tabs`) layout, picking a plan previewed the change and then showed
nothing. Every layout renders it now.

**`SubscriptionAdminComponent` threw when a change needed a card and the host had wired no
`onPaymentRequired`** ("Payment is required for this tier change. Wire the onPaymentRequired
callback to collect payment."), so the upgrade simply died. Its plan change is now the shared
`usePlanChangeFlow`, the same one the manage view of `RegistrationAndSubscriptionComponent` uses:
it collects the card in the built-in `PaymentModal` instead of throwing, and a prorated charge the
bank wants to see is confirmed and the parked change completed rather than refused. This is a
behaviour change, and the only one: a host that passes `onPaymentRequired` still owns the card step
and sees exactly what it saw before. The self-service change now posts through
`changeTierWithOptions` with `supportsPaymentAction`, and a failed or still-completing change
reports itself in one notice (with Try Again) instead of the data layer's copy of the same message.
Everything else - the panels, the add-on handlers, overrides, usage, the cancel notice,
`displayMode`, `showStatusAboveTabs`, `onMergeUsage` and `onSubscriptionChanged` - is untouched.

Two knock-on effects arrive through its data layer, `useSubscriptionAdmin` (see the
`@wildwood/react-shared` entry): a mutation that answers a bare `false` now also sets `error`, so a
refused pack subscribe or cancel says so instead of appearing to work, and every
entitlement-changing mutation emits `entitlementsChanged` on the client's emitter alongside the
feature-cache invalidation it already did.

**`AddOnsPanel` cancel now confirms first**, in the words that fit how the pack is paid for: a
billed pack says access continues to the end of the current billing period, and a pack nobody paid
for (no `paymentTransactionId`: a registration token's, or an admin's) reads "Included with your
registration", shows no renewal date, and says that cancelling removes it. New optional
`onReactivate` (offered on a billed pack whose cancellation is scheduled) and `onAddPacks` (a
surface that buys packs through a checkout of its own). A pack no longer renders a Subscribe button
when no `onSubscribe` was given - it did nothing at all. `FeaturesPanel` marks a feature an
override grants as "Included", so it does not read as part of a plan that does not carry it.

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

**A plan card quoted francs in dollars.** `TierCard`'s header formatted with the older `formatPrice`,
which reads a seven-entry symbol table and falls back to `'$'` for everything else — so an app
billing in CHF or SEK showed `$79.00` on the plan grid while the packs, the order summary and the
manage panels (already on `formatMoney`) showed the real currency. Both the header and
`TierChangeConfirmationModal` now use core's `formatMoney`, whose symbol comes from `Intl`. Output is
byte-identical for USD, EUR, GBP, JPY, INR, CAD and AUD (JPY's zero decimals included), so existing
locators and snapshots are unaffected; the modal also stops answering a missing amount with a
hard-coded `'$0.00'` and now says zero in the preview's own currency. Every plan grid on the platform
shares that header, so `PricingDisplayComponent` and `AppTierComponent` are fixed too.

**Missing stylesheet rules.** `ww-addons-*`, `ww-loading`, `ww-badge-danger`/`-warning`,
`ww-sub-admin`, `ww-sub-cancel-notice`, `ww-pricing-display` and every `ww-usage-*` class the usage
dashboard uses had no rule at all — those surfaces rendered unstyled. Added, along with the
`ww-pack-*`, `ww-regsub-*`, `ww-token-plan-summary`, `ww-pricing-skeleton` and
`ww-modal-overlay--stacked` base rules the registration-and-subscription views build on. Colours come
from `--ww-*` variables only, so every theme applies. A test now asserts that these components name no
class the stylesheet lacks.
