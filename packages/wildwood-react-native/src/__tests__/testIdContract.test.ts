/**
 * The identifier contract: the strings a test plan drives this package by.
 *
 * The same plan is meant to run against React, Blazor, Razor, Swift and this package - `data-ww-*`
 * on the web, `accessibilityIdentifier` on Swift, `testID` here - so the strings are the contract and
 * they are not this stack's to choose. What IS this stack's is where they sit, because React Native
 * gives an element one `testID` where the web gives it a bag of attributes, and three answers that
 * shared one attribute used to overwrite each other.
 *
 * This package ships no component renderer under vitest, so the rules are pure functions and the
 * source guards check the views actually hang them where the functions say.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlanChangeStep } from '@wildwood/react-shared';
import { wwViewTestIds } from '../components/registrationSubscription/testIds';
import {
  signupBody,
  signupStepTestId,
  signupStoreVariantTestId,
  type SignupBody,
} from '../components/registrationSubscription/views/signupViewModel';

/** Every body the signup view can render, so the rules below are answered for all of them. */
const SIGNUP_BODIES: SignupBody[] = [
  'loading',
  'closed',
  'register',
  'token',
  'plan',
  'packs',
  'payment',
  'creating',
  'disclaimers',
  'packCheckout',
  'failed',
  'success',
  'signedIn',
  'storePayment',
  'storeUnavailable',
];

/** Every step the plan change the manage view hosts can be on. */
const PLAN_CHANGE_STEPS: PlanChangeStep[] = [
  'idle',
  'previewing',
  'confirm',
  'collectingPayment',
  'changing',
  'authenticating',
  'completing',
  'done',
  'failed',
];

// ── A host's own testID ────────────────────────────────────────────────────────

describe("a host's own testID", () => {
  it('names the mount without taking the step hook off the screen', () => {
    // `<RegistrationSubscriptionSignup testID="checkout-signup" />` is the natural thing to write on
    // a screen that mounts more than one Wildwood surface. It used to replace the step hook with
    // that constant, and a suite waiting for `payment` then waited until it timed out - a failure
    // that reads as a component hanging rather than as a locator that moved.
    const ids = wwViewTestIds('signup', 'checkout-signup', signupStepTestId('payment'));
    expect(ids.host).toBe('checkout-signup');
    expect(ids.step).toBe('payment');
    expect(ids.view).toBe('signup');
  });

  it('changes nothing about the hooks, whether the host named its mount or not', () => {
    const named = wwViewTestIds('manage', 'billing-screen', 'collectingPayment');
    const anonymous = wwViewTestIds('manage', undefined, 'collectingPayment');
    expect(named.step).toBe(anonymous.step);
    expect(named.view).toBe(anonymous.view);
    expect(anonymous.host).toBeUndefined();
  });

  it('leaves the step element unnamed at rest instead of answering to the view name twice', () => {
    // `getByTestId('manage')` has to resolve to one element. Repeating the view's name on the step
    // element whenever no step is running would make every read of it ambiguous.
    const resting = wwViewTestIds('manage', 'billing-screen', '');
    expect(resting.step).toBeUndefined();
    expect(resting.view).toBe('manage');
  });
});

// ── The payment step on a store-billed device ──────────────────────────────────

