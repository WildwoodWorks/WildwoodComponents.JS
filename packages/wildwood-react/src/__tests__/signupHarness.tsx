/**
 * The server the signup view is pretending to talk to.
 *
 * Shared by the signup and pack-checkout suites: one catalog, one set of stubbed client methods,
 * and the few gestures a visitor makes (fill the form, press the button). Prices live here as
 * plain numbers and every assertion formats them through core, so no test ever agrees with a
 * component about a price string neither of them got from the server.
 */
import { expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  AppTierAddOnModel,
  AppTierModel,
  AuthenticationConfiguration,
  AuthenticationResponse,
  WildwoodClient,
} from '@wildwood/core';
import { createTestClient } from './testUtils.js';

export const PRO_MONTHLY = 79;
export const PRO_ANNUAL = 790;
export const DOCS_PACK_PRICE = 9;
export const AI_PACK_PRICE = 19;

export function tier(overrides: Partial<AppTierModel>): AppTierModel {
  return {
    appId: 'test-app-id',
    description: '',
    status: 'Active',
    displayOrder: 1,
    isFreeTier: false,
    isDefault: false,
    showPrice: true,
    showSubscribeButton: true,
    showContactButton: false,
    currency: 'USD',
    pricingOptions: [],
    features: [],
    limits: [],
    ...overrides,
  } as unknown as AppTierModel;
}

export function pack(overrides: Partial<AppTierAddOnModel>): AppTierAddOnModel {
  return {
    status: 'Active',
    displayOrder: 1,
    description: '',
    features: [],
    pricingOptions: [],
    bundledInTierIds: [],
    ...overrides,
  } as unknown as AppTierAddOnModel;
}

export const freeTier = tier({
  id: 'tier-free',
  name: 'Starter',
  displayOrder: 1,
  isFreeTier: true,
  isDefault: true,
  pricingOptions: [
    { id: 'price-free', price: 0, billingFrequency: 'Monthly', isDefault: true, displayOrder: 1 },
  ] as AppTierModel['pricingOptions'],
});

export const proTier = tier({
  id: 'tier-pro',
  name: 'Pro',
  displayOrder: 2,
  pricingOptions: [
    {
      id: 'price-pro-monthly',
      pricingModelId: 'pm-monthly',
      price: PRO_MONTHLY,
      billingFrequency: 'Monthly',
      isDefault: true,
      displayOrder: 1,
      trialDays: 14,
    },
    {
      id: 'price-pro-annual',
      pricingModelId: 'pm-annual',
      price: PRO_ANNUAL,
      billingFrequency: 'Yearly',
      isDefault: false,
      displayOrder: 2,
    },
  ] as AppTierModel['pricingOptions'],
});

export const docsPack = pack({
  id: 'pack-docs',
  name: 'Docs Pack',
  category: 'Documents',
  displayOrder: 1,
  pricingOptions: [
    { id: 'ao-docs', price: DOCS_PACK_PRICE, billingFrequency: 'Monthly', isDefault: true, trialDays: 14 },
  ] as AppTierAddOnModel['pricingOptions'],
});

export const aiPack = pack({
  id: 'pack-ai',
  name: 'AI Pack',
  category: 'AI',
  displayOrder: 2,
  pricingOptions: [
    { id: 'ao-ai', price: AI_PACK_PRICE, billingFrequency: 'Monthly', isDefault: true },
  ] as AppTierAddOnModel['pricingOptions'],
});

export const ALL_TIERS = [freeTier, proTier];
export const ALL_PACKS = [docsPack, aiPack];

/** An authentication response with a session in it. */
export function authResponse(overrides: Partial<AuthenticationResponse> = {}): AuthenticationResponse {
  return {
    id: 'user-1',
    userId: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    jwtToken: 'jwt-token',
    refreshToken: 'refresh-token',
    requiresTwoFactor: false,
    requiresPasswordReset: false,
    roles: [],
    permissions: [],
    requiresDisclaimerAcceptance: false,
    ...overrides,
  } as AuthenticationResponse;
}

