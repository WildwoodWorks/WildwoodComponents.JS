---
"@wildwood/react-native": patch
---

`@wildwood/react-native/testing` — the flow helpers, a step observer, and the failed step says what
went wrong

**`patch`, not `minor`, and the distinction matters at `0.1.0`**: changesets treats `minor` as the
breaking bump before 1.0, and there is nothing breaking here. Every export is new, the ones that
already existed are untouched, and the one component change adds a `testID` to an element that
carried none. The sibling release that RENAMED two sheet ids was `minor` for exactly that reason.

**`acceptDisclaimers` and `finishSignup`** — the native halves of the Playwright helpers of the same
names. `finishSignup` waits out processing, retries a `failed` step a bounded number of times,
accepts whatever disclaimers the app has configured and leaves the success panel; `acceptDisclaimers`
does the middle part on its own. Both keep the web's bounded-failure shape: a loop that cannot
converge gives up and says what it was still looking at, rather than spinning until the runner's own
timeout reports a hang with no cause.

Three things they encode, each of which is a wrong answer a host would otherwise ship once:

- **Accept All is conditional.** `DisclaimerComponent` renders `disclaimer-accept-all` only when more
  than one disclaimer is pending; with exactly one, `disclaimer-accept` is the only control on
  screen. A loop written for Accept All alone returns having tapped nothing, and the caller's next
  wait then times out on a flow nobody advanced — which reads as the product hanging rather than as
  the helper missing. `disclaimer-accept` is also a repeated id (one per pending card, and an adapter
  acts on the first), so the loop drains rather than tapping once and returning.
- **A refusal is invisible from here, so it is NAMED rather than detected.** The web helper watches
  the acceptance response and reports "HTTP 429"; a `WwDriver` has no response listener, and the
  component reports the refusal through a native `Alert` that carries no `testID`. So the bound is
  the web's ten taps and the give-up message names the API's per-IP auth rate limit — which
  acceptance shares with login and register — as the usual cause, with `maxTaps` and `tapSettleMs`
  to raise when the device is merely slow.
- **The retry is answered before the accept.** A `disclaimer-retry` on screen means the pending list
  failed to load, so there is nothing to accept *yet*; reading that as "nothing to accept" would
  return successfully from a screen that is showing an error.

**`observeSignupSteps`** records the steps a run passed through, for asserting one never happened
(`plan` and `payment` on a token grant). It is named for what it is: the web's `recordSignupSteps`
installs a MutationObserver inside the page and sees every transition, while a native driver can only
be asked — so this polls and **can miss a step that came and went between two polls**. Everything in
the record happened, in that order; what is not in it may still have happened, and
`expectNeverEntered` is therefore evidence rather than proof. Use it for a step the flow would rest
on if it entered at all.

**`signup-error-message`** is a new `testID` on the failed step's message, so `finishSignup` can
report what the failure SAID instead of only that there was one. It is the web's
`data-ww-error-message`, which is read there as `[data-ww-step="failed"] [data-ww-error-message]` — a
`testID` is one string rather than a selector, so the step half of that pair travels in the name, the
way `signup-retry` and `signup-start-over` on that same panel are already spelled. Published as
`WW_IDS.signupErrorMessage`.

**Still no dependency and no peer dependency.** The helpers take the injected `WwDriver` the step
readers already took.

**Deliberately not ported**, and the README says why rather than leaving the gaps to read as
oversights: `fillRegistrationForm` (one `driver.type(wwFieldTestId(field), value)` per field — and
which fields are on screen depends on the app's registration mode, so the loop is the host's),
`submitRegistrationForm` (one `driver.tap`), `dismissConsentBanner` (it encodes that a fixed banner
eats the clicks aimed underneath it; `ConsentComponent` sits in the host's layout flow and covers
nothing) and `finishSignup`'s `expectSuccessText` (a `WwDriver` reads text by `testID`, the success
message carries none, and coining one for this would invent a contract string no other stack has —
assert it with your runner's own text matcher after `finishSignup` returns).

The README gains the whole surface: the `WwDriver` contract as a table, a complete Detox adapter, the
scoping and repeated-id rules an adapter owns, and the not-shipped list above.
