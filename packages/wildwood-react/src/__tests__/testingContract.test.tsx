/**
 * The DOM contract `@wildwood/react/testing` keys on.
 *
 * The drivers themselves need a browser, so what is pinned here is everything that decides WHICH
 * element they reach: the selector constants, the field-name map, the accept-response pattern — and,
 * because a selector is only as good as the markup it is aimed at, that React actually emits the
 * hooks it is the reference implementation of.
 *
 * Each selector case is written against a small hand-built DOM shaped like the stack it is there
 * for. That is the point of the exercise: several of these selectors were widened because a
 * server-rendered stack's markup is legitimately different, and a string comparison would not have
 * caught the bug that prompted the change.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { clearPublicCatalogCache } from '@wildwood/react-shared';
import { createWrapper } from './testUtils.js';
import { signupClient, stepOf, submitRegistration } from './signupHarness.js';
import {
  ACCEPT_RESPONSE_PATTERN,
  ACCEPT_SELECTOR,
  DISCLAIMER_CHECK_SELECTORS,
  MANAGE_VIEW_SELECTOR,
  REGISTRATION_FIELD_IDS,
  REGISTRATION_FIELD_NAMES,
  RETRY_SELECTOR,
  SIGNUP_FAILURE_MESSAGE_SELECTORS,
  SIGNUP_GET_STARTED_SELECTOR,
  SIGNUP_RETRY_SELECTOR,
  SIGNUP_STEP_SELECTOR,
  SUBMIT_REGISTER_SELECTOR,
  matchesAcceptResponse,
  registrationFieldSelector,
} from '../testing/index.js';

const { RegistrationSubscriptionSignup } = await import('../index.js');

/** A detached tree to run selectors against, so no case can see another's markup. */
function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/** Render the signup view over a fully stubbed server. */
function renderSignup(stubs = signupClient()) {
  const view = render(<RegistrationSubscriptionSignup planSelection="skip" />, {
    wrapper: createWrapper(stubs.client),
  });
  return { ...view, stubs };
}

beforeEach(() => {
  clearPublicCatalogCache();
});

afterEach(() => {
  cleanup();
  clearPublicCatalogCache();
});

// ── The signup step reader ─────────────────────────────────────────────────────

describe('SIGNUP_STEP_SELECTOR', () => {
  it('reads the step off the child, the way React and Blazor render it', () => {
    const root = dom('<div data-ww-view="signup"><div data-ww-step="register"></div></div>');

    expect(root.querySelector(SIGNUP_STEP_SELECTOR)?.getAttribute('data-ww-step')).toBe('register');
  });

  it('prefers the root when a stack mirrors the active step onto it', () => {
    // A server-rendered stack keeps every panel in the DOM and toggles `hidden`, so the only
    // readable value is the one mirrored onto the root. The root precedes its children in document
    // order, which is what `.first()` and `querySelector` both resolve by.
    const root = dom(`
      <div data-ww-view="signup" data-ww-step="plan">
        <div data-ww-step="loading" hidden></div>
        <div data-ww-step="register" hidden></div>
        <div data-ww-step="plan"></div>
      </div>
    `);

    expect(root.querySelector(SIGNUP_STEP_SELECTOR)?.getAttribute('data-ww-step')).toBe('plan');
    // Why the reader had to be widened: the descendant-only form reads the first panel in the
    // document, which on that stack is `loading` for the entire life of the page.
    expect(root.querySelector('[data-ww-view="signup"] [data-ww-step]')?.getAttribute('data-ww-step')).toBe('loading');
  });

  it('reads nothing when the view renders no step at all', () => {
    // The already-signed-in branch, in every stack. `signupStep()` answers null there.
    const root = dom('<div data-ww-view="signup"><p>You are already signed in.</p></div>');

    expect(root.querySelector(SIGNUP_STEP_SELECTOR)).toBeNull();
  });
});

describe('MANAGE_VIEW_SELECTOR', () => {
  it('reads the step off the manage root, which every stack puts there', () => {
    const root = dom('<div data-ww-view="manage" data-ww-step="previewing"></div>');

    expect(root.querySelector(MANAGE_VIEW_SELECTOR)?.getAttribute('data-ww-step')).toBe('previewing');
  });
});

// ── The registration form ──────────────────────────────────────────────────────

