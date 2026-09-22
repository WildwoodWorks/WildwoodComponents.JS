---
'@wildwood/react-native': minor
---

React Native: `RegistrationSubscriptionSignup` — an account, a plan, packs and a card, in the order a phone can afford

The native signup surface renders from the same `useSignupFlow` the web view does, so the two stacks
cannot drift on when a plan is skipped, what a registration token grants or what the outcome says.
Every step the machine has is on screen — loading, closed, register, token, plan, packs, payment,
creating, disclaimers, pack checkout, success, failed — and each carries the `testID` the web puts in
`data-ww-step`, so one test plan reads the same on both stacks.

**The card is taken AFTER the account, and that is the point.** The web is pay-first: a card that
fails then leaves nothing behind. A phone may be billed through a store, and a store purchase that
succeeds before a registration that then fails strands a paid subscription with nobody to attach it
to — a support ticket, not a void. So `paymentOrder` defaults to `'afterAccount'` here: the account is
made, then the card is asked for. A customer who walks away from it is not thrown away with it — the
signup finishes and the success panel says plan activation is pending. A host billing by card only can
pass `'beforeAccount'` for the web's order.

**A registration token decides everything it covers.** After the token check, a summary lists what the
token sets up — the plan and its pricing option by the name the server sent, the packs, the extra
features — and never prices any of it, because the visitor is not paying for it. A grant skips the plan
step and the card, is never subscribed over, and drops the packs it already covers out of the basket;
packs the visitor added on top are still bought. Granted packs are reported first, as "Included".
`tokenMode: 'required'` is invite redemption: the token is the only way in, it overrides a closed
configuration, and neither a plan nor packs are asked for.

**Nothing fails silently where there is no payment SDK.** Packs are bought through the shared
pack-checkout flow: one quote, one purchase, and at most one card for a basket of any size. With a
card already on file the basket goes on it. With a `paymentActionHandler` wired (prop, or
`WildwoodProvider`'s) the card is collected once through it. With neither, no SetupIntent is ever
asked for — a client secret nothing on the device can confirm is worse than none — and the packs are
reported as not bought with "This purchase has to be finished on the web", with no Try Again that
would fail for the same reason.

**App-Store-billed apps.** When the server says this device must pay through its store, the plan is
bought with the package's existing `useInAppPurchases` / `InAppPurchaseSheet` path from the
`iapProducts` mapping the host supplies, and pack PURCHASE is not offered at all — there is no store
product behind an add-on. Packs that were asked for are still named, with the reason.

Also new: `ClosedNotice` is exported for a host that wants to say "registration is closed" on a screen
of its own. `preSelectedTierId` / `preSelectedPricingId` / `preSelectedAddOnIds` (deduped, capped at
25, then vetted against the live catalog), `prefillEmail`, `planSelection`, `packSelection`,
`renderClosed`, `onAlreadySignedIn` (latched at the first look, so a login made during the flow never
looks like a session that was already there), `onSignupComplete(outcome)`, `onCancel` and
`onEntitlementsChanged`. Every amount goes through `formatMoney` and every string through the shared
labels; `requireBillingAddress` is carried but collected by nothing here, as this package ships no
address form. `returnUrl` is deliberately absent: a native screen has no URL to come back to, and
where a finished signup goes is the navigator's business.

`SignupWithSubscriptionComponent` still works and is unchanged; it stays deprecated in favour of this
view.
