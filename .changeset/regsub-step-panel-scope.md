---
"@wildwood/react": patch
---

Scope the step-scoped selectors to the step's PANEL, never the view root

Reading the current step and scoping a control to it are two different jobs, and
`data-ww-step` does both — which turns out to be a trap.

`SIGNUP_STEP_SELECTOR` deliberately accepts the step on the view ROOT, because a
server-rendered stack keeps every step panel in the DOM at once and mirrors the
active step onto the root so that a single readable value exists. That part is
right and is what the contract asks for.

But the same mirroring makes the root an ancestor matching `[data-ww-step="failed"]`
the moment the flow is on that step, so `[data-ww-step="failed"] .ww-btn-primary`
stopped meaning "the failed panel's Try Again" and started meaning "every primary
button in the view". The register panel's submit precedes the real Try Again in
document order and is hidden, so `.first()` resolved to a button that can never
become actionable and `click()` waited out its timeout — a hang, on exactly the
stack the mirroring was introduced to fix.

`SUBMIT_REGISTER_SELECTOR`, `SIGNUP_RETRY_SELECTOR` and the failure-message hook
now scope through `[data-ww-step="…"]:not([data-ww-view])`. The root is always
the element carrying `data-ww-view` and a step panel never carries one, in every
stack that renders this flow, so excluding it costs nothing and keeps the loose
class fallbacks pointed at the panel they were written for.

No change for React or Blazor, whose step lives on a child panel either way.