export interface SignupClientOptions {
  tiers?: AppTierModel[];
  addOns?: AppTierAddOnModel[];
  /** The app's live registration settings. Null is "could not be read" (the open fallback). */
  authConfig?: Partial<AuthenticationConfiguration> | null;
  /** Whether a session already exists when the flow starts. */
  signedIn?: boolean;
}

/** Every client method the signup flow may call, stubbed. */
export function signupClient(options: SignupClientOptions = {}) {
  const client = createTestClient();
  const { tiers = ALL_TIERS, addOns = ALL_PACKS, authConfig, signedIn = false } = options;

  // The session: stubbed rather than really stored, so no refresh timers outlive a test.
  let userId: string | null = signedIn ? 'existing-user' : null;
  Object.defineProperty(client.session, 'isAuthenticated', { get: () => userId != null, configurable: true });
  Object.defineProperty(client.session, 'userId', { get: () => userId, configurable: true });
  const sessionLogin = vi.spyOn(client.session, 'login').mockImplementation(async (response) => {
    userId = response.userId;
    return true;
  });

  const stubs = {
    client: client as WildwoodClient,
    session: { login: sessionLogin, setUserId: (id: string | null) => (userId = id) },
    tiers: vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue(tiers),
    addOns: vi.spyOn(client.appTier, 'getPublicAddOns').mockResolvedValue(addOns),
    authConfig: vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockResolvedValue(
      authConfig === null
        ? null
        : ({
            allowOpenRegistration: true,
            allowTokenRegistration: true,
            passwordMinimumLength: 8,
            ...authConfig,
          } as AuthenticationConfiguration),
    ),
    validateRegistration: vi.spyOn(client.auth, 'validateRegistration').mockResolvedValue({
      usernameAvailable: true,
      emailAvailable: true,
      passwordValid: true,
      passwordErrors: [],
    } as never),
    validateRegistrationToken: vi.spyOn(client.auth, 'validateRegistrationToken').mockResolvedValue(true),
    tokenDetails: vi.spyOn(client.auth, 'getRegistrationTokenDetails').mockResolvedValue(null),
    registerOpen: vi
      .spyOn(client.auth, 'registerOpen')
      .mockResolvedValue({ success: true, message: 'ok', userId: 'user-1' }),
    registerWithToken: vi.spyOn(client.auth, 'registerWithToken').mockResolvedValue(authResponse()),
    login: vi.spyOn(client.auth, 'login').mockResolvedValue(authResponse()),
    selfSubscribe: vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue({ success: true } as never),
    linkTransaction: vi.spyOn(client.payment, 'linkTransactionToUser').mockResolvedValue(true),
    paymentConfig: vi.spyOn(client.payment, 'getAppPaymentConfiguration').mockResolvedValue({
      appId: 'test-app-id',
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
    } as never),
    quote: vi.spyOn(client.appTier, 'quoteAddOnCheckout'),
    createCard: vi.spyOn(client.appTier, 'createCheckoutPaymentMethod'),
    checkout: vi.spyOn(client.appTier, 'checkoutAddOns'),
    completeCheckout: vi.spyOn(client.appTier, 'completeAddOnCheckout'),
  };

  return stubs;
}

export type SignupStubs = ReturnType<typeof signupClient>;

/** The element carrying a `data-ww-*` hook, or null. */
export function stepOf(container: HTMLElement): string | null {
  return container.querySelector<HTMLElement>('[data-ww-step]')?.getAttribute('data-ww-step') ?? null;
}

/** Fill the registration form and submit it. */
export async function submitRegistration(
  buttonName: 'Continue' | 'Create Account',
  values: { email?: string; password?: string } = {},
) {
  const email = values.email ?? 'ada@example.com';
  const password = values.password ?? 'Sup3rSecret!';

  await screen.findByText('Create Your Account');
  fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Lovelace' } });
  if ((screen.getByLabelText('Email Address *') as HTMLInputElement).value === '') {
    fireEvent.change(screen.getByLabelText('Email Address *'), { target: { value: email } });
  }
  fireEvent.change(screen.getByLabelText('Password *'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm Password *'), { target: { value: password } });

  fireEvent.click(screen.getByRole('button', { name: buttonName }));
  await waitFor(() => expect(screen.queryByRole('button', { name: buttonName })).toBeNull());
}
