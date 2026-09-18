/**
 * The pack-checkout reducer: quote, one card, one purchase, then 3-D Secure walked one pack at a
 * time. One pack failing must leave the others alone.
 */
import { describe, it, expect } from 'vitest';
import type { AddOnCheckoutItemResultModel, AddOnCheckoutQuoteModel } from '@wildwood/core';
import {
  currentPackCheckoutItem,
  initialPackCheckoutState,
  packCheckoutTransition,
  type PackCheckoutState,
} from '@wildwood/react-shared';

const quote = (requiresPaymentMethod: boolean): AddOnCheckoutQuoteModel => ({
  success: true,
  checkoutId: 'chk-1',
  providerId: 'prov-1',
  currency: 'USD',
  lines: [],
  totalDueToday: 20,
  requiresPaymentMethod,
});

const item = (
  addOnId: string,
  status: AddOnCheckoutItemResultModel['status'],
  extra: Partial<AddOnCheckoutItemResultModel> = {},
): AddOnCheckoutItemResultModel => ({
  addOnId,
  pricingId: `${addOnId}-pricing`,
  status,
  ...extra,
});

function quoted(requiresPaymentMethod: boolean): PackCheckoutState {
  let state = packCheckoutTransition(initialPackCheckoutState(), {
    type: 'QUOTE_REQUESTED',
    appId: 'app-1',
    items: [{ addOnId: 'pack-a' }, { addOnId: 'pack-b' }],
  });
  state = packCheckoutTransition(state, {
    type: 'QUOTE_RECEIVED',
    token: state.token!,
    quote: quote(requiresPaymentMethod),
  });
  return state;
}

