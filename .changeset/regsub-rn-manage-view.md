---
'@wildwood/react-native': minor
'@wildwood/react-shared': minor
---

React Native: `RegistrationSubscriptionManage` and the `RegistrationAndSubscriptionComponent` shell

The native registration-and-subscription component is complete: one `RegistrationAndSubscriptionComponent`
switching on `view="pricing" | "signup" | "manage"`, plus each view exported on its own for a screen
that would rather pick an import than pass a prop.

**The manage view** renders this package's own admin panels — status, plans, features, packs, usage,
overrides — in `layout="tabs"` or `layout="stacked"`, filtered by `sections`, `isAdmin` and
`showAddOns`, with `showStatusAboveTabs` lifting the subscription card out of the list rather than
rendering it twice. `userId` / `companyId` route the whole surface through the admin endpoints,
`onMergeUsage` overlays an app's own real-time usage on the server's limits, `allowCancel` turns
cancellation off, and `onSubscriptionChanged` / `onEntitlementsChanged(reason)` fire after every
mutation so a host can refresh its own gates.

**A plan change no longer needs a card modal of your own.** It runs through the shared
`usePlanChangeFlow`: preview, a confirmation in EVERY layout, a card when one is needed, the change,
a bank challenge, then the parked change completed — re-asked on the machine's bounded budget while
the server answers `processing`, which means the money is in and is not a failure. Where the card
comes from follows one rule: a host `onPaymentRequired` wins when it was given (its answer is final —
an empty one abandons the change), and otherwise the component's own `PaymentModal` takes it; closing
that returns to the confirmation with the priced change intact. `SubscriptionAdminComponent` moves
onto the same composition, so the two cannot drift — its props are unchanged, and a host already
passing `onPaymentRequired` keeps exactly the behaviour it had.

**3-D Secure is asked for only where it can be answered.** Both surfaces take the new
`paymentActionHandler` (or `WildwoodProvider`'s). With one, the change is posted in the options form
so the server may park it on a challenge, which the handler then answers. Without one, the plain
change is posted — the server is never told this device can confirm an intent, so it refuses a change
that needs one instead of parking it where nobody can finish it.

**Pack self-service.** `allowPackSelfService` puts "Add packs" on the packs panel, opening the pack
picker and the same card-once checkout the signup uses. A pack is cancelled at the end of the period
it is paid up to and a scheduled cancellation can be taken back; a pack nobody paid for says
"Included with your registration", promises no renewal date, offers no Reactivate, and is simply
removed when it is cancelled.

**Store-billed devices** (`requiresAppStorePayment`, asked of the server per platform rather than
guessed) do not offer pack PURCHASE — pack checkout is a card purchase and there is no store product
behind an add-on — while owned, bundled and included rows still render and can still be cancelled.
The plan-change confirmation drops the server's proration figures, which describe a card
subscription, and says the store manages billing for the change instead.

`@wildwood/react-shared` gains one label for that notice, `storeManagesBilling` ("Your app store
manages billing for this change."). Every other string is unchanged, and an override set that does
not mention it keeps the shipped copy.

Also exported: `PaymentModal`, `usePlanChangeFlow`, and the `RegistrationSubscriptionManageProps` /
`RegistrationAndSubscriptionComponentProps` / `ManageLayout` / `ManageSection` types. The README has
the whole component: the three views, every prop that differs from the web package and why, the
payment-handler recipe, `paymentOrder`, `iapProducts` and the store-billed rules.