describe('registrationFieldSelector', () => {
  it('names the six fields the contract defines', () => {
    expect([...REGISTRATION_FIELD_NAMES]).toEqual([
      'firstName',
      'lastName',
      'username',
      'email',
      'password',
      'confirmPassword',
    ]);
    expect(Object.keys(REGISTRATION_FIELD_IDS).sort()).toEqual([...REGISTRATION_FIELD_NAMES].sort());
  });

  it('finds a field by its contract hook when the id is per-instance', () => {
    // A server-rendered stack suffixes ids with its component id, so only the attribute is constant.
    const root = dom('<input id="ww-regsub-email-7f3a" data-ww-field="email" />');

    expect(root.querySelector(registrationFieldSelector('email'))?.id).toBe('ww-regsub-email-7f3a');
  });

  it('still finds a field by the React id alone, for hosts on an older build', () => {
    const root = dom(REGISTRATION_FIELD_NAMES.map((name) => `<input id="${REGISTRATION_FIELD_IDS[name]}" />`).join(''));

    for (const name of REGISTRATION_FIELD_NAMES) {
      expect(root.querySelector(registrationFieldSelector(name))?.id).toBe(REGISTRATION_FIELD_IDS[name]);
    }
  });

  it('resolves to one element when a field carries both', () => {
    const root = dom('<input id="ww-reg-email" data-ww-field="email" />');

    expect(root.querySelectorAll(registrationFieldSelector('email'))).toHaveLength(1);
  });
});

describe('SUBMIT_REGISTER_SELECTOR', () => {
  it('accepts the action hook on a button that is not a submit', () => {
    // The pay-before-the-account order leaves no `<form>` to submit, so the control is a
    // `type="button"`. Without the hook there is nothing structural left to click.
    const root = dom(
      '<div data-ww-step="register"><button type="button" data-ww-action="submit-register">Continue</button></div>',
    );

    expect(root.querySelectorAll(SUBMIT_REGISTER_SELECTOR)).toHaveLength(1);
  });

  it('still accepts a plain submit inside the register step', () => {
    const root = dom('<div data-ww-step="register"><button type="submit">Create Account</button></div>');

    expect(root.querySelectorAll(SUBMIT_REGISTER_SELECTOR)).toHaveLength(1);
  });

  it('ignores a submit outside the register step', () => {
    const root = dom('<div data-ww-step="plan"><button type="submit">Choose</button></div>');

    expect(root.querySelectorAll(SUBMIT_REGISTER_SELECTOR)).toHaveLength(0);
  });
});

// ── Disclaimers ────────────────────────────────────────────────────────────────

describe('RETRY_SELECTOR', () => {
  it('matches the load-failure retry by its action hook', () => {
    const root = dom(
      '<div class="ww-disclaimer-actions"><button class="ww-btn ww-btn-primary" data-ww-disclaimer-action="retry">Try again</button></div>',
    );

    expect(root.querySelectorAll(RETRY_SELECTOR)).toHaveLength(1);
  });

  it('does NOT match an Accept All that shares the retry container', () => {
    // The bug this guards: a stack whose Accept All is a plain `.ww-btn-primary` in
    // `.ww-disclaimer-actions` matched the retry fallback, and because the loop tests RETRY first it
    // clicked Accept ten times and then reported "the disclaimers never loaded".
    const root = dom(
      '<div class="ww-disclaimer-actions"><button class="ww-btn ww-btn-primary" data-ww-disclaimer-action="accept-all">Accept All</button></div>',
    );

    expect(root.querySelectorAll(RETRY_SELECTOR)).toHaveLength(0);
    expect(root.querySelectorAll(ACCEPT_SELECTOR)).toHaveLength(1);
  });

  it('keeps working on a build that names no actions at all', () => {
    const root = dom('<div class="ww-disclaimer-actions"><button class="ww-btn ww-btn-primary">Retry</button></div>');

    expect(root.querySelectorAll(RETRY_SELECTOR)).toHaveLength(1);
  });

  it('leaves an Accept All that carries ww-btn-block alone', () => {
    const root = dom(
      '<div class="ww-disclaimer-actions"><button class="ww-btn ww-btn-primary ww-btn-block">Accept All (2)</button></div>',
    );

    expect(root.querySelectorAll(RETRY_SELECTOR)).toHaveLength(0);
    expect(root.querySelectorAll(ACCEPT_SELECTOR)).toHaveLength(1);
  });
});

