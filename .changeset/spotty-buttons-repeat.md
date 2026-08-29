---
"@wildwood/react-native": minor
---

`AppTierComponent` gains the payment seam; `UsageDashboardComponent` gains data overrides

`AppTierComponent` accepts `onPaymentRequired` — the same callback shape
`SubscriptionAdminComponent` already takes. For a non-free target tier the component now
previews the change first and, when the server reports `paymentRequired`, hands
`{ tierId, tierName, price }` to the callback; a returned transaction id retries the change
with it, and a `null`/`undefined` return cancels silently. Free target tiers keep the direct
path with no extra round-trip, and a preview that fails degrades to the direct call. Without a
callback the change is still attempted, but a payment refusal now surfaces the actionable
"Wire the onPaymentRequired callback" message instead of the raw server 400. Buttons stay
disabled while the host collects payment.

`PaymentRequiredArgs` moved to `components/subscription/paymentSeam` alongside the new
`OnPaymentRequired` type; both are now exported from the package root, and
`SubscriptionAdminComponent` re-exports `PaymentRequiredArgs` so existing imports keep working.

`UsageDashboardComponent` accepts `limitStatuses` and `subscription` overrides plus a
`usageDashboardOptions` pass-through to the internal `useUsageDashboard()` hook, matching the
`@wildwood/react` component's props.
