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

/**
 * The ids one view's frame carries, which is three rather than one.
 *
 * They sit on three elements because they answer three different questions and a `testID` answers
 * one: the host's own id names THIS mount on a screen that may hold several, the step names what the
 * flow is doing right now, and the view's name says which Wildwood surface a generic step like
 * `payment` or `failed` belongs to. Composing them is the point - a host id that replaced the step
 * hook would take the flow's progress off the screen with it, and a suite waiting for `register`
 * would then look exactly like a component that hangs.
 *
 * They nest host > view > step, the same order the web nests `data-ww-step` inside `data-ww-view`.
 * That order is load-bearing rather than tidy: step ids are bare (`payment`, `failed`), so the only
 * thing that can tell two Wildwood surfaces apart on one screen is an enclosing element, and a view
 * name BENEATH the step would scope the content while leaving the step read itself ambiguous.
 */
export interface RegistrationSubscriptionTestIds {
  /** The host's own `testID`, verbatim, or none. It never displaces a hook of ours. */
  host?: string;
  /**
   * The step the flow is on, when it is on one.
   *
   * Absent at rest rather than repeating the view's name: two elements answering to `manage` would
   * make `getByTestId('manage')` ambiguous, which is a worse locator than no locator.
   */
  step?: string;
  /** The view's own name, on screen in every body it renders - the running ones included. */
  view: string;
}

/**
 * The three ids for one view root, from the host's `testID` and whatever the view calls the state it
 * is in. An empty or absent step means "at rest".
 */
export function wwViewTestIds(
  view: RegistrationSubscriptionView,
  hostTestID: string | undefined,
  step?: string,
): RegistrationSubscriptionTestIds {
  return {
    host: hostTestID,
    // Routed through `wwTestId` although it returns the step unchanged today. How a step id is
    // spelled belongs in one place: if it ever gains a namespace, it gains one here too, rather
    // than this being the one caller that kept spelling it the old way.
    step: step && step.length > 0 ? wwTestId(view, step) : undefined,
    view: wwTestId(view),
  };
}

/** The `testID` for one pack card, order-summary line or outcome row. */
export function wwPackTestId(addOnId: string): string {
  return `pack:${addOnId}`;
}

/** The `testID` for one group of packs (`all` when ungrouped, `more` for the catch-all). */
export function wwGroupTestId(groupId: string): string {
  return `group:${groupId}`;
}
