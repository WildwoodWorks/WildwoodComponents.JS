/**
 * The payment rules, exercised as the driver the component runs on: this package has no React
 * renderer (no react-test-renderer / @testing-library), and the rules — not the markup — are what
 * these behaviours are about. The rendered flow is covered in @wildwood/react's
 * PaymentComponent.trial / PaymentComponent.success tests.
 *
 * The rule that matters most here has no web counterpart: React Native ships no payment SDK, so a
 * capability is claimed to the server ONLY when a host has wired a handler that actually has it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InitiatePaymentResponse, PaymentCompletionResult } from '@wildwood/core';
import type { PaymentActionAdapter, PaymentActionOutcome } from '@wildwood/react-shared';

import {
  canConfirmCardSetup,
  createPaymentSession,
  paymentButtonLabel,
  paymentSuccessCopy,
  trialChargeNote,
  trialUnavailableNotice,
  type PaymentAttempt,
  type PaymentSessionOptions,
} from '../components/paymentSession';

const PLAN: PaymentAttempt = {
  providerId: 'prov-stripe',
  appId: 'app-1',
  amount: 99,
  currency: 'USD',
  pricingModelId: 'pm-monthly',
  isSubscription: true,
  trialDays: 14,
  publishableKey: 'pk_test_123',
};

const setupIntentResponse: InitiatePaymentResponse = {
  success: true,
  providerType: 1,
  paymentIntentId: 'seti_1',
  clientSecret: 'seti_1_secret_abc',
  clientSecretType: 'setup_intent',
  subscriptionId: 'sub_1',
  trialDays: 14,
  trialEnd: '2026-10-01T00:00:00Z',
};

const paymentIntentResponse: InitiatePaymentResponse = {
  success: true,
  providerType: 1,
  paymentIntentId: 'in_1',
  clientSecret: 'pi_1_secret_abc',
  clientSecretType: 'payment_intent',
};

const confirmed: PaymentCompletionResult = { success: true, transactionId: 'txn-1', paymentIntentId: 'in_1' };

const succeeded: PaymentActionOutcome = { status: 'succeeded' };
const cancelled: PaymentActionOutcome = { status: 'cancelled' };
const declined: PaymentActionOutcome = { status: 'failed', message: 'Your card was declined.' };

function fullHandler(): PaymentActionAdapter & {
  confirmPayment: ReturnType<typeof vi.fn>;
  confirmCardSetup: ReturnType<typeof vi.fn>;
} {
  return {
    confirmPayment: vi.fn().mockResolvedValue(succeeded),
    confirmCardSetup: vi.fn().mockResolvedValue(succeeded),
  };
}

function build(
  overrides: Partial<PaymentSessionOptions> & { handler?: PaymentActionAdapter } = {},
  initResult: InitiatePaymentResponse = paymentIntentResponse,
) {
  const initiatePayment = vi.fn().mockResolvedValue(initResult);
  const confirmPayment = vi.fn().mockResolvedValue(confirmed);
  const openUrl = vi.fn().mockResolvedValue(undefined);
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  const { handler, ...rest } = overrides;
  const session = createPaymentSession({
    initiatePayment,
    confirmPayment,
    openUrl,
    onSuccess,
    onFailure,
    getHandler: () => handler,
    ...rest,
  });
  return { session, initiatePayment, confirmPayment, openUrl, onSuccess, onFailure, handler };
}

describe('canConfirmCardSetup', () => {
  it('is true only for a handler that can actually confirm a card setup', () => {
    expect(canConfirmCardSetup(undefined)).toBe(false);
    expect(canConfirmCardSetup(null)).toBe(false);
    expect(canConfirmCardSetup({ confirmPayment: vi.fn() })).toBe(false);
    expect(canConfirmCardSetup(fullHandler())).toBe(true);
  });
});

describe('supportsSetupIntent on the wire', () => {
  it('is sent when a handler can confirm a SetupIntent', async () => {
    const { session, initiatePayment } = build({ handler: fullHandler() }, setupIntentResponse);

    await session.pay(PLAN);

    expect(initiatePayment).toHaveBeenCalledWith(expect.objectContaining({ supportsSetupIntent: true }));
  });

  it('is NEVER sent without a handler — the app claims no capability it does not have', async () => {
    const { session, initiatePayment } = build();

    await session.pay(PLAN);

    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(initiatePayment.mock.calls[0][0]).not.toHaveProperty('supportsSetupIntent');
  });

  it('is not sent by a handler that confirms payments but not card setups', async () => {
    // A SetupIntent nothing can confirm leaves a trial with no saved card, so the plan renews into
    // a failed charge. Such a handler is treated exactly as no handler for this capability.
    const handler: PaymentActionAdapter = { confirmPayment: vi.fn().mockResolvedValue(succeeded) };
    const { session, initiatePayment } = build({ handler });

    await session.pay(PLAN);

    expect(initiatePayment.mock.calls[0][0]).not.toHaveProperty('supportsSetupIntent');
  });

  it('forwards a billing address only when one was given', async () => {
    const { session, initiatePayment } = build();
    await session.pay(PLAN);
    expect(initiatePayment.mock.calls[0][0]).not.toHaveProperty('billingAddress');

    const withAddress = build();
    await withAddress.session.pay({
      ...PLAN,
      billingAddress: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        street: '12 Analytical Way',
        city: 'Denver',
        state: 'CO',
        zipCode: '80202',
        country: 'US',
      },
    });
    expect(withAddress.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ billingAddress: expect.objectContaining({ zipCode: '80202' }) }),
    );
  });
});

describe('intent routing', () => {
  it('confirms a SetupIntent through confirmCardSetup and charges nothing', async () => {
    const handler = fullHandler();
    const { session, confirmPayment, onSuccess } = build({ handler }, setupIntentResponse);

    await session.pay(PLAN);

    expect(handler.confirmCardSetup).toHaveBeenCalledWith('seti_1_secret_abc', 'pk_test_123');
    expect(handler.confirmPayment).not.toHaveBeenCalled();
    // The id the SERVER recorded, not one read back off a client SDK.
    expect(confirmPayment).toHaveBeenCalledWith('seti_1', 1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    const state = session.getState();
    expect(state.status).toBe('complete');
    expect(state.trialEndsAt).toBe('2026-10-01T00:00:00Z');
    expect(state.result).toEqual(expect.objectContaining({ subscriptionId: 'sub_1' }));
  });

  it('confirms a PaymentIntent through confirmPayment', async () => {
    const handler = fullHandler();
    const { session, confirmPayment, onSuccess } = build({ handler }, paymentIntentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });

    expect(handler.confirmPayment).toHaveBeenCalledWith('pi_1_secret_abc', 'pk_test_123');
    expect(handler.confirmCardSetup).not.toHaveBeenCalled();
    expect(confirmPayment).toHaveBeenCalledWith('in_1', 1);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'txn-1' }));
    expect(session.getState().trialEndsAt).toBeNull();
  });

  it('follows the redirect and confirms nothing when there is no handler', async () => {
    const { session, openUrl, confirmPayment, onSuccess } = build({}, {
      success: true,
      providerType: 2,
      redirectUrl: 'pay.example.com/checkout/1',
    } as InitiatePaymentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });

    expect(openUrl).toHaveBeenCalledWith('https://pay.example.com/checkout/1');
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(session.getState()).toEqual(expect.objectContaining({ status: 'idle', redirected: true, error: null }));
  });

  it('treats an initiation with nothing to confirm as the completion, as it always has', async () => {
    const { session, onSuccess } = build({}, {
      success: true,
      providerType: 1,
      paymentIntentId: 'pi_server_1',
      subscriptionId: 'sub_9',
    } as InitiatePaymentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, paymentIntentId: 'pi_server_1', subscriptionId: 'sub_9' }),
    );
    // Nothing was confirmed on this device, so the panel says "initiated", not "Payment Successful!".
    expect(session.getState().confirmed).toBe(false);
  });

  it('reports the server refusal rather than pretending the payment started', async () => {
    const { session, onFailure, onSuccess } = build({ handler: fullHandler() }, {
      success: false,
      providerType: 1,
      errorMessage: 'This card is not supported.',
    } as InitiatePaymentResponse);

    await session.pay(PLAN);

    expect(onFailure).toHaveBeenCalledWith('This card is not supported.');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(session.getState().error).toBe('This card is not supported.');
  });
});

describe('outcomes from the host handler', () => {
  it('returns to the form with no error when the customer dismisses the sheet', async () => {
    const handler = fullHandler();
    handler.confirmCardSetup.mockResolvedValue(cancelled);
    const { session, confirmPayment, onFailure, onSuccess } = build({ handler }, setupIntentResponse);

    await session.pay(PLAN);

    const state = session.getState();
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the decline and reuses the SAME intent on the retry', async () => {
    // Initiating again would start a second subscription that nobody ever cancels.
    const handler = fullHandler();
    handler.confirmCardSetup.mockResolvedValueOnce(declined).mockResolvedValueOnce(succeeded);
    const { session, initiatePayment, onSuccess } = build({ handler }, setupIntentResponse);

    await session.pay(PLAN);
    expect(session.getState().error).toBe('Your card was declined.');

    await session.pay(PLAN);

    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(handler.confirmCardSetup).toHaveBeenCalledTimes(2);
    expect(handler.confirmCardSetup).toHaveBeenLastCalledWith('seti_1_secret_abc', 'pk_test_123');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('initiates again when the retry is for a different plan', async () => {
    const handler = fullHandler();
    handler.confirmCardSetup.mockResolvedValueOnce(declined).mockResolvedValueOnce(succeeded);
    const { session, initiatePayment } = build({ handler }, setupIntentResponse);

    await session.pay(PLAN);
    await session.pay({ ...PLAN, pricingModelId: 'pm-annual', amount: 999 });

    expect(initiatePayment).toHaveBeenCalledTimes(2);
  });

  it('says the card could not be verified when the server refuses to confirm it', async () => {
    const handler = fullHandler();
    const { session, confirmPayment, onFailure, onSuccess } = build({ handler }, setupIntentResponse);
    confirmPayment.mockResolvedValue({ success: false });

    await session.pay(PLAN);

    expect(onFailure).toHaveBeenCalledWith('Your card could not be verified. Please try another card.');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('a trial the account cannot have', () => {
  it('asks before charging, then confirms the same intent on the next press', async () => {
    // The plan advertises a trial; the server started a paid subscription because the account has
    // already had one. Never charge a card that was handed over for a free trial.
    const handler = fullHandler();
    const { session, initiatePayment, onSuccess } = build({ handler }, paymentIntentResponse);

    await session.pay(PLAN);

    expect(session.getState().trialUnavailable).toBe(true);
    expect(handler.confirmPayment).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    await session.pay(PLAN);

    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(handler.confirmPayment).toHaveBeenCalledWith('pi_1_secret_abc', 'pk_test_123');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('never asks when no trial was offered', async () => {
    const handler = fullHandler();
    const { session } = build({ handler }, paymentIntentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });

    expect(session.getState().trialUnavailable).toBe(false);
    expect(handler.confirmPayment).toHaveBeenCalled();
  });

  it('offers the trial again when the form is reused for another plan', async () => {
    const handler = fullHandler();
    const { session } = build({ handler }, paymentIntentResponse);
    session.setPlan({ pricingModelId: 'pm-monthly', trialDays: 14, amount: 99 });

    await session.pay(PLAN);
    expect(session.getState().trialUnavailable).toBe(true);

    session.setPlan({ pricingModelId: 'pm-business', trialDays: 14, amount: 149 });

    expect(session.getState().trialUnavailable).toBe(false);
  });

  it('keeps the answer while the plan on screen has not changed', async () => {
    // A re-render must not clear it: the next press would re-offer the trial, be refused again, and
    // the customer could never get past the confirmation.
    const handler = fullHandler();
    const { session } = build({ handler }, paymentIntentResponse);
    session.setPlan({ pricingModelId: 'pm-monthly', trialDays: 14, amount: 99 });

    await session.pay(PLAN);
    session.setPlan({ pricingModelId: 'pm-monthly', trialDays: 14, amount: 99 });

    expect(session.getState().trialUnavailable).toBe(true);
  });
});

describe('a payment is reported once', () => {
  it('refuses a second attempt once one has completed', async () => {
    const handler = fullHandler();
    const { session, initiatePayment, onSuccess } = build({ handler }, paymentIntentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });
    await session.pay({ ...PLAN, trialDays: undefined });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(initiatePayment).toHaveBeenCalledTimes(1);
  });

  it('takes another payment after a reset', async () => {
    const handler = fullHandler();
    const { session, initiatePayment, onSuccess } = build({ handler }, paymentIntentResponse);

    await session.pay({ ...PLAN, trialDays: undefined });
    session.reset();
    expect(session.getState().result).toBeNull();
    await session.pay({ ...PLAN, trialDays: undefined });

    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(initiatePayment).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers as the payment moves', async () => {
    const handler = fullHandler();
    const { session } = build({ handler }, paymentIntentResponse);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.pay({ ...PLAN, trialDays: undefined });
    unsubscribe();
    const seen = listener.mock.calls.length;
    await session.pay({ ...PLAN, trialDays: undefined });

    expect(seen).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(seen);
  });

  it('turns a thrown call into a failure rather than an unhandled rejection', async () => {
    const { session, onFailure } = build({ initiatePayment: vi.fn().mockRejectedValue(new Error('offline')) });

    await session.pay({ ...PLAN, trialDays: undefined });

    expect(onFailure).toHaveBeenCalledWith('offline');
    expect(session.getState()).toEqual(expect.objectContaining({ status: 'idle', error: 'offline' }));
  });
});

describe('copy', () => {
  it('offers the trial rather than a charge, and quotes the plan currency', () => {
    expect(paymentButtonLabel({ amount: 99, currency: 'USD', trialDays: 14 })).toBe('Start 14-day free trial');
    expect(paymentButtonLabel({ amount: 99, currency: 'USD', trialDays: 14, trialUnavailable: true })).toBe(
      'Pay $99.00',
    );
    expect(paymentButtonLabel({ amount: 79, currency: 'CHF' })).not.toContain('$');
    expect(paymentButtonLabel({ amount: 0, currency: 'USD' })).toBe('Pay');
  });

  it('says what is and is not happening today', () => {
    expect(trialChargeNote(99, 'USD')).toBe(
      "You won't be charged today. $99.00 is due when the trial ends unless you cancel before then.",
    );
    expect(trialUnavailableNotice(99, 'USD')).toBe(
      "The free trial isn't available on your account, so $99.00 will be charged today. Select Pay to continue.",
    );
  });

  it('tells the truth about what happened to the card', () => {
    const trial = paymentSuccessCopy({
      trialEndsAt: '2026-10-01T00:00:00Z',
      confirmed: true,
      amount: 99,
      currency: 'USD',
    });
    expect(trial.title).toBe('Your free trial has started!');
    expect(trial.detail).toContain('$99.00 is due');

    expect(paymentSuccessCopy({ trialEndsAt: null, confirmed: true, amount: 99, currency: 'USD' })).toEqual({
      title: 'Payment Successful!',
      detail: 'Amount: $99.00',
    });
    // No handler confirmed anything here — the server completes it, so "initiated" is the honest word.
    expect(paymentSuccessCopy({ trialEndsAt: null, confirmed: false, amount: 99, currency: 'USD' }).title).toBe(
      'Payment initiated successfully!',
    );
  });
});

describe('the package takes no payment SDK dependency', () => {
  it('imports nothing from a Stripe package', () => {
    // The seam only holds if nothing here reaches for a payment SDK of its own: a static import would
    // make every consumer of this package install and rebuild for one. Comments are stripped first —
    // they name @stripe/stripe-react-native on purpose, as the thing a HOST wires.
    const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const sources = ['components/paymentSession.ts', 'components/PaymentComponent.tsx', 'index.ts'].map((relative) =>
      readFileSync(resolve(SRC, relative), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    );
    for (const source of sources) {
      // Naming the provider (`PaymentProviderType.Stripe`) is fine; depending on its SDK is not.
      expect(source).not.toMatch(/from\s+['"][^'"]*stripe/i);
      expect(source).not.toMatch(/(import|require)\(\s*['"][^'"]*stripe/i);
    }
  });
});
