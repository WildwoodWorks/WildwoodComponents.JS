---
"@wildwood/react-native": patch
---

`@wildwood/react-native/testing` — the identifier contract as data, and the step readers a native
suite cannot write in one line

A new subpath beside the package entry. It is purely additive: nothing in the main entry moves, and a
host that never writes tests never loads it.

```ts
import { WW_IDS, currentSignupStep, waitForSignupStep } from '@wildwood/react-native/testing';
```

**The constants.** `WW_SIGNUP_STEPS`, `WW_MANAGE_STEPS`, `WW_VIEWS`, `WW_REGISTRATION_FIELDS` and
`WW_IDS` — every `testID` the Registration & Subscription surfaces render, plus the disclaimer,
consent and registration-form hooks the signup mounts. They are the same strings the web puts in
`data-ww-*` and Swift in an `accessibilityIdentifier` — a test plan is meant to run against all five
stacks — and a spec that imports them stops spelling `'signup-get-started'` by hand and drifting the
day it is renamed. `wwTestId`, `wwPackTestId`, `wwGroupTestId`, `wwModalTestId` and `wwFieldTestId` are
re-exported here as the same functions the components call, not a second copy. `WW_SIGNUP_STEPS` is
the web's twelve `data-ww-step` values, which is deliberately **not** the signup machine's
`SignupStep`: the machine's last step is `done` where every stack's identifier says `success`.

**The step readers.** `currentSignupStep`, `waitForSignupStep` and `waitForSignupStepToLeave`. On the
web the step is an attribute value, so one `getAttribute` returns whatever it happens to be; a
`testID` is a name and answers only "is an element called this on screen?", so the current step has
to be PROBED against the twelve contract ids in turn. That loop, and the failure text that says what
the flow was actually on instead of just "timed out", are what a host would otherwise write and keep
in step with this package by hand. A wait costs one read per poll and spends the probe only on the
failure.

**No dependency, and no peer dependency.** The helpers take an injected `WwDriver` — `exists`,
`text`, `tap`, `type`, each addressed by `testID` — rather than a runner. Detox, React Native Testing
Library and Maestro agree on nothing but `testID`, and a runtime `import detox` inside this package
would resolve against the package's own location and make a host that uses one of the other two
install a runner it does not want. A Detox adapter is four short methods; Maestro cannot call a JS
helper at all, which is why the identifiers ship as strings and not only as functions that return
them. Scope is the adapter's job too: step ids are bare, so a host mounting two Wildwood surfaces on
one screen builds one driver per surface, matching within the view element that encloses the step.

**Deliberately not ported**: the web helpers' `fillRegistrationForm`, `submitRegistrationForm` and
`dismissConsentBanner`. What each of those is worth is entirely what it encodes about Playwright — a
selector list whose order matters, an actionability wait, a banner that must be answered before it
eats the clicks aimed underneath it — and none of that has a native counterpart. Filling the form
here is one `driver.type(wwFieldTestId(field), value)` per field.
