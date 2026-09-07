---
"@wildwood/core": patch
---

`validateStorePurchase` sends the purchase token as `receiptData` as well

WildwoodAPI's `ValidateReceiptRequest` binds `receiptData` — it has no `purchaseToken` property,
and both controller actions read `request.ReceiptData` (the Google one is even commented "This is
the purchase token"). Sending only `purchaseToken` meant the server validated an empty receipt, so
every store purchase failed validation.

The request body now carries the token in both fields: `receiptData` so validation works against
the current API, and `purchaseToken` kept as the contract name for when the API binds it. Nothing
else about the call changed, and the deprecated `validateAppStoreReceipt` is untouched.
