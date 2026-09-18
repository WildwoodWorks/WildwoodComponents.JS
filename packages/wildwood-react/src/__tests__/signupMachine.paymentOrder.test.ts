/**
 * The account-first signup order.
 *
 * `paymentOrder: 'afterAccount'` is what the store-billed stacks want: a StoreKit or Play purchase
 * that succeeds before a registration that then fails strands a paid subscription with no account
 * to attach it to, which is worse than an account with no plan. So the card moves out of the form's
 * order and sits between the account and the disclaimers — and a customer who walks away from it
 * still finishes the signup, with the plan's activation pending, said in so many words.
 *
 * The default order is asserted by `signupMachine.test.ts`, unchanged. What is defended here is
 * that the option moves the step and NOTHING else: the same skip rules decide whether there is a
 * card to take at all, and the same step tokens still throw stale results away.
 */
import { describe, it, expect } from 'vitest';
import {
  initialSignupState,
  issueStepToken,
  resolveSignupRegistrationMode,
  signupTransition,
  type SignupEvent,
  type SignupMachineOptions,
  type SignupState,
} from '@wildwood/react-shared';

const openMode = resolveSignupRegistrationMode({ allowOpenRegistration: true, allowTokenRegistration: true });

function run(state: SignupState, events: SignupEvent[]): SignupState {
  return events.reduce(signupTransition, state);
}

/** Load the mode and the catalog and land on the register form. */
function loaded(options: SignupMachineOptions = {}): SignupState {
  return run(initialSignupState({ paymentOrder: 'afterAccount', ...options }), [
    { type: 'INIT', signedIn: false },
    { type: 'MODE_LOADED', mode: openMode },
    { type: 'CATALOG_LOADED', names: { tiers: { 'tier-pro': 'Pro' }, addOns: { 'pack-a': 'Pack A' } } },
  ]);
}

/** Walk the form with a paid plan chosen, which in this order ends at `creating`. */
function toCreating(options: SignupMachineOptions = {}): SignupState {
  return run(loaded(options), [
    { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
    { type: 'TOKEN_SKIPPED' },
    { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
    { type: 'PACKS_CHOSEN', addOnIds: [] },
  ]);
}

describe('signup machine: the account-first order', () => {
  it('takes the payment step out of the form order', () => {
    const state = toCreating();
    // Pay-first would be sitting on `payment` here; this order has already gone past it.
    expect(state.step).toBe('creating');
    expect(state.token).toBeTruthy();
    expect(state.paymentAfterAccount).toBe(false);
  });

  it('asks for the card once the account exists, before the disclaimers', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });

    expect(state.step).toBe('payment');
    expect(state.paymentAfterAccount).toBe(true);
    expect(state.userId).toBe('user-1');
    // Where it goes afterwards was decided by the event, and is remembered across the card.
    expect(state.pendingDisclaimers).toBe(true);
  });

  it('carries on to the disclaimers when the card is given', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-1' });

    expect(state.step).toBe('disclaimers');
    expect(state.paymentTransactionId).toBe('txn-1');
    expect(state.paymentAfterAccount).toBe(false);

    state = signupTransition(state, { type: 'DISCLAIMERS_ACCEPTED' });
    expect(state.step).toBe('done');
    expect(state.outcome).toEqual({
      userId: 'user-1',
      tier: { tierId: 'tier-pro', name: 'Pro', pricingId: 'atp-1' },
      packs: [],
      tokenGrant: undefined,
      planActivationPending: undefined,
    });
  });

  it('goes exactly where ACCOUNT_CREATED would have when there are no disclaimers', () => {
    let state = run(loaded(), [
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'PACKS_CHOSEN', addOnIds: ['pack-a'] },
    ]);
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('payment');

    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-1' });
    // Straight to the packs the visitor also asked for, as it would have been without a card.
    expect(state.step).toBe('packCheckout');
  });

  it('finishes with the plan pending when the customer walks away from the card', () => {
    let state = toCreating();
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('payment');

    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });

    // The account is real, so it is not thrown away: the signup completes and says what is missing.
    expect(state.step).toBe('done');
    expect(state.planActivationPending).toBe(true);
    expect(state.outcome?.planActivationPending).toBe(true);
    expect(state.outcome?.userId).toBe('user-1');
    expect(state.paymentTransactionId).toBeUndefined();
  });

  it('still shows the disclaimers after an abandoned card', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });

    expect(state.step).toBe('disclaimers');
    expect(state.planActivationPending).toBe(true);
  });

  it('carries the pending plan all the way into the outcome when the card is never retried', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state.step).toBe('disclaimers');

    state = signupTransition(state, { type: 'DISCLAIMERS_ACCEPTED' });
    expect(state.step).toBe('done');
    expect(state.outcome?.planActivationPending).toBe(true);
    expect(state.paymentTransactionId).toBeUndefined();
  });

  it('un-pends the plan when the customer comes back and the card goes through', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state.planActivationPending).toBe(true);

    // Back to the card, and this time it is given.
    state = signupTransition(state, { type: 'GO_TO', step: 'payment' });
    expect(state.step).toBe('payment');
    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-2' });

    // The disclaimers were never accepted, so they are still what comes next.
    expect(state.step).toBe('disclaimers');
    expect(state.planActivationPending).toBe(false);

    state = signupTransition(state, { type: 'DISCLAIMERS_ACCEPTED' });
    expect(state.step).toBe('done');
    // A paying customer is never told their plan is still pending.
    expect(state.outcome).toEqual({
      userId: 'user-1',
      tier: { tierId: 'tier-pro', name: 'Pro', pricingId: 'atp-1' },
      packs: [],
      tokenGrant: undefined,
      planActivationPending: undefined,
    });
    expect(state.paymentTransactionId).toBe('txn-2');
  });

  it('ignores PAYMENT_ABANDONED in the pay-first order', () => {
    // Pay-first reaches its payment step with no account behind it, so there is nothing to abandon
    // INTO — backing out there is a step back, which is `GO_TO`.
    let state = run(initialSignupState(), [
      { type: 'INIT', signedIn: false },
      { type: 'MODE_LOADED', mode: openMode },
      { type: 'CATALOG_LOADED' },
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'PACKS_CHOSEN', addOnIds: [] },
    ]);
    expect(state.step).toBe('payment');

    const before = state;
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state).toBe(before);
  });

  it('never asks a token grant to pay: the issuer already did', () => {
    let state = loaded();
    state = run(state, [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_CHECK_STARTED' }]);
    state = signupTransition(state, {
      type: 'TOKEN_ACCEPTED',
      token: state.token!,
      value: 'INVITE-1',
      grant: { tierId: 'tier-pro', pricingId: 'atp-1', addOnIds: [], featureCodes: [] },
    });
    expect(state.step).toBe('packs');

    state = signupTransition(state, { type: 'PACKS_CHOSEN', addOnIds: [] });
    expect(state.step).toBe('creating');

    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('done');
    expect(state.paymentAfterAccount).toBe(false);
  });

  it('never asks a free plan to pay', () => {
    let state = run(loaded(), [
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', requiresPayment: false },
      { type: 'PACKS_CHOSEN', addOnIds: [] },
    ]);
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('done');
  });

  it('does not ask twice when the card was somehow already given', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-1' });
    expect(state.step).toBe('disclaimers');

    // A start-over that walks the form again carries the transaction already taken, so the card
    // step has nothing left to ask for.
    state = run(state, [
      { type: 'GO_TO', step: 'register' },
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PACKS_CHOSEN', addOnIds: [] },
    ]);
    expect(state.step).toBe('creating');
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    expect(state.step).toBe('done');
  });

  it('still throws a stale account result away', () => {
    const state = toCreating();
    const stale = issueStepToken();
    expect(signupTransition(state, { type: 'ACCOUNT_CREATED', token: stale, userId: 'user-1' })).toBe(state);
    expect(signupTransition(state, { type: 'ACCOUNT_FAILED', token: stale, message: 'no' })).toBe(state);
  });
});

