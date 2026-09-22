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
import {
  wwFieldTestId,
  wwModalTestId,
  wwViewTestIds,
  type RegistrationFieldName,
} from '../components/registrationSubscription/testIds';
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

/**
 * The six fields the web names in `data-ww-field`, in form order.
 *
 * Restated rather than imported: `@wildwood/react` is not a dependency of this package and must not
 * become one. The list is `REGISTRATION_FIELD_NAMES` in `@wildwood/react/testing/selectors`, and the
 * names are the contract - a change on either side is a deliberate change to it, not a refactor.
 */
const WEB_REGISTRATION_FIELDS: RegistrationFieldName[] = [
  'firstName',
  'lastName',
  'username',
  'email',
  'password',
  'confirmPassword',
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
    // `getByTestId('signup')` has to resolve to one element. Repeating the view's name on the step
    // element whenever no step is running would make every read of it ambiguous.
    //
    // The signup view is the one that rests: its `signedIn` body is nothing running, and
    // `signupStepTestId` answers '' for it. The manage view never passes '' - see "the manage view
    // at rest" below, where the flow's own `idle` is the step and there is nothing to swallow.
    const resting = wwViewTestIds('signup', 'checkout-signup', signupStepTestId('signedIn'));
    expect(resting.step).toBeUndefined();
    expect(resting.view).toBe('signup');
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
    const ids = wwViewTestIds('manage', 'host-id', step);
    expect(ids.view).toBe('manage');
    expect(ids.step).toBe(step);
    expect(ids.step).not.toBe(ids.view);
  });

  it('pricing, which runs no flow and so reports no step', () => {
    expect(wwViewTestIds('pricing', 'host-id').view).toBe('pricing');
    expect(wwViewTestIds('pricing', 'host-id').step).toBeUndefined();
  });
});

// ── The sheets a view puts over itself ─────────────────────────────────────────

describe('a sheet is named under the attribute it comes from', () => {
  it('carries the web`s two `data-ww-modal` values, spelled as Swift spells them', () => {
    expect(wwModalTestId('packs')).toBe('modal:packs');
    expect(wwModalTestId('payment')).toBe('modal:payment');
  });

  it('keeps a sheet from answering to a step of the same name', () => {
    // This is what the prefix is FOR here, rather than tidiness: `packs` and `payment` are both
    // steps the signup flow reports, and a surface can have a sheet up while one of them is
    // running. Unprefixed, `getByTestId('payment')` would be two elements with different jobs.
    expect(wwModalTestId('packs')).not.toBe(signupStepTestId('packs'));
    expect(wwModalTestId('payment')).not.toBe(signupStepTestId('payment'));
  });
});

// ── The registration form's fields ─────────────────────────────────────────────

describe('the registration form names its fields', () => {
  it.each(WEB_REGISTRATION_FIELDS)('%s, by the name the web puts in `data-ww-field`', (field) => {
    expect(wwFieldTestId(field)).toBe(`field:${field}`);
  });

  it('gives the registration token a name the flow`s own vocabulary cannot claim', () => {
    // The seventh field is this contract's own: the web's token input carries an id and no
    // `data-ww-field`, so there was no string to match and `registrationToken` is the name the wire
    // format already uses. The flow reports a step called `token`, and the assertion below is what
    // keeps the two apart - not because they collide today (`registrationToken` is not `token`), but
    // because the prefix is what guarantees no field can ever be read as a step.
    expect(wwFieldTestId('registrationToken')).toBe('field:registrationToken');
    expect(wwFieldTestId('registrationToken')).not.toBe(signupStepTestId('token'));
  });
});

