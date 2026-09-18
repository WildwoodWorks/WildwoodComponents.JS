---
'@wildwood/react-native': minor
---

React Native: `RegistrationSubscriptionPricing` — a plan and pack screen that only ever quotes the server

The native half of the new registration-and-subscription component starts with the surface that sells
the app. `RegistrationSubscriptionPricing` reads the live public catalog through `usePublicCatalog`,
renders the package's own `TierCard` grid for plans and a pack grid beside it, and hands the whole
choice back in one `onSelect({ tierId, pricingId, billing, addOnIds })`.

**No price is ever invented.** There is no fallback price, no remembered price and no "from" price
anywhere in the component — a guard test greps its sources for one. While the catalog loads the
visitor sees shapes with no numbers in them; if it cannot be read they see "Pricing is unavailable
right now" and a Retry that genuinely re-fetches, and the prices go away with the answer that
produced them. The currency is the one the server quoted, with the `currency` prop as an override for
the rare host that knows better. Every amount goes through `formatMoney` and every trial line through
`trialLabel`, so a Swiss app cannot get a plan card in dollars beside a pack card in francs.

**Packs are first-class.** `showAddOns` turns the pack grid on; `packSelection: 'multi'` lets several
be ticked and continued once, capped at the platform's 25, always reported in catalog order rather
than tap order. `addOnGroups` files packs under host headings — an empty group is dropped and a pack
matching no group lands in a trailing "More packs" rather than vanishing from the screen that sells
it. A pack the operator defined but never priced says "Not yet available" instead of implying it is
free. `describeAddOn` supplies host blurbs, meters and icons.

**Everything else the web view has that a phone can use.** `showPlans`, `offerFreeTierChoice`, a
monthly/annual toggle that only appears when some plan is actually priced by the year (with the best
saving on it), `defaultBilling`, `showFeatureComparison`, `showLimits`, `highlightTierId`, a
`contactUrl` for contact-sales plans (opened with `Linking.openURL`), `loadingFallback`/`errorFallback`,
`labels` overrides for every string, and `onError` reporting a `catalog_unavailable` once per distinct
failure. `style` and `testID` pass through as on every component here; the test hooks carry the same
strings the web puts in `data-ww-view` / `data-ww-pack` / `data-ww-group`.

`PricingDisplayComponent` still works and is unchanged; it is now marked deprecated in favour of this
view, which quotes packs as well as plans and never shows a price the server did not just send.
