/**
 * The wizard's payment step with the REAL PaymentComponent, because the bug this covers is one of render
 * timing: the signup used to move to its own 'processing' step in the same commit React batched the
 * payment's completion into, so the "Payment Successful!" interstitial and its Continue button were never
 * painted at all. The signup now runs behind that panel, and Continue moves the user on without signing
 * them up a second time.
 *
 * Only the two non-payment children are mocked; PaymentComponent renders for real over a mocked
 * usePayment and a stubbed Stripe, exactly as PaymentComponent.trial.test.tsx does.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import type { AppTierModel, RegistrationFormData } from '@wildwood/core';
import { createTestClient, createWrapper } from './testUtils.js';

const initiatePayment = vi.fn();
const confirmPayment = vi.fn();

// The wizard renders PaymentComponent without preloaded providers, so the form's own configuration call
// is what supplies the Stripe provider it mounts a card element for.
vi.mock('../hooks/usePayment.js', () => ({
  usePayment: () => ({
    loading: false,
    error: null,
    savedMethods: [],
    getAppPaymentConfiguration: vi.fn().mockResolvedValue({
      appId: 'test-app-id',
      defaultCurrency: 'USD',
      defaultProviderId: 'prov-stripe',
      providers: [
        {
          id: 'prov-stripe',
          name: 'Stripe',
          providerType: 1,
          isEnabled: true,
          isDefault: true,
          publishableKey: 'pk_test_123',
        },
      ],
    }),
    initiatePayment,
    confirmPayment,
    getSavedPaymentMethods: vi.fn(),
    deleteSavedPaymentMethod: vi.fn(),
    setDefaultPaymentMethod: vi.fn(),
  }),
}));

vi.mock('@wildwood/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wildwood/core')>()),
  loadStripe: vi.fn().mockResolvedValue(undefined),
}));

let formData: RegistrationFormData;

vi.mock('../components/registration/TokenRegistrationComponent.js', async () => {
  const { createElement, useEffect } = await import('react');
  return {
    TokenRegistrationComponent: ({
      onFormDataCollected,
    }: {
      onFormDataCollected: (d: RegistrationFormData) => void;
    }) => {
      useEffect(() => {
        onFormDataCollected(formData);
      }, []);
      return createElement('div', null, 'registration form');
    },
  };
});

vi.mock('../components/pricing/PricingDisplayComponent.js', async () => {
  const { createElement } = await import('react');
  return { PricingDisplayComponent: () => createElement('div', null, 'plan picker') };
});

const { SignupWithSubscriptionComponent } =
  await import('../components/registration/SignupWithSubscriptionComponent.js');

const proTier: AppTierModel = {
  id: 'tier-pro',
  appId: 'test-app-id',
  name: 'Professional',
  description: '',
  displayOrder: 1,
  isDefault: false,
  isFreeTier: false,
  allowUpgrades: true,
  allowDowngrades: true,
  status: 'Active',
  badgeColor: '',
  iconClass: '',
  showSubscribeButton: true,
  showContactButton: false,
  showPrice: true,
  pricingOptions: [
    {
      id: 'atp-monthly',
      appTierId: 'tier-pro',
      pricingModelId: 'pm-monthly',
      isDefault: true,
      displayOrder: 0,
      pricingModelName: 'Monthly',
      price: 99,
      billingFrequency: 'Monthly',
      trialDays: 14,
    },
  ],
  features: [],
  limits: [],
};

const user = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  password: 'Str0ng!pass',
};

let cardChange: ((e: { complete: boolean; empty: boolean }) => void) | undefined;
const confirmCardSetup = vi.fn();

beforeEach(() => {
  cardChange = undefined;
  window.Stripe = () => ({
    elements: () => ({
      create: () => ({
        mount: () => {},
        unmount: () => {},
        destroy: () => {},
        on: (_event: string, handler: (e: { complete: boolean; empty: boolean }) => void) => {
          cardChange = handler;
        },
      }),
    }),
    confirmCardSetup,
    confirmCardPayment: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete window.Stripe;
});

describe('SignupWithSubscriptionComponent payment step', () => {
  it('shows the payment success interstitial with its Continue button, and Continue signs the user up only once', async () => {
    formData = { ...user, useToken: false };
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'seti_1',
      clientSecret: 'seti_1_secret_abc',
      clientSecretType: 'setup_intent',
      subscriptionId: 'sub_1',
      trialEnd: '2026-10-01T00:00:00Z',
    });
    confirmCardSetup.mockResolvedValue({ setupIntent: { id: 'seti_1', status: 'succeeded' } });
    confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-1', paymentIntentId: 'seti_1' });

    const client = createTestClient();
    vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue([proTier]);
    const registerOpen = vi.spyOn(client.auth, 'registerOpen').mockResolvedValue({ success: true, message: '' });
    vi.spyOn(client.auth, 'login').mockResolvedValue({ jwtToken: '' } as never);
    const selfSubscribe = vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue({ success: true } as never);

    render(<SignupWithSubscriptionComponent appId="test-app-id" preSelectedTierId="tier-pro" />, {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(cardChange).toBeDefined());
    act(() => cardChange!({ complete: true, empty: false }));

    fireEvent.click(await screen.findByRole('button', { name: /Start 14-day free trial/ }));

    // The interstitial is really in the document — the whole point of the fix.
    expect(await screen.findByText('Your free trial has started!')).toBeTruthy();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeTruthy();

    // The account is created behind it.
    await waitFor(() => expect(registerOpen).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Your free trial has started!')).toBeTruthy();

    fireEvent.click(continueButton);

    await waitFor(() => expect(screen.getByText(/All Set/)).toBeTruthy());
    expect(registerOpen).toHaveBeenCalledTimes(1);
    expect(selfSubscribe).toHaveBeenCalledTimes(1);
  });
});
