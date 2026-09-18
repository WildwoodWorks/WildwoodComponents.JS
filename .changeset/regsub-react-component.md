---
'@wildwood/react': minor
---

RegistrationAndSubscriptionComponent: the pricing, signup and manage views

One component for everything a customer does with money: `view="pricing" | "signup" | "manage"`.
All three read the app's live public catalog or the account's own subscription, so the plans and packs on the
page are the ones the app is actually selling, at the price the server is quoting this minute —
there is no fallback price, no remembered price and no "from" price anywhere in it. While the
catalog loads it shows a placeholder with no numbers in it; if the catalog cannot be read it says
"Pricing is unavailable right now" and offers a Retry, rather than a stale figure.

```tsx
<RegistrationAndSubscriptionComponent
  view="pricing"
  showAddOns
  packSelection="multi"
  addOnGroups={groups}
  contactUrl="/contact?plan=enterprise"
  onSelect={({ tierId, pricingId, billing, addOnIds }) => navigate(signupUrl({ tierId, pricingId, addOnIds }))}
/>
```

The plan grid is the platform's existing `TierCard` grid — same markup, same "Get Started" /
"Subscribe" / "Switch to ..." CTAs — so a site swapping `PricingDisplayComponent` for this keeps its
locators. Packs render beside the plans, optionally grouped under the host's own headings, and a
visitor can tick several and continue once. The view is SSR-safe: nothing touches `window` at module
scope or in render, and an `initialCatalog` built during a server render paints real prices with no
loading flash. `includeJsonLd` publishes the same live prices as schema.org offers.

The signup view is the whole way in, in the order that keeps an account and its money consistent:
the app's live registration settings decide what the form offers (open sign-up, a required token,
or a closed notice), a registration token's plan is checked and shown before anything is charged,
the plan's card is taken BEFORE the account exists — a declined card leaves nothing behind rather
than an account on a plan nobody paid for — and packs are bought AFTER the login, as the user, so
the card taken a minute earlier is the saved card and nobody is asked for it twice.

```tsx
<RegistrationAndSubscriptionComponent
  view="signup"
  preSelectedTierId={tierId}
  preSelectedPricingId={pricingId}
  preSelectedAddOnIds={addOnIds}
  packSelection="multi"
  onSignupComplete={({ userId, tier, packs }) => navigate('/welcome')}
  onAlreadySignedIn={() => navigate('/dashboard')}
/>
```

Everything a link carries is checked against the catalog: a plan the app no longer sells is
ignored, packs are filtered to what is on sale and capped, and `planSelection="skip"` takes the
app's default plan rather than whatever the URL asked for. `tokenMode="required"` is invite
redemption — the token is the only way in, there is no plan and no pack step, and a token that
carries a plan shows "Your registration token includes" with the tier, packs and features it
grants, none of which reach a checkout. One pack failing never stops the others: each one reports
its own outcome, and the signup finishes with `onSignupComplete({ userId, tier, packs })` after
refreshing the app's feature gates. Registration refusals arrive at `onError` with the server's own
code (a 403 `RegistrationNotAllowed`, say) as well as on screen, and "Try Again" resumes at the
step that failed instead of registering the same person twice.

The step container carries a stable `data-ww-step`
(`loading | closed | register | token | plan | packs | payment | creating | disclaimers |
packCheckout | success | failed`), and every locator the live sites' suites use is unchanged:
"Continue" / "Create Account" on the form, `.ww-tier-grid`, PaymentComponent's own pay button and
success panel, `.ww-signup-processing` with "Something Went Wrong" / "Try Again" / "Start Over",
`.ww-signup-disclaimers`, and the "All Set" panel with "Get Started".

`PaymentComponent`'s Stripe card field is now the shared `useStripeCardElement` hook, which the
pack checkout's one-time card entry uses too. `PaymentComponent` itself is unchanged to look at.

The manage view is the third: what a customer already pays for, and every way of changing it.

```tsx
<RegistrationAndSubscriptionComponent
  view="manage"
  layout="stacked"
  sections={['subscription', 'plans', 'addOns', 'usage']}
  allowPackSelfService
  onEntitlementsChanged={() => refreshGates()}
/>
```

The panels are the platform's own - the same status card, `.ww-tier-grid` plan grid with its
"Switch to ..." CTAs, features, packs, usage and admin overrides the admin surfaces have always
rendered - so a site swapping its hand-built plan page for this keeps its markup and its locators.
`layout` is `'tabs'` (one panel at a time) or `'stacked'` (all of them down the page), `sections`
picks and orders them, and `showStatusAboveTabs`, `isAdmin`, `userId`, `companyId`, `allowCancel`,
`showAddOns` and `allowPackSelfService` decide what a given viewer may see and do. The root carries
`data-ww-view="manage"` and a `data-ww-step` naming where the plan change is
(`idle | previewing | confirm | collectingPayment | changing | authenticating | completing | done |
failed`).

What is new is the middle. A plan change goes preview -> confirm (in EVERY layout) -> card if one
is needed -> change -> 3-D Secure -> completion, and the component brings its own card modal:
`PaymentModal`, which every site on the platform used to hand-build around `PaymentComponent`. It
answers exactly once, so a payment SDK that calls back twice cannot cancel a charge that went
through; a refused card stays in the modal for a retry instead of throwing the priced change away;
a payment that succeeded with no id to complete the change with is reported rather than passed off
as a cancel; and the transaction is attributed to the signed-in user afterwards, best effort. A
host that would rather keep its own modal passes `onPaymentRequired` and still owns that step.

A prorated charge the bank wants to see is a "not yet", not a refusal: the change is posted with
`supportsPaymentAction`, the parked charge is confirmed with `confirmCardPayment` against the app's
own Stripe publishable key, and the change is then completed by its `pendingChangeId` - retried
while the server answers `processing`, and reported in words a customer can act on when it cannot
be ("The payment window closed - please start the change again").

Packs are the other half. With `allowPackSelfService` the packs panel offers "Add packs", which
opens the signup's own pack grid and card-once checkout, so a pack bought a month after signing up
is the same transaction as one bought during it. A pack is cancelled at the end of the period it is
paid up to, after being told so, and a scheduled cancellation can be taken back. A pack nobody paid
for - a registration token's, an admin's - reads "Included with your registration", shows no
renewal date, offers no Reactivate, and says what cancelling it really does. Features an override
grants read as "Included" rather than as part of a plan that does not carry them.

`PricingDisplayComponent` and `SignupWithSubscriptionComponent` are unchanged.
