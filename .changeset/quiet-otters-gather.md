---
"@wildwood/react": patch
---

`AppTierComponent` previews a paid tier change and pays for it before applying it

Confirming a paid tier used to call the change endpoint immediately and infer "this needs paying
for" from a failed result that carried no error message — a guess made only after the server had
already refused. The component now calls `previewTierChange` first and enters its payment step when
the server reports `paymentRequired`. Free targets are never previewed, and when the preview is
unavailable the component degrades to the direct call and keeps the previous
failed-without-a-message heuristic as the fallback.

After payment it retries the change with the `PaymentComponent`'s transaction id as
`paymentTransactionId`, so the server sees the upgrade as already paid instead of asking again.