describe('DISCLAIMER_CHECK_SELECTORS', () => {
  it('tries the named gate before any broader guess', () => {
    expect(DISCLAIMER_CHECK_SELECTORS[0]).toBe('[data-ww-disclaimer-check]');
  });

  it('leaves an unnamed box alone rather than guessing at it', () => {
    // A panel that never adopted the contract, hosting one box the run must not tick. No entry may
    // match it: a bare input[type=checkbox] last resort would opt the run into the newsletter AND
    // would hide the missing hook, which is the whole thing this contract is here to surface.
    const root = dom(`
      <div class="ww-signup-disclaimers">
        <input type="checkbox" class="ww-newsletter-optin" />
        <button class="ww-btn ww-btn-primary">Accept</button>
      </div>
    `);

    for (const selector of DISCLAIMER_CHECK_SELECTORS) {
      expect(root.querySelectorAll(selector)).toHaveLength(0);
    }
  });

  it('picks only the named box when one exists', () => {
    const root = dom(`
      <div class="ww-signup-disclaimers">
        <input type="checkbox" data-ww-disclaimer-check />
        <input type="checkbox" class="ww-newsletter-optin" />
      </div>
    `);

    const named = root.querySelectorAll(DISCLAIMER_CHECK_SELECTORS[0]);
    expect(named).toHaveLength(1);
    expect(named[0].getAttribute('class')).toBeNull();
  });

  it('matches nothing in a scope with no checkboxes, so the tick step is a no-op', () => {
    // React's disclaimer panel: Accept is disabled only while a request is in flight, never gated.
    const root = dom('<div class="ww-signup-disclaimers"><button class="ww-btn ww-btn-primary">Accept</button></div>');

    for (const selector of DISCLAIMER_CHECK_SELECTORS) {
      expect(root.querySelectorAll(selector)).toHaveLength(0);
    }
  });
});

describe('matchesAcceptResponse', () => {
  it('matches the direct API path, its bulk variant and the proxied one', () => {
    expect(matchesAcceptResponse('https://api.example.com/api/disclaimeracceptance/accept')).toBe(true);
    expect(matchesAcceptResponse('https://api.example.com/api/disclaimeracceptance/accept-bulk')).toBe(true);
    expect(matchesAcceptResponse('https://app.example.com/disclaimer-gate/accept')).toBe(true);
  });

  it('ignores everything else, so an unrelated 429 is not reported as a refused acceptance', () => {
    expect(matchesAcceptResponse('https://api.example.com/api/auth/login')).toBe(false);
    expect(matchesAcceptResponse('https://api.example.com/api/disclaimers/pending/app-1')).toBe(false);
  });

  it('honours a host pattern for a proxy of its own', () => {
    expect(matchesAcceptResponse('https://app.example.com/terms/ok', /terms\/ok/)).toBe(true);
    expect(matchesAcceptResponse('https://app.example.com/disclaimer-gate/accept', /terms\/ok/)).toBe(false);
  });

  it('is stateless even when the host pattern carries a global flag', () => {
    // `test()` on a /g/ regex advances lastIndex, so a naive call would answer false every other
    // time — a flake nobody would trace back to a regex flag.
    const globalPattern = /disclaimer-gate\/accept/g;
    const url = 'https://app.example.com/disclaimer-gate/accept';

    expect(matchesAcceptResponse(url, globalPattern)).toBe(true);
    expect(matchesAcceptResponse(url, globalPattern)).toBe(true);
  });

  it('defaults to a pattern covering both paths', () => {
    expect(ACCEPT_RESPONSE_PATTERN.test('/api/disclaimeracceptance/accept')).toBe(true);
    expect(ACCEPT_RESPONSE_PATTERN.test('/disclaimer-gate/accept')).toBe(true);
  });
});

// ── The failure message ────────────────────────────────────────────────────────

