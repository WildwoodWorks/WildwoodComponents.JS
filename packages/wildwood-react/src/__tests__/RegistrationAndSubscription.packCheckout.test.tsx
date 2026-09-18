/**
 * The last step of a signup that bought packs: one quote, one card at most, one purchase, then
 * 3-D Secure walked one pack at a time.
 *
 * The rules being defended are the expensive ones. A doubled effect must not buy anything twice.
 * A card must be asked for once, or not at all when there is one on file. One pack failing must
 * leave the others running. And a pack a registration token granted must never reach a checkout —
 * the customer would be charged for something they were given.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { formatMoney } from '@wildwood/core';
import type { AddOnCheckoutItemResultModel, AddOnCheckoutQuoteModel, AddOnCheckoutResultModel } from '@wildwood/core';
import { clearPublicCatalogCache } from '@wildwood/react-shared';
import { createWrapper } from './testUtils.js';
import { installMockStripe, type MockStripe } from './mockStripe.js';
import {
  ALL_PACKS,
  DOCS_PACK_PRICE,
  pack,
  signupClient,
  stepOf,
  submitRegistration,
  type SignupStubs,
} from './signupHarness.js';

// Hoisted with the mock factory: Stripe.js is never fetched in a test.
const stripeScript = vi.hoisted(() => ({ loadStripe: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@wildwood/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wildwood/core')>()),
  loadStripe: stripeScript.loadStripe,
}));

const { RegistrationSubscriptionSignup } = await import('../index.js');
type SignupProps = Parameters<typeof RegistrationSubscriptionSignup>[0];

// ── What the server quotes and sells ───────────────────────────────────────────

function quote(overrides: Partial<AddOnCheckoutQuoteModel> = {}): AddOnCheckoutQuoteModel {
  return {
    success: true,
    checkoutId: 'chk-1',
    providerId: 'prov-stripe',
    currency: 'USD',
    lines: [
      {
        addOnId: 'pack-docs',
        pricingId: 'ao-docs',
        name: 'Docs Pack',
        price: DOCS_PACK_PRICE,
        billingFrequency: 'Monthly',
        trialDays: 14,
        trialEligible: true,
        dueToday: 0,
      },
    ],
    totalDueToday: 0,
    requiresPaymentMethod: false,
    ...overrides,
  };
}

function itemResult(
  addOnId: string,
  status: AddOnCheckoutItemResultModel['status'],
  extra: Partial<AddOnCheckoutItemResultModel> = {},
): AddOnCheckoutItemResultModel {
  return { addOnId, pricingId: `${addOnId}-pricing`, status, ...extra };
}

function checkoutResult(results: AddOnCheckoutItemResultModel[]): AddOnCheckoutResultModel {
  return { success: true, checkoutId: 'chk-1', results };
}

let stripe: MockStripe;

function renderSignup(props: Partial<SignupProps>, stubs: SignupStubs, strict = false) {
  const element = <RegistrationSubscriptionSignup planSelection="skip" {...props} />;
  return render(strict ? <StrictMode>{element}</StrictMode> : element, { wrapper: createWrapper(stubs.client) });
}

beforeEach(() => {
  clearPublicCatalogCache();
  stripe = installMockStripe();
  stripeScript.loadStripe.mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  stripe.uninstall();
  vi.restoreAllMocks();
  clearPublicCatalogCache();
});

// ── The card already on file ───────────────────────────────────────────────────

describe('signup pack checkout - a card on file', () => {
  it('prices the basket, charges the saved card and reports each pack', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote({ savedCard: { brand: 'Visa', last4: '4242' } }));
    stubs.checkout.mockResolvedValue(
      checkoutResult([itemResult('pack-docs', 'trialing', { trialEnd: '2026-10-01T00:00:00Z' })]),
    );

    const onSignupComplete = vi.fn();
    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs'], onSignupComplete }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    expect(stubs.quote).toHaveBeenCalledTimes(1);
    expect(stubs.quote).toHaveBeenCalledWith('test-app-id', [{ addOnId: 'pack-docs' }]);
    expect(stubs.checkout).toHaveBeenCalledTimes(1);
    expect(stubs.checkout).toHaveBeenCalledWith('test-app-id', {
      checkoutId: 'chk-1',
      providerId: 'prov-stripe',
      useSavedCard: true,
      items: [{ addOnId: 'pack-docs' }],
    });
    // Nothing was asked of the customer: there was a card already.
    expect(stubs.createCard).not.toHaveBeenCalled();
    expect(container.querySelector('.ww-stripe-card-element')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete.mock.calls[0]?.[0]?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'trialing', trialEnd: '2026-10-01T00:00:00Z' },
    ]);
  });

  it('quotes once and buys once however many times React runs the effects', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote());
    stubs.checkout.mockResolvedValue(checkoutResult([itemResult('pack-docs', 'active')]));

    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs'] }, stubs, true);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    expect(stubs.registerOpen).toHaveBeenCalledTimes(1);
    expect(stubs.quote).toHaveBeenCalledTimes(1);
    expect(stubs.checkout).toHaveBeenCalledTimes(1);
  });

  it('shows the live prices the quote came back with', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote({ savedCard: { brand: 'Visa', last4: '4242' } }));
    // Nothing answers the purchase, so the order summary stays on screen.
    stubs.checkout.mockReturnValue(new Promise<AddOnCheckoutResultModel>(() => {}));

    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs'] }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(container.querySelector('.ww-regsub-order-summary')).not.toBeNull());
    expect(stepOf(container)).toBe('packCheckout');

    const summary = container.querySelector('.ww-regsub-order-summary');
    expect(summary?.textContent).toContain('Docs Pack');
    expect(summary?.textContent).toContain(formatMoney(DOCS_PACK_PRICE, 'USD'));
    expect(summary?.textContent).toContain('14-day free trial');
    expect(summary?.textContent).toContain(formatMoney(0, 'USD'));
    expect(summary?.textContent).toContain('Visa ending in 4242');
  });
});

// ── Collecting a card, once ────────────────────────────────────────────────────

describe('signup pack checkout - collecting a card', () => {
  async function reachCardForm(stubs: SignupStubs) {
    const view = renderSignup({ preSelectedAddOnIds: ['pack-docs'] }, stubs);
    await submitRegistration('Create Account');
    await waitFor(() => expect(stubs.createCard).toHaveBeenCalled());
    await waitFor(() => expect(stripe.cards.length).toBeGreaterThan(0));
    return view;
  }

  it('asks for the card once and buys the basket with it', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote({ requiresPaymentMethod: true }));
    stubs.createCard.mockResolvedValue({
      success: true,
      clientSecret: 'seti_secret_1',
      setupIntentId: 'seti_1',
      paymentTransactionId: 'txn-card',
    });
    stubs.checkout.mockResolvedValue(checkoutResult([itemResult('pack-docs', 'active')]));

    const { container } = await reachCardForm(stubs);

    expect(stubs.createCard).toHaveBeenCalledTimes(1);
    expect(stubs.createCard).toHaveBeenCalledWith('test-app-id', 'prov-stripe');

    act(() => stripe.lastCard().emitChange({ complete: true, empty: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Save card and continue' }));

    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(stripe.confirmCardSetup).toHaveBeenCalledWith('seti_secret_1', expect.anything());
    // Bought against the card just collected, not against a saved one.
    expect(stubs.checkout).toHaveBeenCalledWith('test-app-id', {
      checkoutId: 'chk-1',
      providerId: 'prov-stripe',
      paymentTransactionId: 'txn-card',
      items: [{ addOnId: 'pack-docs' }],
    });
  });

  it('asks the server for a fresh SetupIntent when the card is retried', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote({ requiresPaymentMethod: true }));
    stubs.createCard
      .mockResolvedValueOnce({ success: false, errorCode: 'ProcessorError', errorMessage: 'Stripe is down' })
      .mockResolvedValue({
        success: true,
        clientSecret: 'seti_secret_2',
        setupIntentId: 'seti_2',
        paymentTransactionId: 'txn-card-2',
      });
    stubs.checkout.mockResolvedValue(checkoutResult([itemResult('pack-docs', 'active')]));
    const onError = vi.fn();

    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs'], onError }, stubs);
    await submitRegistration('Create Account');

    await screen.findByText('Stripe is down');
    expect(onError).toHaveBeenCalledWith({ code: 'pack_card_failed', message: 'Stripe is down' });

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(stubs.createCard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stripe.cards.length).toBeGreaterThan(0));

    act(() => stripe.lastCard().emitChange({ complete: true, empty: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Save card and continue' }));

    await waitFor(() => expect(stepOf(container)).toBe('success'));
    // The second card is confirmed against the second intent, never the abandoned one.
    expect(stripe.confirmCardSetup).toHaveBeenCalledTimes(1);
    expect(stripe.confirmCardSetup).toHaveBeenCalledWith('seti_secret_2', expect.anything());
  });

  it('offers to skip a basket that cannot be priced, and still says what happened', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue({
      success: false,
      checkoutId: '',
      currency: '',
      lines: [],
      totalDueToday: 0,
      requiresPaymentMethod: false,
      errorCode: 'AlreadySubscribed',
      errorMessage: 'You already have that pack',
    });
    const onError = vi.fn();
    const onSignupComplete = vi.fn();

    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs'], onError, onSignupComplete }, stubs);
    await submitRegistration('Create Account');

    await screen.findByText('You already have that pack');
    expect(onError).toHaveBeenCalledWith({ code: 'pack_quote_failed', message: 'You already have that pack' });

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(stubs.quote).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    // The pack is reported as failed rather than quietly dropped from the outcome.
    expect(onSignupComplete.mock.calls[0]?.[0]?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'failed', errorMessage: 'You already have that pack' },
    ]);
  });
});

// ── 3-D Secure, one pack at a time ─────────────────────────────────────────────

describe('signup pack checkout - authentication', () => {
  it('authenticates each pack the bank asked about, in order, and completes it', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote());
    stubs.checkout.mockResolvedValue(
      checkoutResult([
        itemResult('pack-docs', 'requires_action', {
          clientSecret: 'pi_docs_secret',
          paymentTransactionId: 'txn-docs',
        }),
        itemResult('pack-ai', 'requires_action', { clientSecret: 'pi_ai_secret', paymentTransactionId: 'txn-ai' }),
      ]),
    );
    stubs.completeCheckout
      .mockResolvedValueOnce(itemResult('pack-docs', 'active'))
      .mockResolvedValueOnce(itemResult('pack-ai', 'trialing', { trialEnd: '2026-11-01T00:00:00Z' }));

    const onSignupComplete = vi.fn();
    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs', 'pack-ai'], onSignupComplete }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    expect(stripe.confirmCardPayment.mock.calls.map((call) => call[0])).toEqual(['pi_docs_secret', 'pi_ai_secret']);
    expect(stubs.completeCheckout.mock.calls).toEqual([
      ['test-app-id', 'txn-docs'],
      ['test-app-id', 'txn-ai'],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete.mock.calls[0]?.[0]?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'active', trialEnd: undefined },
      { addOnId: 'pack-ai', name: 'AI Pack', status: 'trialing', trialEnd: '2026-11-01T00:00:00Z' },
    ]);
  });

  it('lets one pack fail without taking the others with it', async () => {
    const stubs = signupClient();
    stubs.quote.mockResolvedValue(quote());
    stubs.checkout.mockResolvedValue(
      checkoutResult([
        itemResult('pack-docs', 'failed', { errorMessage: 'Your card was declined.' }),
        itemResult('pack-ai', 'active'),
      ]),
    );

    const onSignupComplete = vi.fn();
    const { container } = renderSignup({ preSelectedAddOnIds: ['pack-docs', 'pack-ai'], onSignupComplete }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    const outcomes = container.querySelector('.ww-pack-outcome-list');
    expect(outcomes?.textContent).toContain('Your card was declined.');
    expect(outcomes?.textContent).toContain('AI Pack');

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete.mock.calls[0]?.[0]?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'failed', errorMessage: 'Your card was declined.' },
      { addOnId: 'pack-ai', name: 'AI Pack', status: 'active', trialEnd: undefined },
    ]);
  });
});

// ── What reaches the checkout at all ───────────────────────────────────────────

describe('signup pack checkout - the basket', () => {
  it('drops packs the app does not sell and caps how many a link may carry', async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      pack({
        id: `pack-${index}`,
        name: `Pack ${index}`,
        category: 'Misc',
        displayOrder: index,
        pricingOptions: [{ id: `ao-${index}`, price: 1, billingFrequency: 'Monthly', isDefault: true }] as never,
      }),
    );
    const stubs = signupClient({ addOns: many });
    stubs.quote.mockReturnValue(new Promise<AddOnCheckoutQuoteModel>(() => {}));

    renderSignup({ preSelectedAddOnIds: [...many.map((addOn) => addOn.id), 'pack-that-went-away'] }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stubs.quote).toHaveBeenCalled());

    const items = stubs.quote.mock.calls[0]?.[1] ?? [];
    expect(items).toHaveLength(25);
    expect(items.some((item) => item.addOnId === 'pack-that-went-away')).toBe(false);
  });

  it('never charges for a pack the registration token granted', async () => {
    const stubs = signupClient({ addOns: ALL_PACKS });
    stubs.tokenDetails.mockResolvedValue({
      isValid: true,
      appGrants: [
        {
          appId: 'test-app-id',
          appTierId: 'tier-pro',
          appTierName: 'Pro',
          addOnIds: ['pack-docs'],
          addOnNames: ['Docs Pack'],
          featureCodes: [],
        },
      ],
    });
    stubs.quote.mockResolvedValue(
      quote({
        lines: [
          {
            addOnId: 'pack-ai',
            pricingId: 'ao-ai',
            name: 'AI Pack',
            price: 19,
            billingFrequency: 'Monthly',
            trialDays: 0,
            trialEligible: false,
            dueToday: 19,
          },
        ],
        totalDueToday: 19,
      }),
    );
    stubs.checkout.mockResolvedValue(checkoutResult([itemResult('pack-ai', 'active')]));

    const onSignupComplete = vi.fn();
    const { container } = renderSignup(
      {
        registrationToken: 'TOKEN-1',
        preSelectedAddOnIds: ['pack-docs', 'pack-ai'],
        onSignupComplete,
      },
      stubs,
    );

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    // The granted pack is not in the basket; the one they chose on top of it is, once.
    expect(stubs.quote).toHaveBeenCalledTimes(1);
    expect(stubs.quote).toHaveBeenCalledWith('test-app-id', [{ addOnId: 'pack-ai' }]);
    expect(stubs.checkout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete.mock.calls[0]?.[0]?.packs).toEqual([
      { addOnId: 'pack-docs', name: 'Docs Pack', status: 'granted' },
      { addOnId: 'pack-ai', name: 'AI Pack', status: 'active', trialEnd: undefined },
    ]);
  });
});
