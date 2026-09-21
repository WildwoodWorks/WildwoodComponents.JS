/**
 * The DOM contract these helpers key on, as plain data.
 *
 * Kept apart from the drivers for two reasons. It is the shared vocabulary the other stacks
 * (Blazor, Razor, React Native, SwiftUI) are asked to honour, so it should be readable in one place
 * rather than inlined in a click. And it is the only part of the module a unit test can exercise
 * without a browser — the drivers need a live `Page`.
 *
 * Nothing here imports anything, at runtime or as a type. See `poll.ts` for why that matters.
 *
 * **Ordered lists vs comma-joined lists.** A CSS selector list (`a, b`) resolves in DOM order, not
 * in list order, so `.first()` on one does NOT mean "prefer `a`". Where preference is what is
 * wanted — the failure message, whose fallback matches an *earlier* element on a stack that renders
 * every step panel at once — the list stays an array and the driver tries each entry in turn.
 */

/**
 * Reads the signup step.
 *
 * Two forms because two stacks place it differently and both are correct: React and Blazor put
 * `data-ww-step` on a child of the signup root (exactly one child exists at a time), while a
 * server-rendered stack that keeps every panel in the DOM mirrors the active step onto the ROOT
 * instead — the only place a single readable value can live there. The root comes first in DOM
 * order, so `.first()` picks the mirror where one exists and the child everywhere else.
 */
export const SIGNUP_STEP_SELECTOR = '[data-ww-view="signup"][data-ww-step], [data-ww-view="signup"] [data-ww-step]';

/** Reads the manage view's plan-change step. Every stack puts it on the root, so one form suffices. */
export const MANAGE_VIEW_SELECTOR = '[data-ww-view="manage"]';

/** The six fields the registration form collects, by their `data-ww-field` names. */
export type RegistrationFieldName = 'firstName' | 'lastName' | 'username' | 'email' | 'password' | 'confirmPassword';

/** Every field name in the contract, in form order. */
export const REGISTRATION_FIELD_NAMES: readonly RegistrationFieldName[] = [
  'firstName',
  'lastName',
  'username',
  'email',
  'password',
  'confirmPassword',
];

/**
 * The React ids, kept as a fallback rather than as the contract.
 *
 * `data-ww-field` is the contract because an id cannot be one: a server-rendered stack suffixes its
 * ids with a per-instance component id (`ww-regsub-email-<cid>`), so no constant id selector can
 * exist there, and the other .NET stack's bare `id="email"` would collide with a host page's own.
 * React keeps these ids — hosts may already depend on them — so the helper accepts either.
 */
export const REGISTRATION_FIELD_IDS: Record<RegistrationFieldName, string> = {
  firstName: 'ww-reg-first',
  lastName: 'ww-reg-last',
  username: 'ww-reg-username',
  email: 'ww-reg-email',
  password: 'ww-reg-password',
  confirmPassword: 'ww-reg-confirm',
};

/**
 * Locate one registration field: the contract hook, or the React id.
 *
 * Comma-joined rather than ordered on purpose — in React both halves resolve to the SAME element,
 * and no stack renders one field under the contract hook and a different field under the id.
 */
export function registrationFieldSelector(field: RegistrationFieldName): string {
  return `[data-ww-field="${field}"], #${REGISTRATION_FIELD_IDS[field]}`;
}

/**
 * Submits the registration form.
 *
 * `button[type="submit"]` alone is not enough: a stack whose flow takes the card BEFORE creating the
 * account has no `<form>` to submit, so its control is a `type="button"` carrying the action hook.
 * Both are scoped to the register step, so a comma-joined list cannot pick up a stray submit.
 */
export const SUBMIT_REGISTER_SELECTOR = [
  '[data-ww-step="register"] [data-ww-action="submit-register"]',
  '[data-ww-step="register"] button[type="submit"]',
].join(', ');

/** The failed step's Try Again. */
export const SIGNUP_RETRY_SELECTOR = [
  '[data-ww-step="failed"] [data-ww-action="signup-retry"]',
  '[data-ww-step="failed"] .ww-btn-primary',
].join(', ');

/** The success panel's final button. */
export const SIGNUP_GET_STARTED_SELECTOR = [
  '.ww-signup-success [data-ww-action="signup-get-started"]',
  '.ww-signup-success .ww-btn-primary',
].join(', ');

