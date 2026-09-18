// The web's test hooks, spelled the way React Native can carry them.
//
// `@wildwood/react` hangs `data-ww-view="pricing"` and `data-ww-step="register"` off its elements,
// and the live sites' end-to-end suites locate the component by exactly those strings. React Native
// has one `testID` per element rather than a bag of attributes, so the STRINGS are carried over
// unchanged and this module decides which of them names an element — a test plan written against
// one stack then reads the same on the other.
//
// Packs and groups are namespaced, because a flat `testID` namespace cannot tell
// `data-ww-pack="core"` from `data-ww-group="core"` the way two different attributes can.

import type { RegistrationSubscriptionView } from './types';

/**
 * The `testID` for a view's root, or for one step inside it.
 *
 * With a step, the step's own name is the hook (`register`, `packs`, `failed`, ...) — the same
 * string the web puts in `data-ww-step`. With no step, the view names the element, as
 * `data-ww-view` does.
 */
export function wwTestId(view: RegistrationSubscriptionView, step?: string): string {
  return step && step.length > 0 ? step : view;
}

/** The `testID` for one pack card, order-summary line or outcome row. */
export function wwPackTestId(addOnId: string): string {
  return `pack:${addOnId}`;
}

/** The `testID` for one group of packs (`all` when ungrouped, `more` for the catch-all). */
export function wwGroupTestId(groupId: string): string {
  return `group:${groupId}`;
}
