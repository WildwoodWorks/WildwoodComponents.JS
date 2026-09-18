---
'@wildwood/react-native': minor
---

React Native: packs say what they really are, and a plan change stops dying in silence

**A cancelled pack was never offered again.** `AddOnsPanel` treated any row it found as ownership, so
a Cancelled or Expired pack kept a stale "Subscribed" badge and could not be bought back. Ownership
is now the one shared `grantsAccess` rule (`Active`, `Trialing`, `PendingCancellation`): a lapsed
pack is on offer again, and one scheduled to cancel is still owned rather than sold twice.

**A pack nothing paid for read like a billed one.** A pack a registration token or an admin granted
now carries an "Included with your registration" badge, promises no renewal date, offers no
Reactivate (there is nothing at a provider to take back), and its cancel confirmation says that
cancelling removes it — instead of the billed pack's "you keep access until the end of the current
billing period".

**Cancelling a pack asked first, and refusals are visible.** Cancel used to fire on the first press;
it now opens an inline confirmation. A pack scheduled to cancel shows "Cancellation Scheduled" with
"Cancels on {date}" (or "at the end of the billing period" when the server sent none) and a
Reactivate button. Subscribe, cancel and reactivate go through the detailed service calls, and a
refusal or a thrown error is shown on the panel rather than looking as if it worked. Trial copy comes
from the pricing option that is actually bought (never a bare `0`), and prices use `formatMoney` with
the pack's own currency.

**`FeaturesPanel`** marks a feature an override grants outside the plan with an "Included" badge —
shown to everyone, not only admins.

**`SubscriptionAdminComponent` previewed a plan change and then showed nothing** in any single-panel
`displayMode`: the confirmation modal was rendered only by the tabbed layout. It now renders in every
layout. The change itself moves onto the shared `usePlanChangeFlow`, so this component, the web admin
component and the native manage view all follow one order. A change that needs a card with no
`onPaymentRequired` wired no longer throws "Wire the onPaymentRequired callback" at the user — the
new `PlanChangeNotice` says the purchase has to be finished on the web and lets the change be
abandoned. A host that passes `onPaymentRequired` keeps exactly the behaviour it had, including the
rule that an empty answer abandons the change. The cancel-result notice (store-billing instructions
and link included) is now the exported `CancelResultNotice`.

No payment SDK is assumed: with no `PaymentActionAdapter` the flow never tells the server it can
answer a 3-D Secure challenge, so no change is parked on one.
