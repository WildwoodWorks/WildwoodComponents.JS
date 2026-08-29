---
'@wildwood/core': minor
---

Add a platform-agnostic in-app-purchase contract so native clients can validate store purchases
through one typed seam.

`StorePurchase` carries everything the server needs to validate an App Store or Play Store
purchase — the store product id, the proof of purchase (a StoreKit 2 signed JWS transaction on
Apple, the `purchaseToken` on Google), the store transaction id, and whether it came from a
restore flow. `PaymentService.validateStorePurchase(appId, purchase)` routes it to the matching
provider endpoint and returns the Wildwood payment transaction id to pass on to
`appTier.changeTier` / `appTier.selfSubscribe`. `IapProductMapping` pairs a store product id with
the tier it grants.

`PaymentService.validateAppStoreReceipt` is deprecated in favour of `validateStorePurchase`; its
behaviour is unchanged.