describe('signup machine: GO_TO and RESET in the account-first order', () => {
  it('refuses to open a card step before there is an account', () => {
    const state = run(loaded(), [{ type: 'REGISTER_SUBMITTED', email: 'a@example.com' }, { type: 'TOKEN_SKIPPED' }]);
    expect(state.step).toBe('plan');
    // There is no pre-account card step in this order, so the machine stays where it is.
    expect(signupTransition(state, { type: 'GO_TO', step: 'payment' })).toBe(state);
  });

  it('re-opens the card step once the account exists', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state.step).toBe('disclaimers');

    state = signupTransition(state, { type: 'GO_TO', step: 'payment' });
    expect(state.step).toBe('payment');
    expect(state.paymentAfterAccount).toBe(true);
  });

  it('refuses to re-open the card once one has been taken', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'ACCOUNT_CREATED', token: state.token!, userId: 'user-1' });
    state = signupTransition(state, { type: 'PAYMENT_COMPLETED', paymentTransactionId: 'txn-1' });
    expect(state.step).toBe('disclaimers');

    // The plan is paid for; there is nothing left to ask the customer for.
    expect(signupTransition(state, { type: 'GO_TO', step: 'payment' })).toBe(state);
  });

  it('refuses to re-open the card once the signup has moved on to the packs', () => {
    let state = run(loaded(), [
      { type: 'REGISTER_SUBMITTED', email: 'a@example.com' },
      { type: 'TOKEN_SKIPPED' },
      { type: 'PLAN_CHOSEN', tierId: 'tier-pro', pricingId: 'atp-1', requiresPayment: true },
      { type: 'PACKS_CHOSEN', addOnIds: ['pack-a'] },
    ]);
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state.step).toBe('packCheckout');

    // Coming back through the card from here would re-run disclaimers already passed and restart a
    // checkout that may already be charging, so the machine stays where it is.
    expect(signupTransition(state, { type: 'GO_TO', step: 'payment' })).toBe(state);
  });

  it('refuses to re-open the card once the outcome is out', () => {
    let state = toCreating();
    state = signupTransition(state, {
      type: 'ACCOUNT_CREATED',
      token: state.token!,
      userId: 'user-1',
      requiresDisclaimers: false,
    });
    state = signupTransition(state, { type: 'PAYMENT_ABANDONED' });
    expect(state.step).toBe('done');

    // `done` refuses every GO_TO: the outcome has been handed to the host already.
    expect(signupTransition(state, { type: 'GO_TO', step: 'payment' })).toBe(state);
    expect(signupTransition(state, { type: 'GO_TO', step: 'register' })).toBe(state);
  });

  it('keeps the order across a start-over', () => {
    let state = toCreating();
    state = signupTransition(state, { type: 'RESET' });
    expect(state.options.paymentOrder).toBe('afterAccount');
    expect(state.paymentAfterAccount).toBe(false);
    expect(state.planActivationPending).toBe(false);
  });

  it('defaults to the pay-first order when nothing asks otherwise', () => {
    expect(initialSignupState().options.paymentOrder).toBe('beforeAccount');
  });
});
