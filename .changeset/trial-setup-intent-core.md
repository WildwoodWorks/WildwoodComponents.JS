---
"@wildwood/core": minor
---

`auth.getRegistrationTokenDetails` and free-trial fields on payments and tier pricing

`auth.getRegistrationTokenDetails(token)` calls the detailed token validation and returns the plans the
token grants, per app (`appGrants`: tier, pricing, add-ons, extra features). It returns `null` when the
details can't be read, so a caller can fall back to `validateRegistrationToken` instead of rejecting a
good token.

Free trials are now visible on the types the signup flow reads:

- `AppTierPricingModel.trialDays`: the trial length the server already sends with public tiers.
- `InitiatePaymentRequest.supportsSetupIntent`: set it when the client can confirm a Stripe SetupIntent.
  For a subscription that starts with a free trial, the server then answers with the trial's SetupIntent
  secret, so the card is saved for the charge at trial end. Without it the response is unchanged.
- `InitiatePaymentResponse.clientSecretType` (`'payment_intent' | 'setup_intent'`), `trialDays` and
  `trialEnd`.

`WildwoodError.fromResponse` reads the `errorMessage` field Wildwood result DTOs use, and never produces an
empty message. Over HTTP/2 there is no status text to fall back on, so a 4xx whose body had no `message`
used to become an error with an empty message, which UI code that checks "is there an error message?" read
as no error at all.
