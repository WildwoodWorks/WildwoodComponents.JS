/**
 * The signup wizard decides the plan from what the user brings:
 * - a registration token that carries a plan for this app IS the plan: no plan picker, no payment, and no
 *   self-subscribe afterwards (that would cancel the subscription the token just created);
 * - a paid plan with a free trial is presented as a trial, not as a charge.
 *
 * And the payment's own "Continue" button only moves the user along: the signup already ran when the
 * payment succeeded, so clicking it must not create the account a second time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import type { AppTierModel, PaymentCompletionResult, RegistrationFormData } from '@wildwood/core';
import { createTestClient, createWrapper } from './testUtils.js';

let formData: RegistrationFormData;

interface CapturedPaymentProps {
  trialDays?: number;
  onPaymentSuccess?: (result: PaymentCompletionResult) => void;
  onContinue?: (result: PaymentCompletionResult) => void;
}
let paymentProps: CapturedPaymentProps = {};

vi.mock('../components/registration/TokenRegistrationComponent.js', async () => {
  const { createElement, useEffect } = await import('react');
  return {
    TokenRegistrationComponent: ({
      onFormDataCollected,
    }: {
      onFormDataCollected: (d: RegistrationFormData) => void;
    }) => {
      // Submit once, as if the user filled the form in.
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

vi.mock('../components/payment/PaymentComponent.js', async () => {
  const { createElement } = await import('react');
  return {
    PaymentComponent: (props: CapturedPaymentProps) => {
      // Kept so the test can drive the real callbacks the wizard hands the payment form.
      paymentProps = props;
      return createElement('div', null, `payment form (trial: ${props.trialDays ?? 'none'})`);
    },
  };
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  paymentProps = {};
});

describe('SignupWithSubscriptionComponent', () => {
  it('registers with a plan-carrying token without picking, paying for or self-subscribing to a plan', async () => {
    const client = createTestClient();
    formData = { ...user, useToken: true, registrationToken: 'TOKEN-PRO' };
    vi.spyOn(client.auth, 'getRegistrationTokenDetails').mockResolvedValue({
      isValid: true,
      appGrants: [
        { appId: 'TEST-APP-ID', appTierId: 'tier-pro', appTierName: 'Professional', addOnIds: [], featureCodes: [] },
      ],
    });
    const registerWithToken = vi.spyOn(client.auth, 'registerWithToken').mockResolvedValue({ jwtToken: '' } as never);
    vi.spyOn(client.auth, 'login').mockResolvedValue({ jwtToken: '' } as never);
    const selfSubscribe = vi.spyOn(client.appTier, 'selfSubscribe');

    render(<SignupWithSubscriptionComponent appId="test-app-id" preSelectedTierId={undefined} />, {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(screen.getByText(/created with the Professional from your registration token/)).toBeTruthy(),
    );
    expect(registerWithToken).toHaveBeenCalledWith(expect.objectContaining({ registrationToken: 'TOKEN-PRO' }));
    expect(selfSubscribe).not.toHaveBeenCalled();
    expect(screen.queryByText('plan picker')).toBeNull();
  });

  it('continues to the plan picker when the token carries no plan for this app', async () => {
    const client = createTestClient();
    formData = { ...user, useToken: true, registrationToken: 'TOKEN-ACCESS' };
    vi.spyOn(client.auth, 'getRegistrationTokenDetails').mockResolvedValue({
      isValid: true,
      appGrants: [{ appId: 'another-app', appTierId: 'tier-x', addOnIds: [], featureCodes: [] }],
    });
    const registerWithToken = vi.spyOn(client.auth, 'registerWithToken');

    render(<SignupWithSubscriptionComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    await waitFor(() => expect(screen.getByText('plan picker')).toBeTruthy());
    expect(registerWithToken).not.toHaveBeenCalled();
  });

  it('finishes signup with the plan pending when the server refuses the subscription', async () => {
    const client = createTestClient();
    formData = { ...user, useToken: false };
    const freeTier: AppTierModel = {
      ...proTier,
      id: 'tier-free',
      name: 'Starter',
      isFreeTier: true,
      pricingOptions: [],
    };
    vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue([freeTier]);
    vi.spyOn(client.auth, 'registerOpen').mockResolvedValue({ success: true, message: '' });
    vi.spyOn(client.auth, 'login').mockResolvedValue({ jwtToken: '' } as never);
    // A 4xx over HTTP/2: thrown, with no status text.
    vi.spyOn(client.appTier, 'selfSubscribe').mockRejectedValue(new Error(''));

    render(<SignupWithSubscriptionComponent appId="test-app-id" preSelectedTierId="tier-free" />, {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(screen.getByText(/Plan activation is pending/)).toBeTruthy());
    expect(screen.queryByText('Activating your plan...')).toBeNull();
  });

  it('presents a pre-selected paid plan with a trial as a trial at the payment step', async () => {
    const client = createTestClient();
    formData = { ...user, useToken: false };
    vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue([proTier]);

    render(<SignupWithSubscriptionComponent appId="test-app-id" preSelectedTierId="tier-pro" />, {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(screen.getByText('payment form (trial: 14)')).toBeTruthy());
    expect(screen.getByText(/14-day free trial\. Due today: \$0\.00/)).toBeTruthy();
  });

  it('stays on the payment step while the signup runs, and Continue advances without signing up again', async () => {
    const client = createTestClient();
    formData = { ...user, useToken: false };
    vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue([proTier]);
    const registerOpen = vi.spyOn(client.auth, 'registerOpen').mockResolvedValue({ success: true, message: '' });
    vi.spyOn(client.auth, 'login').mockResolvedValue({ jwtToken: '' } as never);
    const selfSubscribe = vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue({ success: true } as never);

    render(<SignupWithSubscriptionComponent appId="test-app-id" preSelectedTierId="tier-pro" />, {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(screen.getByText('payment form (trial: 14)')).toBeTruthy());

    const result = { success: true, transactionId: 'txn-1', paymentIntentId: 'pi_1' } as PaymentCompletionResult;
    await act(async () => {
      paymentProps.onPaymentSuccess?.(result);
    });

    // The payment step is still mounted, so a real PaymentComponent's success panel — and its Continue
    // button — stays on screen while the account is created behind it.
    await waitFor(() => expect(registerOpen).toHaveBeenCalledTimes(1));
    expect(screen.getByText('payment form (trial: 14)')).toBeTruthy();
    expect(screen.queryByText(/All Set/)).toBeNull();

    // Continue is what moves the wizard on, and it never signs the user up a second time.
    expect(typeof paymentProps.onContinue).toBe('function');
    await act(async () => {
      paymentProps.onContinue?.(result);
    });

    await waitFor(() => expect(screen.getByText(/All Set/)).toBeTruthy());
    expect(registerOpen).toHaveBeenCalledTimes(1);
    expect(selfSubscribe).toHaveBeenCalledTimes(1);
  });
});
