---
'@wildwood/react-shared': minor
'@wildwood/react-native': minor
---

Signup: `planDefault` moves to the shared flow, so React Native opens on a free plan too

`planDefault="free"` marks the app's free plan on the signup plan step without choosing it — the step
still runs, the register form's submit still reads "Continue", and the visitor still taps the card.
It shipped on `@wildwood/react` while the flow lived there; the flow now lives in
`@wildwood/react-shared`, so the option and the `defaultTierId` it resolves live there with it and
every stack driving `useSignupFlow` gets the same answer. `SignupPlanDefault` is exported from
`@wildwood/react-shared`, and `@wildwood/react` re-exports it from the same name as before.

`RegistrationSubscriptionSignup` on React Native takes `planDefault` and marks its grid with the same
precedence the web uses — `state.selection.tierId ?? flow.defaultTierId ?? preSelectedTierId`. A
`preSelectedTierId` still on screen at the plan step is one the flow already refused (stale, or
hand-edited), so the host's default wins over it rather than the grid opening on nothing.

The suggestion never reaches the reducer on either stack: it is resolved at render time from the
catalog the flow already holds, and gated off while an invite is being redeemed, whose plan comes
from its token.
