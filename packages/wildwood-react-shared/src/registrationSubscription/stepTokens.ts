// Step tokens: what makes the registration/subscription machines safe to drive from React.
//
// Every state that starts async work is issued a fresh token when it is entered, and the token is
// stored on the state. The result event carries the token it was started with, and the reducer
// ignores any result whose token is not the one the state is currently waiting on.
//
// That single rule covers three real hazards at once:
//   - StrictMode runs mount effects twice, so the work starts twice; the second start re-enters the
//     same state with a NEW token, and the first result is dropped as stale.
//   - A payment SDK callback that fires twice cannot advance the machine twice — the second copy
//     carries a token the machine has already moved past.
//   - A retry supersedes the attempt it replaced instead of racing it.

/** An opaque handle for one async step. Compare with `===`; never parse it. */
export type StepToken = string;

let counter = 0;

/**
 * Issue a token for a new async step. Monotonic within the process, so a token is never reused and
 * a late result can always be told apart from the attempt that replaced it.
 */
export function issueStepToken(): StepToken {
  counter += 1;
  return `step-${counter}`;
}

/**
 * Whether a result event belongs to the step the state is currently waiting on.
 *
 * `null` on either side means "not waiting" / "no token", which is never a match: a result that
 * arrives after the machine stopped waiting is stale by definition.
 */
export function isCurrentStep(stateToken: StepToken | null | undefined, eventToken: StepToken | null | undefined) {
  return Boolean(stateToken) && stateToken === eventToken;
}