describe('packCheckoutMachine', () => {
  it('buys against the card on file when the quote needs no new one', () => {
    let state = quoted(false);
    expect(state.step).toBe('quoted');
    expect(state.useSavedCard).toBe(true);

    state = packCheckoutTransition(state, { type: 'CHECKOUT_REQUESTED' });
    expect(state.step).toBe('checkingOut');

    state = packCheckoutTransition(state, {
      type: 'CHECKOUT_RECEIVED',
      token: state.token!,
      result: {
        success: true,
        checkoutId: 'chk-1',
        results: [item('pack-a', 'active'), item('pack-b', 'trialing', { trialEnd: '2026-10-01' })],
      },
    });
    expect(state.step).toBe('done');
    expect(state.results.map((r) => r.status)).toEqual(['active', 'trialing']);
  });

  it('collects a card first when the quote says there is none', () => {
    let state = quoted(true);
    expect(state.useSavedCard).toBe(false);

    state = packCheckoutTransition(state, { type: 'CARD_REQUESTED' });
    expect(state.step).toBe('collectingCard');

    state = packCheckoutTransition(state, {
      type: 'CARD_INTENT_RECEIVED',
      token: state.token!,
      clientSecret: 'seti_secret',
      paymentTransactionId: 'txn-card',
    });
    expect(state.cardClientSecret).toBe('seti_secret');
    expect(state.step).toBe('collectingCard');

    state = packCheckoutTransition(state, { type: 'CARD_CONFIRMED', token: state.token! });
    expect(state.step).toBe('checkingOut');
    expect(state.paymentTransactionId).toBe('txn-card');
    expect(state.useSavedCard).toBe(false);
  });

  it('walks 3-D Secure one pack at a time, in order', () => {
    let state = quoted(false);
    state = packCheckoutTransition(state, { type: 'CHECKOUT_REQUESTED' });
    state = packCheckoutTransition(state, {
      type: 'CHECKOUT_RECEIVED',
      token: state.token!,
      result: {
        success: true,
        checkoutId: 'chk-1',
        results: [
          item('pack-a', 'requires_action', { clientSecret: 'pi_a', paymentTransactionId: 'txn-a' }),
          item('pack-b', 'requires_action', { clientSecret: 'pi_b', paymentTransactionId: 'txn-b' }),
        ],
      },
    });
    expect(state.step).toBe('authenticating');
    expect(currentPackCheckoutItem(state)?.addOnId).toBe('pack-a');

    state = packCheckoutTransition(state, { type: 'ITEM_AUTHENTICATED', token: state.token! });
    expect(state.step).toBe('completing');
    state = packCheckoutTransition(state, {
      type: 'ITEM_COMPLETED',
      token: state.token!,
      result: item('pack-a', 'active', { subscriptionId: 'sub-a' }),
    });

    // On to the second pack, not straight to done.
    expect(state.step).toBe('authenticating');
    expect(currentPackCheckoutItem(state)?.addOnId).toBe('pack-b');

    state = packCheckoutTransition(state, { type: 'ITEM_AUTHENTICATED', token: state.token! });
    state = packCheckoutTransition(state, {
      type: 'ITEM_COMPLETED',
      token: state.token!,
      result: item('pack-b', 'trialing', { subscriptionId: 'sub-b' }),
    });
    expect(state.step).toBe('done');
    expect(state.results.map((r) => r.status)).toEqual(['active', 'trialing']);
  });

  it('one pack failing leaves the rest of the basket alone', () => {
    let state = quoted(false);
    state = packCheckoutTransition(state, { type: 'CHECKOUT_REQUESTED' });
    state = packCheckoutTransition(state, {
      type: 'CHECKOUT_RECEIVED',
      token: state.token!,
      result: {
        success: true,
        checkoutId: 'chk-1',
        results: [
          item('pack-a', 'requires_action', { clientSecret: 'pi_a' }),
          item('pack-b', 'requires_action', { clientSecret: 'pi_b' }),
          item('pack-c', 'active'),
        ],
      },
    });

    state = packCheckoutTransition(state, {
      type: 'ITEM_AUTH_FAILED',
      token: state.token!,
      message: 'Your bank declined the card',
    });
    expect(state.step).toBe('authenticating');
    expect(state.results[0]).toMatchObject({ status: 'failed', errorMessage: 'Your bank declined the card' });
    expect(currentPackCheckoutItem(state)?.addOnId).toBe('pack-b');

    state = packCheckoutTransition(state, { type: 'ITEM_AUTHENTICATED', token: state.token! });
    state = packCheckoutTransition(state, {
      type: 'ITEM_COMPLETED',
      token: state.token!,
      result: item('pack-b', 'active'),
    });
    expect(state.step).toBe('done');
    expect(state.results.map((r) => r.status)).toEqual(['failed', 'active', 'active']);
  });

  it('ignores a result carrying a stale step token', () => {
    let state = packCheckoutTransition(initialPackCheckoutState(), {
      type: 'QUOTE_REQUESTED',
      appId: 'app-1',
      items: [{ addOnId: 'pack-a' }],
    });
    const stale = state.token!;

    // The effect ran twice (StrictMode): the second attempt supersedes the first.
    state = packCheckoutTransition(state, { type: 'QUOTE_REQUESTED', appId: 'app-1', items: [{ addOnId: 'pack-a' }] });
    const fresh = state.token!;
    expect(fresh).not.toBe(stale);

    const ignored = packCheckoutTransition(state, { type: 'QUOTE_RECEIVED', token: stale, quote: quote(false) });
    expect(ignored).toBe(state);
    expect(ignored.step).toBe('quoting');

    state = packCheckoutTransition(state, { type: 'QUOTE_RECEIVED', token: fresh, quote: quote(false) });
    expect(state.step).toBe('quoted');
  });

  it('a refused quote fails with the server reason and can be retried', () => {
    let state = packCheckoutTransition(initialPackCheckoutState(), {
      type: 'QUOTE_REQUESTED',
      appId: 'app-1',
      items: [{ addOnId: 'pack-a' }],
    });
    state = packCheckoutTransition(state, {
      type: 'QUOTE_RECEIVED',
      token: state.token!,
      quote: {
        success: false,
        checkoutId: '',
        currency: '',
        lines: [],
        totalDueToday: 0,
        requiresPaymentMethod: false,
        errorCode: 'AlreadySubscribed',
        errorMessage: 'You already have that pack',
      },
    });
    expect(state.step).toBe('failed');
    expect(state.error).toBe('You already have that pack');
    expect(state.errorCode).toBe('AlreadySubscribed');

    state = packCheckoutTransition(state, { type: 'RETRY' });
    expect(state.step).toBe('quoting');
  });

  it('retrying the card form drops the SetupIntent the failed attempt was holding', () => {
    let state = quoted(true);
    state = packCheckoutTransition(state, { type: 'CARD_REQUESTED' });
    state = packCheckoutTransition(state, {
      type: 'CARD_INTENT_RECEIVED',
      token: state.token!,
      clientSecret: 'seti_secret_first',
      paymentTransactionId: 'txn-first',
    });
    state = packCheckoutTransition(state, { type: 'CARD_FAILED', token: state.token!, message: 'Card declined' });
    expect(state.step).toBe('failed');

    state = packCheckoutTransition(state, { type: 'RETRY' });
    // Back on the card form with nothing to confirm: the driver collects a fresh intent, so the
    // second card is never confirmed against the first attempt's secret.
    expect(state.step).toBe('collectingCard');
    expect(state.cardClientSecret).toBeUndefined();
    expect(state.paymentTransactionId).toBeUndefined();
  });
});