describe('a store-billed device', () => {
  /** At the card step of a signup on a device the app bills through its store. */
  const paying = {
    step: 'payment',
    alreadySignedIn: false,
    hasPlan: true,
    formSubmitted: true,
    storeOnly: true,
  } as const;

  it('reports `payment`, the step id every other stack reports there', () => {
    // The body is the store one - that is what decides which purchase UI mounts - but the step the
    // view REPORTS is the portable one. Neither the web nor Swift has a store body to report, so a
    // plan written once and pointed at all five waits for `payment` on every one of them.
    expect(signupBody({ ...paying, hasStoreProduct: true })).toBe('storePayment');
    expect(signupBody({ ...paying, hasStoreProduct: false })).toBe('storeUnavailable');

    expect(wwViewTestIds('signup', undefined, signupStepTestId('storePayment')).step).toBe('payment');
    expect(wwViewTestIds('signup', undefined, signupStepTestId('storeUnavailable')).step).toBe('payment');
    // The same id the card path reports, which is the whole point of reporting it.
    expect(signupStepTestId('payment')).toBe(signupStepTestId('storePayment'));
  });

  it('still says which of the two is on screen', () => {
    // A test that cares - one asserting the store sheet came up, or that a plan with no product
    // behind it says so instead - can still tell them apart. Losing that is what made replacing the
    // step id tempting in the first place.
    expect(signupStoreVariantTestId('storePayment')).toBe('store-payment');
    expect(signupStoreVariantTestId('storeUnavailable')).toBe('store-unavailable');
    expect(signupStoreVariantTestId('storePayment')).not.toBe(signupStoreVariantTestId('storeUnavailable'));
  });

  it('adds nothing on the card path, where `payment` already says everything', () => {
    for (const body of ['payment', 'register', 'packCheckout', 'success'] as const) {
      expect(signupStoreVariantTestId(body)).toBeUndefined();
    }
  });

  it('never reports a step the contract does not define', () => {
    // The step ids are the web's `data-ww-step` values plus nothing. `storePayment` and
    // `storeUnavailable` are bodies, not steps, and must never reach an element as one.
    const CONTRACT_STEPS = [
      '',
      'loading',
      'closed',
      'register',
      'token',
      'plan',
      'packs',
      'payment',
      'creating',
      'disclaimers',
      'packCheckout',
      'failed',
      'success',
    ];
    for (const body of SIGNUP_BODIES) {
      expect(CONTRACT_STEPS).toContain(signupStepTestId(body));
    }
  });
});

// ── The view names itself throughout ───────────────────────────────────────────

describe('the view names itself in every body it renders', () => {
  // Naming the surface only while it is idle is what the step-on-the-root arrangement did, and it
  // left `payment`, `failed` and `loading` - ids two Wildwood surfaces on one screen can both carry
  // - with nothing to say which of them they belong to.
  it.each(SIGNUP_BODIES)('signup, on the %s body', (body) => {
    const ids = wwViewTestIds('signup', 'host-id', signupStepTestId(body));
    expect(ids.view).toBe('signup');
    // And never the same string twice on one frame, whatever the body.
    expect(ids.step).not.toBe(ids.view);
    expect(ids.step).not.toBe(ids.host);
  });

  it.each(PLAN_CHANGE_STEPS)('manage, while a change is %s', (step) => {
    const ids = wwViewTestIds('manage', 'host-id', step === 'idle' ? '' : step);
    expect(ids.view).toBe('manage');
    expect(ids.step).not.toBe(ids.view);
  });

  it('pricing, which runs no flow and so reports no step', () => {
    expect(wwViewTestIds('pricing', 'host-id').view).toBe('pricing');
    expect(wwViewTestIds('pricing', 'host-id').step).toBeUndefined();
  });
});

// ── Source guards ──────────────────────────────────────────────────────────────

const VIEWS = resolve(dirname(fileURLToPath(import.meta.url)), '../components/registrationSubscription/views');

