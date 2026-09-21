---
"@wildwood/react": minor
---

`@wildwood/react/testing` works against every stack, and the markup names what it reaches

The Playwright helpers were written against React's DOM, which is the only DOM they had. Blazor and
Razor render the same component, and a spec written once should read all three — so the helpers now
key on a vocabulary every stack can honour, and React emits it as the reference implementation.
Every previous selector is kept as a fallback, so a suite pointed at a deployment built before this
release still works, and no export changed name or signature.

**New markup hooks.** `data-ww-action` names the controls a class selector used to stand in for:
`submit-register` on the registration form's submit (still a `button[type="submit"]`),
`signup-retry`, `signup-start-over` and `signup-get-started` on the failure and success panels.
`data-ww-field="firstName" | "lastName" | "username" | "email" | "password" | "confirmPassword"` sits
on the six registration inputs **alongside** their `#ww-reg-*` ids, which are unchanged — an id
cannot be the contract, because a server-rendered stack suffixes its ids with a per-instance
component id. And `data-ww-error-message` names the failed step's message, which shares
`.ww-text-muted` with the processing steps' "please wait".

**Helper fixes**, each of which was a wrong answer rather than a missing feature:

- The signup step reader accepts the step on the signup ROOT as well as on a child, so a stack that
  keeps every panel in the DOM can mirror the active step somewhere readable. React is unaffected —
  its root carries no step, so the child still wins. The `recordSignupSteps` observer was widened
  the same way.
- `acceptDisclaimers` no longer mistakes an Accept All for the load-failure retry. The retry's
  class-based fallback now excludes anything carrying a `data-ww-disclaimer-action` of its own;
  previously a stack whose Accept All is a plain `.ww-btn-primary` in `.ww-disclaimer-actions` was
  clicked ten times as a retry and then reported "The disclaimers never loaded" about disclaimers
  that had loaded fine.
- `acceptDisclaimers` ticks the checkbox gate in front of Accept before clicking it. Where Accept is
  `disabled` until the required boxes are ticked, `click()` waited for actionability and the run
  hung on the button. React has no such gate, so this does nothing there.
- The failure text is read from `[data-ww-step="failed"] [data-ww-error-message]` first, and only
  then from `.ww-signup-processing .ww-text-muted` — in that order rather than as one selector list,
  because a list resolves in document order and would return a still-mounted "please wait".
- The 429 watcher's URL pattern defaults to `/(disclaimeracceptance|disclaimer-gate)\/accept/i` and
  is overridable through `AcceptDisclaimersOptions.acceptResponsePattern` (forwarded by
  `finishSignup`). A host that makes the acceptance call from the SERVER sees no response in the
  browser at all, so the 429 diagnostic degrades to the generic bounded-failure message; the README
  says so, because it is not fixable from the page.

The selector constants are exported (`SIGNUP_STEP_SELECTOR`, `REGISTRATION_FIELD_IDS`,
`registrationFieldSelector`, `ACCEPT_RESPONSE_PATTERN`, …), so a host writing a spec of its own keys
on the same strings instead of copying them and drifting. Playwright remains a type-only import:
the built module still imports nothing at runtime.
