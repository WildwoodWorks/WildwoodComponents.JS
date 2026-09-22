// The web's test hooks, spelled the way React Native can carry them.
//
// `@wildwood/react` hangs `data-ww-view="pricing"` and `data-ww-step="register"` off its elements,
// and the live sites' end-to-end suites locate the component by exactly those strings. React Native
// has one `testID` per element rather than a bag of attributes, so the STRINGS are carried over
// unchanged and this module decides which of them names an element — a test plan written against
// one stack then reads the same on the other.
//
// Packs, groups, modals and form fields are namespaced, because a flat `testID` namespace cannot
// tell `data-ww-pack="core"` from `data-ww-group="core"` the way two different attributes can. The
// prefix is the attribute's own name, so `data-ww-modal="packs"` is `modal:packs` here and on Swift.
//
// This is the whole package's identifier spelling, not only the three views': the signup view mounts
// the registration form and the disclaimer component as steps of its own, so a bare `token` or
// `register` on one of their elements would answer to the same string as a step of the flow around
// them. The flat ids those components carry (`submit-register`, `disclaimer-accept`, ...) are
// written at their call sites like every other constant hook in this package; what lives here is
// what a prefix has to be spelled consistently for.

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

/**
 * The `testID` for one of the sheets a view puts over itself. The web's `data-ww-modal`.
 *
 * Namespaced rather than bare, and this is the case that shows why: the web's two values are `packs`
 * and `payment`, and both of those are ALSO step names this flow reports. A sheet named `payment`
 * and the card step named `payment` would be two elements answering to one string, which is a worse
 * locator than no locator.
 */
export function wwModalTestId(modal: 'packs' | 'payment'): string {
  return `modal:${modal}`;
}

/**
 * The registration form's fields, by the names the web puts in `data-ww-field`.
 *
 * The six the web names are the contract and are spelled exactly as it spells them. The seventh is
 * this contract's own: REACT's registration-token input carries an `id` and no `data-ww-field`, so
 * there was no string to match, and `registrationToken` is the name the wire format
 * (`RegistrationFormData.registrationToken`) already uses for it.
 *
 * Razor is the exception and the reason this says React rather than "the web": it does emit a
 * `data-ww-field` on that input, spelled `token`, and its own client script keys the collected form
 * values off that spelling — so it cannot simply be renamed here. A plan that wants the token field
 * on Razor asks for `token`; everywhere else it is `field:registrationToken`.
 */
export type RegistrationFieldName =
  | 'firstName'
  | 'lastName'
  | 'username'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'registrationToken';

/**
 * The `testID` for one registration form input.
 *
 * Namespaced for the same reason packs and groups are: the prefix is the web attribute's own name,
 * and `data-ww-field` is an attribute of its own there.
 *
 * None of the seven collides with a step id today - that was checked, not assumed. The prefix is for
 * what a flat namespace cannot promise about tomorrow. Fields and steps are two vocabularies that
 * grow independently, and the day one adds `plan` or `payment` - both already step names - or a step
 * arrives called `email`, the collision is silent: a query returns two elements and the failure
 * surfaces as a test that cannot find what it is looking for, nowhere near the commit that caused it.
 * A prefix costs one word and removes the whole class.
 */
export function wwFieldTestId(field: RegistrationFieldName): string {
  return `field:${field}`;
}
