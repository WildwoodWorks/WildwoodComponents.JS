/**
 * The signup reducer: the pay-first order, what a registration token's grant skips, and the step
 * tokens that make a doubled effect or a duplicated callback a no-op.
 */
import { describe, it, expect } from 'vitest';
import {
  initialSignupState,
  resolveSignupRegistrationMode,
  signupTransition,
  type SignupEvent,
  type SignupMachineOptions,
  type SignupRegistrationMode,
  type SignupState,
} from '@wildwood/react-shared';

const openMode = resolveSignupRegistrationMode({ allowOpenRegistration: true, allowTokenRegistration: true });
const openNoTokenMode = resolveSignupRegistrationMode({ allowOpenRegistration: true, allowTokenRegistration: false });
const closedMode = resolveSignupRegistrationMode({ allowOpenRegistration: false, allowTokenRegistration: false });

function run(state: SignupState, events: SignupEvent[]): SignupState {
  return events.reduce(signupTransition, state);
}

/** Load the mode and the catalog and land on the register form. */
function loaded(options: SignupMachineOptions = {}, mode: SignupRegistrationMode = openMode): SignupState {
  return run(initialSignupState(options), [
    { type: 'INIT', signedIn: false },
    { type: 'MODE_LOADED', mode },
    {
      type: 'CATALOG_LOADED',
      names: { tiers: { 'tier-pro': 'Pro' }, addOns: { 'pack-a': 'Pack A', 'pack-b': 'Pack B' } },
    },
  ]);
}