describe('SIGNUP_FAILURE_MESSAGE_SELECTORS', () => {
  const allPanels = () =>
    dom(`
      <div data-ww-view="signup" data-ww-step="failed">
        <div class="ww-signup-step ww-signup-processing" data-ww-step="creating" hidden>
          <p class="ww-text-muted">This will only take a moment.</p>
        </div>
        <div class="ww-signup-step ww-signup-processing" data-ww-step="failed">
          <p class="ww-text-muted" data-ww-error-message>Registration is not allowed for this app</p>
        </div>
      </div>
    `);

  it('puts the error hook first', () => {
    expect(SIGNUP_FAILURE_MESSAGE_SELECTORS[0]).toBe('[data-ww-step="failed"] [data-ww-error-message]');
  });

  it('reads the real error where every step panel is in the DOM at once', () => {
    expect(allPanels().querySelector(SIGNUP_FAILURE_MESSAGE_SELECTORS[0])?.textContent).toBe(
      'Registration is not allowed for this app',
    );
  });

  it('must stay ORDERED: joining the list would report the boilerplate instead', () => {
    // A CSS selector list resolves in document order, and the `creating` panel's "please wait" sits
    // earlier than the real error. This is why the driver tries the entries one at a time.
    expect(allPanels().querySelector(SIGNUP_FAILURE_MESSAGE_SELECTORS.join(', '))?.textContent).toBe(
      'This will only take a moment.',
    );
  });

  it('falls back to the shared class for a build with no error hook', () => {
    const root = dom(
      '<div class="ww-signup-step ww-signup-processing" data-ww-step="failed"><p class="ww-text-muted">Failed to fetch</p></div>',
    );

    expect(root.querySelector(SIGNUP_FAILURE_MESSAGE_SELECTORS[0])).toBeNull();
    expect(root.querySelector(SIGNUP_FAILURE_MESSAGE_SELECTORS[1])?.textContent).toBe('Failed to fetch');
  });
});

// ── What React actually renders ────────────────────────────────────────────────

describe('the React markup honours the contract', () => {
  it('names every registration field and keeps its id', async () => {
    const { container } = renderSignup();
    await screen.findByText('Create Your Account');

    for (const name of REGISTRATION_FIELD_NAMES) {
      const byHook = container.querySelector(`[data-ww-field="${name}"]`);
      const byId = container.querySelector(`#${REGISTRATION_FIELD_IDS[name]}`);
      expect(byHook).toBeTruthy();
      // The id is kept, not replaced: hosts may already depend on it.
      expect(byId).toBe(byHook);
    }
  });

  it('names the register step submit without giving up type="submit"', async () => {
    const { container } = renderSignup();
    await screen.findByText('Create Your Account');

    const submit = container.querySelector<HTMLButtonElement>(SUBMIT_REGISTER_SELECTOR);
    expect(submit?.getAttribute('data-ww-action')).toBe('submit-register');
    expect(submit?.type).toBe('submit');
    // One element, not two: the hook and the fallback are on the same button.
    expect(container.querySelectorAll(SUBMIT_REGISTER_SELECTOR)).toHaveLength(1);
  });

  it('carries exactly one readable signup step, so the reader cannot pick the wrong one', async () => {
    const { container } = renderSignup();
    await screen.findByText('Create Your Account');

    expect(container.querySelectorAll(SIGNUP_STEP_SELECTOR)).toHaveLength(1);
    expect(container.querySelector(SIGNUP_STEP_SELECTOR)?.getAttribute('data-ww-step')).toBe('register');
    // React puts the step on a child, never on the root — the widened reader must not change that.
    expect(container.querySelector('[data-ww-view="signup"]')?.hasAttribute('data-ww-step')).toBe(false);
  });

  it('names the failure message and both failure-step actions', async () => {
    const stubs = signupClient();
    stubs.registerOpen.mockRejectedValue(new Error('Registration is not allowed for this app'));
    const { container } = renderSignup(stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('failed'));

    expect(container.querySelector(SIGNUP_FAILURE_MESSAGE_SELECTORS[0])?.textContent).toBe(
      'Registration is not allowed for this app',
    );
    expect(container.querySelector(SIGNUP_RETRY_SELECTOR)?.textContent).toBe('Try Again');
    expect(container.querySelector('[data-ww-action="signup-start-over"]')?.textContent).toBe('Start Over');
  });

  it('names the success panel button', async () => {
    const { container } = renderSignup();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    const getStarted = container.querySelector<HTMLButtonElement>(SIGNUP_GET_STARTED_SELECTOR);
    expect(getStarted?.getAttribute('data-ww-action')).toBe('signup-get-started');
    expect(getStarted?.textContent).toBe('Get Started');
  });
});