/**
 * The failure text, in PREFERENCE order — the first entry that matches anything wins.
 *
 * Order matters here, unlike the lists above. The class fallback names a paragraph the processing
 * steps share, so on a stack that keeps every step panel in the DOM it matches the `creating` step's
 * "please wait" — which sits *earlier* in the document than the real error. A comma-joined list
 * would therefore report boilerplate as the cause of a genuine failure.
 */
export const SIGNUP_FAILURE_MESSAGE_SELECTORS: readonly string[] = [
  '[data-ww-step="failed"] [data-ww-error-message]',
  '.ww-signup-processing .ww-text-muted',
];

/**
 * Accept controls, comma-joined: one of them is the gate, and which one depends on the stack and on
 * how many disclaimers are pending.
 */
export const ACCEPT_SELECTOR = [
  '[data-ww-disclaimer-action="accept"]',
  '[data-ww-disclaimer-action="accept-all"]',
  '.ww-disclaimer-footer .ww-btn-primary',
  '.ww-disclaimer-actions .ww-btn-block',
].join(', ');

/**
 * The load-failure retry.
 *
 * The class-based fallback exists for builds that predate `data-ww-disclaimer-action`, and it must
 * not outlive them: on a stack whose Accept All sits in `.ww-disclaimer-actions` as a plain
 * `.ww-btn-primary`, it matched the Accept button — and because the loop tests RETRY first, the run
 * clicked Accept as if it were a retry ten times and then reported "the disclaimers never loaded"
 * about disclaimers that had loaded fine. `:not([data-ww-disclaimer-action])` confines the fallback
 * to markup that names no actions at all, which is exactly the case it was written for.
 */
export const RETRY_SELECTOR = [
  '[data-ww-disclaimer-action="retry"]',
  '.ww-disclaimer-actions .ww-btn-primary:not(.ww-btn-block):not([data-ww-disclaimer-action])',
].join(', ');

/**
 * The checkbox gate in front of Accept, in PREFERENCE order — the first entry that matches anything
 * is taken to be the gate, and the rest are not consulted.
 *
 * React has no gate (its Accept is disabled only while a request is in flight), so both miss and the
 * tick step does nothing. The .NET stacks disable Accept until every required box is ticked, and
 * Playwright's `click()` waits for actionability, so without a tick the helper hangs on the button
 * and eventually blames the server.
 *
 * Both entries NAME the box. There is deliberately no bare `input[type="checkbox"]` fallback: the
 * tick ticks every box the winning selector matches, so a loose last resort would opt the run into
 * whatever else the panel happens to host ("email me updates"), and — worse — would quietly cover
 * for a stack that never adopted the contract, which is the failure this contract exists to expose.
 * An unnamed gate fails loudly instead: Accept stays disabled, the click times out on it, and the
 * missing hook is named in the error. That is the better trade.
 */
export const DISCLAIMER_CHECK_SELECTORS: readonly string[] = [
  '[data-ww-disclaimer-check]',
  '.ww-disclaimer-accept input[type="checkbox"]',
];

/**
 * Which responses count as "the acceptance call", for the 429 back-off and the "refused by the
 * server, HTTP n" diagnostic.
 *
 * Both paths by default: the browser-side stacks POST `api/disclaimeracceptance/accept` (and
 * `…/accept-bulk`, which this also matches), while a server-rendered host that proxies acceptance
 * posts to its own `disclaimer-gate/accept`. A host on a third path overrides it through
 * `AcceptDisclaimersOptions.acceptResponsePattern`.
 *
 * On a stack that makes the call from the SERVER (Blazor Server, for instance) no pattern can help —
 * the browser sees no response at all, so the diagnostic degrades to the generic bounded-failure
 * message. That is documented rather than fixed, because it is not fixable from the browser.
 */
export const ACCEPT_RESPONSE_PATTERN = /(disclaimeracceptance|disclaimer-gate)\/accept/i;

/**
 * Does this response URL belong to the acceptance call?
 *
 * A function rather than a bare `pattern.test(url)` because `test()` on a `/g/` or `/y/` regex
 * advances its `lastIndex` between calls, so a caller who overrode the pattern with a global one
 * would see every other response ignored — a flake nobody would trace back to a regex flag.
 */
export function matchesAcceptResponse(url: string, pattern: RegExp = ACCEPT_RESPONSE_PATTERN): boolean {
  if (!pattern.global && !pattern.sticky) return pattern.test(url);
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(url);
}
