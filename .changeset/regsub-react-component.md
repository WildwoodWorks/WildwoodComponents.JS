---
'@wildwood/react': minor
---

RegistrationAndSubscriptionComponent (pricing and signup views); the manage view follows

One component for everything a customer does with money: `view="pricing" | "signup" | "manage"`.
The pricing and signup views ship now. Both read the app's live public catalog, so the plans and packs on the
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

The manage view is declared (its props are final, so hosts can write against them now) but renders
a placeholder until the next release. `PricingDisplayComponent` and
`SignupWithSubscriptionComponent` are unchanged.