/** The code, without the comments - which quote the web's attributes on purpose. */
const readCode = (file: string) =>
  readFileSync(resolve(VIEWS, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SIGNUP = readCode('RegistrationSubscriptionSignup.tsx');
const MANAGE = readCode('RegistrationSubscriptionManage.tsx');
const PRICING = readCode('RegistrationSubscriptionPricing.tsx');

describe('the views hang the ids where the rules put them', () => {
  it('composes the host id rather than falling back to it', () => {
    // `testID={testID ?? wwTestId(...)}` is the shape that lost the hook: one attribute, two
    // answers, the host's winning silently.
    for (const source of [SIGNUP, MANAGE, PRICING]) {
      expect(source).not.toMatch(/testID=\{testID\s*\?\?/);
      expect(source).toContain('testID={ids.host}');
      expect(source).toContain('testID={ids.view}');
    }
  });

  it('encloses the step in the view, not the other way round', () => {
    // The order is the whole value of the view id. Step ids are bare - `payment`, `failed` - so on a
    // screen holding two Wildwood surfaces the enclosing element is the only thing that can tell
    // them apart, and `within(getByTestId('signup')).getByTestId('payment')` only reaches the step
    // while the view is its ancestor. Nested the other way the view scopes the CONTENT and leaves
    // the step read ambiguous, which reads as working until a second surface appears.
    //
    // Read structurally rather than by source order, because these files hold more than one frame
    // and a flat order would let one frame's view vouch for the next frame's step. For each element
    // carrying the step, the nearest id-bearing element ABOVE it and less indented is the one that
    // encloses it, and that has to be the view. This is a source guard because nothing in this
    // package renders: adding a renderer would mean react-native plus a testing-library plus a
    // preset, and the ./testing subpath is specified to take no such dependency.
    //
    // Reading indentation assumes each `testID={ids.X}` sits on the line of the tag that carries
    // it, which holds while those tags fit prettier's 120 columns - the longest is at 103 today. A
    // tag that gains enough props to reflow puts its attributes on their own lines, all indented
    // alike, and this would then be comparing attribute indent to attribute indent. If that day
    // comes, measure from the opening tag's line instead of the attribute's.
    for (const [name, source] of [
      ['signup', SIGNUP],
      ['manage', MANAGE],
    ] as const) {
      const lines = source.split('\n');
      const idOn = (line: string): string | null => line.match(/testID=\{ids\.(host|view|step)\}/)?.[1] ?? null;
      const indentOf = (line: string): number => line.length - line.trimStart().length;

      const steps = lines.map((line, i) => [line, i] as const).filter(([line]) => idOn(line) === 'step');
      expect(steps.length, `${name} carries a step id`).toBeGreaterThan(0);

      for (const [stepLine, stepIndex] of steps) {
        let enclosing: string | null = null;
        for (let i = stepIndex - 1; i >= 0; i--) {
          const id = idOn(lines[i]);
          if (id && indentOf(lines[i]) < indentOf(stepLine)) {
            enclosing = id;
            break;
          }
        }
        expect(enclosing, `${name}: the element enclosing the step at line ${stepIndex + 1}`).toBe('view');
      }
    }
  });

  it('renders the step body inside the step, so the store variant is under it too', () => {
    // The store variant sits on the payment body's own frame, which is built into `content` well
    // away from the frame that carries `ids.step`, so the indentation guard above cannot see it.
    // What actually puts it under the step is that `{content}` is rendered inside the step element
    // - pin that instead, which covers every body rather than just this one.
    const lines = SIGNUP.split('\n');
    const indentOf = (line: string): number => line.length - line.trimStart().length;

    // Both of the signup's frames carry a step. The disclaimers frame IS a body - it renders that
    // step's own JSX inline - and the other renders `{content}`, which is every remaining body. So
    // the claim is that exactly one step block renders `{content}`, not that the first one does.
    const blockAfter = (start: number): string => {
      const indent = indentOf(lines[start]);
      let closes = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() !== '' && indentOf(lines[i]) <= indent) {
          closes = i;
          break;
        }
      }
      return lines.slice(start + 1, closes).join('\n');
    };

    const stepBlocks = lines
      .map((line, i) => (/testID=\{ids\.step\}/.test(line) ? i : -1))
      .filter((i) => i >= 0)
      .map(blockAfter);

    expect(stepBlocks.length, 'the signup carries a step id on each frame').toBeGreaterThan(0);
    expect(stepBlocks.filter((block) => block.includes('{content}'))).toHaveLength(1);
    expect(SIGNUP.match(/testID=\{signupStoreVariantTestId\(body\)\}/g) ?? []).toHaveLength(1);
  });

  it('gives every frame the signup can return all three ids', () => {
    // The disclaimers step returns a frame of its own, so "the frame carries the ids" is not
    // something the JSX can be trusted to repeat: add a frame without them and these counts diverge.
    for (const id of ['host', 'step', 'view']) {
      expect(SIGNUP.match(new RegExp(`testID=\\{ids\\.${id}\\}`, 'g')) ?? []).toHaveLength(2);
    }
  });

  it('reports the portable step and names the store variant beside it', () => {
    expect(SIGNUP).toContain("wwViewTestIds('signup', testID, signupStepTestId(body))");
    expect(SIGNUP).toContain('testID={signupStoreVariantTestId(body)}');
    // The bodies themselves never reach an element as a step.
    expect(SIGNUP).not.toMatch(/testID=\{[^}]*storePayment/);
  });

  it('reports the plan change as the manage view step, and the view name in both its frames', () => {
    expect(MANAGE).toContain("wwViewTestIds('manage', testID, flow.step === 'idle' ? '' : flow.step)");
    // Two frames - the live one and the "an appId is required" notice - and both name the surface.
    expect(MANAGE.match(/testID=\{ids\.view\}/g) ?? []).toHaveLength(2);
    expect(MANAGE.match(/testID=\{ids\.host\}/g) ?? []).toHaveLength(2);
  });

  it('gives pricing no step element, because it has no step to put in one', () => {
    expect(PRICING).toContain("wwViewTestIds('pricing', testID)");
    expect(PRICING).not.toContain('ids.step');
  });
});
