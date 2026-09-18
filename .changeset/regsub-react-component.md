---
'@wildwood/react': minor
---

RegistrationAndSubscriptionComponent (pricing view); signup and manage views follow

One component for everything a customer does with money: `view="pricing" | "signup" | "manage"`.
The pricing view ships now. It reads the app's live public catalog, so the plans and packs on the
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

The signup and manage views are declared (their props are final, so hosts can write against them
now) but render a placeholder until the next releases. `PricingDisplayComponent` is unchanged.
