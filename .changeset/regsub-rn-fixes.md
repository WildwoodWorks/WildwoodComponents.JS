---
'@wildwood/react-native': minor
---

React Native: the signup wizard stops cancelling token plans, and prices stop being dollars

**A registration token's plan was cancelled by the signup that used it.** A token can carry a plan:
registering with it subscribes the account. The wizard then self-subscribed to whatever plan it had
of its own — which REPLACES the subscription, cancelling the one the token just set up. It now reads
the token's details first (`client.auth.getRegistrationTokenDetails`, matching the app id
case-insensitively), and when the token grants a plan for this app it skips plan selection and
payment entirely and never subscribes over the grant. Details that cannot be read come back `null`,
which is not the same as an invalid token: the wizard simply carries on with its normal flow. The
success step says which plan the token set up, and a retry honours the grant.

**A refused plan no longer fails the whole signup.** The server answers a refused subscribe with a
4xx, which the client throws — so the wizard failed a signup whose account already existed. A
refusal (thrown or `success: false`) is now non-fatal and the success step says "Plan activation is
pending — you can select a plan from your dashboard". An error message is never empty, so the
processing step can never strand the user on its spinner, and Start Over now clears the previous
attempt's payment ids, the failed-plan flag and the token grant.

**An upgrade's payment was quoted the wrong money.** `PaymentRequiredArgs` (the payload
`onPaymentRequired` receives, now shared with the web SDK) gains `pricingModelId` and `trialDays`,
and `price` is the PLAN's price rather than the preview's prorated charge. Hosts wired `pricingId` —
a tier-pricing link id — into a payment's `pricingModelId`, so the server found no pricing model and
charged a one-time prorated amount: no recurring subscription, no renewal, no trial.
`SubscriptionAdminComponent` and `AppTierComponent` both fill the new fields from the selected
pricing option.

**"Trial Ends" appeared on plans that were being paid for.** The server keeps a past trial's end date
on the subscription row, so `SubscriptionStatusPanel` showed a future-looking trial date on an
Active, charged plan. It now shows it only while the trial is actually running.

**Money is formatted by `formatMoney`.** `TierCardHeader` (which also gained the plan's
"14-day free trial" line), `TierChangeConfirmationModal`, `PricingDisplayComponent`,
`AppTierComponent` and the signup wizard all format through `@wildwood/core`'s `formatMoney` instead
of the seven-entry symbol table behind `formatPrice`, so an app billing in CHF or SEK is no longer
quoted in dollars. The seven currencies that table did carry render as before (JPY's zero decimals
included; amounts over 999 now carry Intl's thousands separator). The plan-change modal no longer
shows a hard-coded `'$0.00'` for an amount the server left out, and no longer throws inside itself
on an ISO code `Intl` does not know.

**The registration + subscription logic layer is exported.** `usePublicCatalog` (with
`invalidatePublicCatalog`, `seedPublicCatalog`, `clearPublicCatalogCache`), `useRegistrationMode`,
`useRegistrationSubscription`, `resolveSignupRegistrationMode`, the signup, pack-checkout and
plan-change machines with their step tokens, `grantsAccess` / `ACCESS_GRANTING_STATUSES`, the label
set and the `PaymentActionAdapter` seam, plus the pure catalog helpers from `@wildwood/core`
(`buildPublicCatalog`, `resolvePriceOption`, `formatMoney`, `trialLabel`, `selectPacks`, ...), so a
native host can build its own plan and pack screens on the same rules the components use.

`SignupWithSubscriptionComponent`, `AppTierComponent` and `PricingDisplayComponent` are marked
`@deprecated` in favour of the `RegistrationAndSubscriptionComponent` views available from this
release. All three keep working exactly as documented; nothing has been removed.