// ── Source guards ──────────────────────────────────────────────────────────────

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** One source file, without its comments - which quote the web's attributes on purpose. */
const readCode = (path: string) =>
  readFileSync(resolve(SRC, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const VIEWS = 'components/registrationSubscription/views';
const PARTS = 'components/registrationSubscription/parts';

const SIGNUP = readCode(`${VIEWS}/RegistrationSubscriptionSignup.tsx`);
const MANAGE = readCode(`${VIEWS}/RegistrationSubscriptionManage.tsx`);
const PRICING = readCode(`${VIEWS}/RegistrationSubscriptionPricing.tsx`);
const REGISTRATION = readCode('components/TokenRegistrationComponent.tsx');
const DISCLAIMER = readCode('components/DisclaimerComponent.tsx');
const CONSENT = readCode('components/ConsentComponent.tsx');
const ADD_ONS_PANEL = readCode('components/subscription/AddOnsPanel.tsx');
const PLAN_CHANGE_NOTICE = readCode(`${PARTS}/PlanChangeNotice.tsx`);
const PACK_PICKER = readCode(`${PARTS}/PackPicker.tsx`);
const PAYMENT_MODAL = readCode(`${PARTS}/PaymentModal.tsx`);

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
    expect(MANAGE).toContain("wwViewTestIds('manage', testID, flow.step)");
    // Two frames - the live one and the "an appId is required" notice - and both name the surface.
    expect(MANAGE.match(/testID=\{ids\.view\}/g) ?? []).toHaveLength(2);
    expect(MANAGE.match(/testID=\{ids\.host\}/g) ?? []).toHaveLength(2);
  });

  it('reports `idle` rather than swallowing it', () => {
    // The web's `ManageView` emits `data-ww-step={flow.step}` unconditionally and a React test
    // asserts `idle` specifically, so a plan written against the web waits for it here too. It is
    // safe to say because it is a string of its own: it is not the view's name, so nothing on the
    // frame answers to it twice. Swallowing it left a suite unable to tell "no change is running"
    // apart from "this build carries no step hook at all".
    expect(wwViewTestIds('manage', 'host-id', 'idle').step).toBe('idle');
    expect(MANAGE).not.toContain("flow.step === 'idle'");
  });

  it('gives pricing no step element, because it has no step to put in one', () => {
    expect(PRICING).toContain("wwViewTestIds('pricing', testID)");
    expect(PRICING).not.toContain('ids.step');
  });
});

describe('the components the signup view mounts carry their own hooks', () => {
  it('names every registration input and the submit', () => {
    // Without these a native signup cannot be driven at all: the form's only other distinguishing
    // marks are English placeholders, which is what the contract exists to stop a suite keying on.
    for (const field of [...WEB_REGISTRATION_FIELDS, 'registrationToken' as const]) {
      expect(REGISTRATION, field).toContain(`testID={wwFieldTestId('${field}')}`);
    }
    expect(REGISTRATION).toContain('testID="submit-register"');
  });

  it('carries the token field on both of its placements', () => {
    // The required-token step and the optional-token entry are the same field in two steps that
    // cannot both be mounted, so one id covers both - and a placement that lost it would leave the
    // token unreachable in exactly one of the two registration modes.
    expect(REGISTRATION.match(/wwFieldTestId\('registrationToken'\)/g) ?? []).toHaveLength(2);
  });

  it('names the three disclaimer controls', () => {
    // `disclaimer-accept` sits on a control rendered once per pending disclaimer, as on the web:
    // the id names the ROLE, so accepting them one at a time reads every card's control alike.
    for (const id of ['disclaimer-retry', 'disclaimer-accept', 'disclaimer-accept-all']) {
      expect(DISCLAIMER, id).toContain(`testID="${id}"`);
    }
  });
});

describe('the consent banner', () => {
  it('names itself and its accept-all, rather than only labelling them', () => {
    // `accessibilityLabel="Cookie consent"` is the banner's accessibility copy and is meant to be
    // translated; an identifier is not.
    expect(CONSENT).toContain('testID="consent-banner"');
    expect(CONSENT).toContain('testID="consent-accept-all"');
  });
});

describe('the manage surface`s own controls', () => {
  it('names the plan-change notice in both of its shapes, and both of its controls', () => {
    // Two shapes - the progress line and the alert - and a suite waiting for the notice is waiting
    // for the change to say something about itself, not for one particular shape of saying it.
    expect(PLAN_CHANGE_NOTICE.match(/testID="plan-change-notice"/g) ?? []).toHaveLength(2);
    expect(PLAN_CHANGE_NOTICE).toContain('testID="plan-change-retry"');
    expect(PLAN_CHANGE_NOTICE).toContain('testID="plan-change-dismiss"');
  });

  it('names the control that opens the pack picker', () => {
    expect(ADD_ONS_PANEL).toContain('testID="add-packs"');
  });

  it('builds both sheet ids through the helper, so the prefix is spelled once', () => {
    expect(PACK_PICKER).toContain("testID={wwModalTestId('packs')}");
    expect(PAYMENT_MODAL).toContain("testID={wwModalTestId('payment')}");
    // The pre-rename spellings are gone from both sheets, so nothing answers to them any more.
    for (const source of [PACK_PICKER, PAYMENT_MODAL]) {
      expect(source).not.toContain('testID="packs-modal"');
      expect(source).not.toContain('testID="payment-modal"');
    }
  });

  it('leaves the packs sheet`s Continue out of the modal namespace', () => {
    // It is a button inside the sheet, not a sheet: `modal:` names a modal and its value space is
    // the web's two `data-ww-modal` values, so `modal:packs-continue` would assert a third sheet by
    // that name. No other stack has a counterpart for this control, so there is no contract string
    // to match and renaming it would break hosts for nothing.
    expect(PACK_PICKER).toContain('testID="packs-modal-continue"');
  });
});
