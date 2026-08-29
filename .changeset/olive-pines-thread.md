---
"@wildwood/react-shared": minor
---

Thread the new core capabilities through the shared hooks

`useAppTier` exposes `previewTierChange` (prices a prospective change before it is
applied) and accepts an optional trailing `paymentTransactionId` on `changeTier` and
`selfSubscribe`, so a purchase paid for out-of-band — a validated App Store / Play Store
purchase — can be attached to the tier change. `usePayment` exposes
`validateStorePurchase(purchase)`, the platform-agnostic replacement for the now-deprecated
`validateAppStoreReceipt`. `useAIFlow` and `useAIFlowSubscriptions` accept a `fetchImpl`
option that reaches every core request (SSE included). `useDocuments`' `upload` widens from
`Blob` to `UploadableFile`, so a React Native `{ uri, name, type }` descriptor is accepted.

All additions are optional and appended, so existing call signatures are unchanged.