describe('signupMachine', () => {
  it('walks a free plan: register, token, plan, create, disclaimers, done', () => {
    let state = loaded();
    expect(state.step).toBe('register');

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('token');

    state = signupTransition(state, { type: 'TOKEN_SKIPPED' });
    expect(state.step).toBe('plan');

    // A free plan needs no card, so the payment step is skipped.
    state = signupTransition(state, { type: 'PLAN_CHOSEN', tierId: 'tier-pro', requiresPayment: false });
    expect(state.step).toBe('packs');

    state = signupTransition(state, { type: 'PACKS_CHOSEN', addOnIds: [] });
    expect(state.step).toBe('creating');
    expect(state.token).toBeTruthy();

    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    expect(state.step).toBe('disclaimers');

    state = signupTransition(state, { type: 'DISCLAIMERS_ACCEPTED' });
    expect(state.step).toBe('done');
    expect(state.outcome).toEqual({
      userId: 'user-1',
      tier: { tierId: 'tier-pro', name: 'Pro', pricingId: undefined },
      packs: [],
      tokenGrant: undefined,
    });
  });

  it('a paid plan takes the card before the account exists', () => {
    let state = loaded();
    state = run(state, [
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'PACKS_CHOSEN', addOnIds: [] },
    ]);
    expect(state.step).toBe('payment');

    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-1' });
    expect(state.step).toBe('creating');
    expect(state.paymentTransactionId).toBe('txn-1');
  });

  it('a token grant skips the plan and the payment and drops the packs it already covers', () => {
    let state = loaded();
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    state = signupTransition(state, { type: 'TOKEN_CHECK_STARTED' });

    state = signupTransition(state, {
      type: 'TOKEN_ACCEPTED',
      token: state.token!,
      value: 'INVITE-1',
      grant: { tierId: 'tier-pro', pricingId: 'atp-1', addOnIds: ['pack-a'], featureCodes: ['DOCUMENTS'] },
    });
    // Straight past plan AND payment: the token issuer is paying.
    expect(state.step).toBe('packs');

    state = signupTransition(state, { type: 'PACKS_CHOSEN', addOnIds: ['pack-a', 'pack-b'] });
    expect(state.packsToBuy).toEqual(['pack-b']);
    expect(state.step).toBe('creating');

    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    // The extra pack still has to be bought once the account is signed in.
    expect(state.step).toBe('packCheckout');

    state = signupTransition(state, {
      type: 'PACK_CHECKOUT_FINISHED',
      token: state.token!,
      packs: [{ addOnId: 'pack-b', name: 'Pack B', status: 'active' }],
    });
    expect(state.step).toBe('done');
    expect(state.outcome?.packs).toEqual([
      { addOnId: 'pack-a', name: 'Pack A', status: 'granted' },
      { addOnId: 'pack-b', name: 'Pack B', status: 'active' },
    ]);
    expect(state.outcome?.tier).toEqual({ tierId: 'tier-pro', name: 'Pro', pricingId: 'atp-1' });
    expect(state.outcome?.tokenGrant?.featureCodes).toEqual(['DOCUMENTS']);
  });

  it("tokenMode 'required' skips the packs as well", () => {
    const inviteMode = resolveSignupRegistrationMode(null, { tokenMode: 'required' });
    let state = loaded({ tokenMode: 'required' }, inviteMode);
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('token');

    // A required token cannot be skipped.
    expect(signupTransition(state, { type: 'TOKEN_SKIPPED' })).toBe(state);

    state = signupTransition(state, { type: 'TOKEN_CHECK_STARTED' });
    state = signupTransition(state, {
      type: 'TOKEN_ACCEPTED',
      token: state.token!,
      value: 'INVITE-1',
      grant: { tierId: 'tier-pro', addOnIds: [], featureCodes: [] },
    });
    expect(state.step).toBe('creating');
  });

  it("tokenMode 'required' skips the plan even when the token carries no plan", () => {
    const inviteMode = resolveSignupRegistrationMode(null, { tokenMode: 'required' });
    let state = loaded({ tokenMode: 'required' }, inviteMode);
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_CHECK_STARTED' }]);
    state = signupTransition(state, { type: 'TOKEN_ACCEPTED', token: state.token!, value: 'INVITE-2' });
    // Redeeming an invite is "take what the invite gives", not a shopping trip.
    expect(state.step).toBe('creating');
  });

  it('a plan the link already chose takes the plan step out of the flow', () => {
    // The catalog vetted the link's plan before the form opened.
    let state = run(initialSignupState({ packSelection: 'none' }), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openNoTokenMode },
      { type: 'SELECTION_RESOLVED', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'CATALOG_LOADED', names: { tiers: { 'tier-pro': 'Pro' } } },
    ]);
    expect(state.step).toBe('register');
    expect(state.planPreset).toBe(true);

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    // Straight to the card: the plan was chosen on the pricing page, and it is a paid one.
    expect(state.step).toBe('payment');
    expect(state.selection).toEqual({ tierId: 'tier-pro', pricingId: 'atp-1', addOnIds: [] });

    // ... and "change plan" is still a way back to the grid.
    state = signupTransition(state, { type: 'GO_TO', step: 'plan' });
    expect(state.step).toBe('plan');
  });

  it('sends a plan changed before the form is filled in back to the form, not onward', () => {
    // A signup link preselected a plan, and the visitor pressed "change plan" before typing.
    let state = run(initialSignupState({ packSelection: 'none' }), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openNoTokenMode },
      { type: 'SELECTION_RESOLVED', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'CATALOG_LOADED', names: { tiers: { 'tier-pro': 'Pro', 'tier-free': 'Starter' } } },
      { type: 'GO_TO', step: 'plan' },
    ]);
    expect(state.step).toBe('plan');

    // A free plan: without the gate this would have gone straight to `creating` with no details.
    state = signupTransition(state, { type: 'PLAN_CHOSEN', tierId: 'tier-free', requiresPayment: false });
    expect(state.step).toBe('register');
    expect(state.selection.tierId).toBe('tier-free');
    expect(state.formSubmitted).toBe(false);

    // The form now finishes the signup, and the plan step is not asked again.
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('creating');
    expect(state.selection.tierId).toBe('tier-free');
  });

  it('sends a paid plan changed before the form is filled in back to the form, not to a card', () => {
    let state = run(initialSignupState({ packSelection: 'none' }), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openNoTokenMode },
      { type: 'SELECTION_RESOLVED', tierId: 'tier-free', requiresPayment: false },
      { type: 'CATALOG_LOADED', names: { tiers: { 'tier-pro': 'Pro' } } },
      { type: 'GO_TO', step: 'plan' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
    ]);
    // No card may be asked for before the form: a payment taken there has no account to attach to.
    expect(state.step).toBe('register');
    expect(state.planRequiresPayment).toBe(true);

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('payment');
  });

  it('never reaches payment or creating from a pack chosen before the form', () => {
    const state = run(initialSignupState(), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openNoTokenMode },
      { type: 'SELECTION_RESOLVED', tierId: 'tier-pro', requiresPayment: true },
      { type: 'CATALOG_LOADED' },
      { type: 'GO_TO', step: 'packs' },
      { type: 'PACKS_CHOSEN', addOnIds: ['pack-a'] },
    ]);
    expect(state.step).toBe('register');
    expect(state.packsToBuy).toEqual(['pack-a']);
  });

  it('carries the packs the link asked for into the checkout without a pack step', () => {
    let state = run(initialSignupState({ packSelection: 'none' }), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openNoTokenMode },
      { type: 'SELECTION_RESOLVED', tierId: 'tier-pro', addOnIds: ['pack-a'], requiresPayment: false },
      { type: 'CATALOG_LOADED', names: { addOns: { 'pack-a': 'Pack A' } } },
    ]);

    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('creating');
    expect(state.packsToBuy).toEqual(['pack-a']);
  });

  it('refuses a selection once the form has been submitted', () => {
    const state = run(loaded(), [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }]);
    // A catalog reloading underneath must not rewrite what the visitor is buying.
    expect(signupTransition(state, { type: 'SELECTION_RESOLVED', tierId: 'tier-other' })).toBe(state);
  });

  it("planSelection 'skip' goes past the plan step", () => {
    let state = loaded({ planSelection: 'skip', packSelection: 'none' });
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    state = signupTransition(state, { type: 'TOKEN_SKIPPED' });
    expect(state.step).toBe('creating');
  });

  it('skips the token step when the app offers no token path', () => {
    let state = loaded({}, openNoTokenMode);
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    expect(state.step).toBe('plan');
  });

  it('shows the closed panel when registration is off', () => {
    const state = loaded({}, closedMode);
    expect(state.step).toBe('closed');
  });

  it('ignores a result carrying a stale step token', () => {
    let state = loaded({ planSelection: 'skip', packSelection: 'none' });
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_SKIPPED' }]);
    expect(state.step).toBe('creating');
    const stale = state.token!;

    // StrictMode re-runs the effect: the step is re-entered with a new token.
    state = signupTransition(state, { type: 'GO_TO', step: 'register' });
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_SKIPPED' }]);
    const fresh = state.token!;
    expect(fresh).not.toBe(stale);

    const ignored = signupTransition(state, { type: 'ACCOUNT_CREATED', token: stale, userId: 'ghost' });
    expect(ignored).toBe(state);
    expect(ignored.userId).toBe('');

    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: fresh, userId: 'user-1' });
    expect(state.step).toBe('disclaimers');
  });

  it('ignores a duplicated result event', () => {
    let state = loaded({ planSelection: 'skip', packSelection: 'none' });
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_SKIPPED' }]);
    const token = state.token!;

    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token, userId: 'user-1' });
    expect(state.step).toBe('disclaimers');

    // The same callback firing twice must not advance anything.
    const again = signupTransition(state, { type: 'ACCOUNT_CREATED', token, userId: 'user-2' });
    expect(again).toBe(state);
    expect(again.userId).toBe('user-1');
  });

  it('latches "already signed in" at the first INIT only', () => {
    let state = initialSignupState();
    expect(state.alreadySignedInLatched).toBe(false);

    state = signupTransition(state, { type: 'INIT', signedIn: false });
    expect(state.initialized).toBe(true);
    expect(state.alreadySignedInLatched).toBe(false);

    // The visitor logs in mid-flow; that is not "you were already signed in".
    const after = signupTransition(state, { type: 'INIT', signedIn: true });
    expect(after).toBe(state);
    expect(after.alreadySignedInLatched).toBe(false);
  });

  it('a failed account creation can be retried from the same step', () => {
    let state = loaded({ planSelection: 'skip', packSelection: 'none' });
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_SKIPPED' }]);

    state = signupTransition(state, { type: 'ACCOUNT_FAILED', token: state.token!, message: 'Email already in use' });
    expect(state.step).toBe('failed');
    expect(state.error).toBe('Email already in use');
    expect(state.retryFrom).toBe('creating');

    state = signupTransition(state, { type: 'RETRY' });
    expect(state.step).toBe('creating');
    expect(state.error).toBeNull();
  });

  it('a rejected token is a form error, not a failed flow', () => {
    let state = loaded();
    state = signupTransition(state, { type: 'REGISTER_SUBMITTED', email: 'a@example.com' });
    state = signupTransition(state, { type: 'TOKEN_CHECK_STARTED' });
    state = signupTransition(state, { type: 'TOKEN_REJECTED', token: state.token!, message: 'That token has expired' });

    expect(state.step).toBe('token');
    expect(state.tokenError).toBe('That token has expired');
    expect(state.tokenChecking).toBe(false);
  });
});
