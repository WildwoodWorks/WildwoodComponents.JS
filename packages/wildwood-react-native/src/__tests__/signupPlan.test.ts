import { describe, it, expect, vi } from 'vitest';
import type { AppTierChangeResultModel, RegistrationTokenDetails } from '@wildwood/core';

// The wizard's plan decisions are exercised as the functions it calls: this package has no React
// renderer (no react-dom / @testing-library), and the rules — not the markup — are what these fixes
// are about. The rendered flow is covered in @wildwood/react.
import { activateSignupPlan, findTokenPlanGrant, signupSuccessMessage } from '../components/signupPlan';

const APP_ID = 'App-Id-1';

const grant = (over: Record<string, unknown> = {}) => ({
  appId: APP_ID,
  appTierId: 'tier-pro',
  appTierName: 'Pro',
  addOnIds: [],
  featureCodes: [],
  ...over,
});

const details = (appGrants: ReturnType<typeof grant>[]): RegistrationTokenDetails => ({
  isValid: true,
  appGrants,
});

const subscribed: AppTierChangeResultModel = { success: true, errorMessage: '', isScheduled: false };

describe('findTokenPlanGrant', () => {
  it('matches the app id case-insensitively', () => {
    expect(findTokenPlanGrant(details([grant({ appId: 'APP-ID-1' })]), 'app-id-1')?.appTierName).toBe('Pro');
  });

  it('ignores grants for other apps', () => {
    expect(findTokenPlanGrant(details([grant({ appId: 'another-app' })]), APP_ID)).toBeNull();
  });

  it('treats unreadable details as no grant, not as an invalid token', () => {
    // `getRegistrationTokenDetails` answers null when the endpoint is missing or the call failed.
    // The token may still be perfectly good, so the wizard just carries on with its normal flow.
    expect(findTokenPlanGrant(null, APP_ID)).toBeNull();
    expect(findTokenPlanGrant(undefined, APP_ID)).toBeNull();
    expect(findTokenPlanGrant(details([]), APP_ID)).toBeNull();
  });

  it('is null when there is no app to match against', () => {
    expect(findTokenPlanGrant(details([grant()]), '')).toBeNull();
  });
});

describe('activateSignupPlan', () => {
  it('never subscribes over a plan the registration token granted', async () => {
    // The live bug: self-subscribing REPLACES the subscription the token just created, cancelling
    // the plan the user was invited onto.
    const selfSubscribe = vi.fn().mockResolvedValue(subscribed);

    const activation = await activateSignupPlan({
      tier: { id: 'tier-pro' },
      pricing: { id: 'price-monthly' },
      tokenGrant: grant(),
      selfSubscribe,
    });

    expect(selfSubscribe).not.toHaveBeenCalled();
    expect(activation).toEqual({ attempted: false, failed: false });
  });

  it('does nothing when no plan was chosen', async () => {
    const selfSubscribe = vi.fn();

    const activation = await activateSignupPlan({ tier: null, pricing: null, tokenGrant: null, selfSubscribe });

    expect(selfSubscribe).not.toHaveBeenCalled();
    expect(activation).toEqual({ attempted: false, failed: false });
  });

  it('subscribes to the chosen plan with its pricing option and the payment', async () => {
    const selfSubscribe = vi.fn().mockResolvedValue(subscribed);

    const activation = await activateSignupPlan({
      tier: { id: 'tier-pro' },
      pricing: { id: 'price-monthly' },
      tokenGrant: null,
      paymentTransactionId: 'txn-1',
      selfSubscribe,
    });

    expect(selfSubscribe).toHaveBeenCalledWith('tier-pro', 'price-monthly', 'txn-1');
    expect(activation).toEqual({ attempted: true, failed: false });
  });

  it('reports a refusal instead of failing the whole signup', async () => {
    const activation = await activateSignupPlan({
      tier: { id: 'tier-pro' },
      pricing: null,
      tokenGrant: null,
      selfSubscribe: vi.fn().mockResolvedValue({ success: false, errorMessage: 'No provider', isScheduled: false }),
    });

    expect(activation).toEqual({ attempted: true, failed: true, errorMessage: 'No provider' });
  });

  it('treats a rejection (the server 4xx) exactly like a refusal — it never throws', async () => {
    // Before this, a 4xx threw out of the wizard and failed a signup whose account already existed.
    const activation = await activateSignupPlan({
      tier: { id: 'tier-pro' },
      pricing: null,
      tokenGrant: null,
      selfSubscribe: vi.fn().mockRejectedValue(new Error('400: Payment is required')),
    });

    expect(activation).toEqual({ attempted: true, failed: true, errorMessage: '400: Payment is required' });
  });
});

describe('signupSuccessMessage', () => {
  it('names the plan a registration token set up', () => {
    expect(signupSuccessMessage({ tokenGrant: grant(), accountOnly: false, subscriptionFailed: false })).toBe(
      'Your account has been created with the Pro from your registration token.',
    );
    expect(
      signupSuccessMessage({
        tokenGrant: grant({ appTierName: undefined }),
        accountOnly: false,
        subscriptionFailed: false,
      }),
    ).toBe('Your account has been created with the plan from your registration token.');
  });

  it('says the account is ready when no plan was offered', () => {
    expect(signupSuccessMessage({ tokenGrant: null, accountOnly: true, subscriptionFailed: false })).toBe(
      'Your account has been created successfully.',
    );
  });

  it('says activation is pending when the plan was refused', () => {
    expect(signupSuccessMessage({ tokenGrant: null, accountOnly: false, subscriptionFailed: true })).toBe(
      'Your account is ready! Plan activation is pending — you can select a plan from your dashboard.',
    );
  });

  it('announces a trial that has started', () => {
    expect(
      signupSuccessMessage({ tokenGrant: null, accountOnly: false, subscriptionFailed: false, trialDays: 14 }),
    ).toBe('Your account has been created and your 14-day free trial has started.');
  });

  it('otherwise says the plan is active', () => {
    expect(
      signupSuccessMessage({ tokenGrant: null, accountOnly: false, subscriptionFailed: false, trialDays: 0 }),
    ).toBe('Your account has been created and your plan is active.');
  });
});
