---
"@wildwood/react-native": minor
---

Reusable in-app purchase flow: `useInAppPurchases` + `InAppPurchaseSheet`

`useInAppPurchases({ products })` maps store product ids onto Wildwood tiers and runs the whole
App Store / Play Store conversation: `purchaseTier(tierId, pricingId?)` resolves the Wildwood
payment transaction id to pass as `paymentTransactionId` to `useAppTier`'s changeTier /
selfSubscribe, and `restorePurchases()` re-validates existing entitlements. The receipt goes to
`payment.validateStorePurchase`, and the store transaction is finished ONLY after Wildwood records
it — an unvalidated purchase stays unfinished so the store re-delivers it on the next launch.
Cancellations resolve `null` with no error, and deferred (Ask to Buy) purchases surface as
`purchaseState: 'pending'`. `onValidatePurchase` overrides the receipt hand-off.

`InAppPurchaseSheet` is a themed convenience modal over the hook: the store's own localized price,
a Buy button, and the Restore Purchases button App Store review requires. It holds no store logic,
so an app with its own paywall can keep the hook and drop the component.

expo-iap is an OPTIONAL peer dependency, loaded lazily and guarded: an app that never calls the
hook needs neither the package nor a native prebuild, and `available` is false with every call
inert when it is missing. The store API is feature-detected across expo-iap versions
(`fetchProducts`/`requestProducts`/`getProducts`, `purchaseToken`/`jwsRepresentationIos`/
`transactionReceipt`), so both the 2.7+ and older surfaces work.
