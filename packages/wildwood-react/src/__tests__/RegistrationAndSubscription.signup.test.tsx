/**
 * The signup view: the pay-first order, what a registration token skips, and what happens when the
 * server says no.
 *
 * PaymentComponent and DisclaimerComponent are replaced with two-line stand-ins — they have suites
 * of their own, and what matters here is that the flow hands them the right props and does the
 * right thing with their callbacks. The registration form is the real one, because the modes it is
 * driven with (open, token-only, invite) are half of what this view decides.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { WildwoodError, formatMoney } from '@wildwood/core';
import type { PaymentComponentProps } from '../components/payment/PaymentComponent.js';
import type { DisclaimerComponentProps } from '../components/disclaimer/DisclaimerComponent.js';
import { clearPublicCatalogCache } from '@wildwood/react-shared';
import { createWrapper } from './testUtils.js';
import {
  ALL_TIERS,
  PRO_ANNUAL,
  PRO_MONTHLY,
  authResponse,
  freeTier,
  proTier,
  signupClient,
  stepOf,
  submitRegistration,
  type SignupStubs,
} from './signupHarness.js';

const payment = vi.hoisted(() => ({ props: null as PaymentComponentProps | null }));

vi.mock('../components/payment/PaymentComponent.js', () => ({
  PaymentComponent: (props: PaymentComponentProps) => {
    payment.props = props;
    return (
      <div data-testid="payment">
        <button
          type="button"
          onClick={() =>
            props.onPaymentSuccess?.({
              success: true,
              transactionId: 'txn-1',
              paymentIntentId: 'pi_1',
              status: 'Completed',
            })
          }
        >
          Pay
        </button>
      </div>
    );
  },
}));

vi.mock('../components/disclaimer/DisclaimerComponent.js', () => ({
  DisclaimerComponent: ({ onAllAccepted }: DisclaimerComponentProps) => (
    <button type="button" onClick={() => onAllAccepted?.()}>
      Accept
    </button>
  ),
}));

const { RegistrationSubscriptionSignup } = await import('../index.js');
type SignupProps = Parameters<typeof RegistrationSubscriptionSignup>[0];

function renderSignup(props: Partial<SignupProps> = {}, stubs: SignupStubs = signupClient()) {
  const view = render(<RegistrationSubscriptionSignup {...props} />, { wrapper: createWrapper(stubs.client) });
  return { ...view, stubs };
}

/** The pending disclaimer a login can come back with. */
const pendingDisclaimer = [{ disclaimerId: 'd-1', versionId: 'v-1', title: 'Terms' }] as never;

beforeEach(() => {
  clearPublicCatalogCache();
  payment.props = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearPublicCatalogCache();
});

// ── Where a visitor comes in ───────────────────────────────────────────────────

describe('signup view - the way in', () => {
  it('opens the form with the optional token card when the app takes both', async () => {
    const { container } = renderSignup();

    await screen.findByText('Create Your Account');
    expect(stepOf(container)).toBe('register');
    expect(screen.getByText('Have a Registration Token?')).toBeTruthy();
    // A plan is still to be chosen, so the form continues rather than finishing.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('requires the token when the app only takes token registrations', async () => {
    const stubs = signupClient({ authConfig: { allowOpenRegistration: false, allowTokenRegistration: true } });
    renderSignup({}, stubs);

    await screen.findByText('Registration Token Required');
    expect(screen.queryByText('Have a Registration Token?')).toBeNull();
  });

  it('says registration is closed, and lets the host say it differently', async () => {
    const stubs = signupClient({ authConfig: { allowOpenRegistration: false, allowTokenRegistration: false } });
    const { container, unmount } = renderSignup({ contactUrl: '/contact' }, stubs);

    await waitFor(() => expect(stepOf(container)).toBe('closed'));
    expect(screen.getByText('Registration is closed')).toBeTruthy();
    expect(screen.queryByText('Create Your Account')).toBeNull();
    unmount();

    clearPublicCatalogCache();
    const closed = signupClient({ authConfig: { allowOpenRegistration: false, allowTokenRegistration: false } });
    renderSignup({ renderClosed: () => <p>Ask your administrator</p> }, closed);
    await screen.findByText('Ask your administrator');
    expect(screen.queryByText('Registration is closed')).toBeNull();
  });

  it('hands a signed-in visitor back to the host, once, and offers no second account', async () => {
    const onAlreadySignedIn = vi.fn();
    const stubs = signupClient({ signedIn: true });
    const { rerender } = renderSignup({ onAlreadySignedIn }, stubs);

    await waitFor(() => expect(onAlreadySignedIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Create Your Account')).toBeNull();

    rerender(<RegistrationSubscriptionSignup onAlreadySignedIn={onAlreadySignedIn} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onAlreadySignedIn).toHaveBeenCalledTimes(1);
  });

  it('backs out through the host', async () => {
    const onCancel = vi.fn();
    renderSignup({ onCancel });

    await screen.findByText('Create Your Account');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ── What the link already chose ────────────────────────────────────────────────

describe('signup view - the plan', () => {
  it('shows a preselected plan at the live price and skips the plan step', async () => {
    const { container } = renderSignup({
      preSelectedTierId: 'tier-pro',
      preSelectedPricingId: 'price-pro-annual',
    });

    await screen.findByText('Create Your Account');
    const summary = container.querySelector('.ww-plan-summary-card');
    expect(summary?.textContent).toContain('Pro');
    expect(summary?.textContent).toContain(formatMoney(PRO_ANNUAL, 'USD'));
    // Nothing left to choose, so the form creates the account.
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('payment'));
    expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  });

  it('ignores a plan the app does not sell', async () => {
    const { container } = renderSignup({ preSelectedTierId: 'tier-that-went-away' });

    await screen.findByText('Create Your Account');
    expect(container.querySelector('.ww-plan-summary-card')).toBeNull();

    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));
    expect(container.querySelectorAll('.ww-tier-card')).toHaveLength(ALL_TIERS.length);
  });

  it("planDefault 'free' opens the grid on the free plan without choosing it for them", async () => {
    const { container } = renderSignup({ planDefault: 'free' });

    // A suggestion is not a choice: the plan step still runs, and the form still only continues.
    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));

    const starter = [...container.querySelectorAll<HTMLElement>('.ww-tier-card')].find(
      (card) => card.querySelector('h3')?.textContent === 'Starter',
    );
    expect(starter?.className).toContain('ww-tier-preselected');
    expect(starter?.querySelector('button')?.textContent).toBe('Continue with This Plan');
  });

  it("planDefault 'free' does not stop a preselected plan from skipping the step", async () => {
    const { container } = renderSignup({ preSelectedTierId: 'tier-pro', planDefault: 'free' });

    await screen.findByText('Create Your Account');
    expect(container.querySelector('.ww-plan-summary-card')?.textContent).toContain('Pro');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();

    await submitRegistration('Create Account');
    // Straight to the card for the link's plan: there is no plan step left for a default to open.
    await waitFor(() => expect(stepOf(container)).toBe('payment'));
    expect(payment.props?.amount).toBe(PRO_MONTHLY);
  });

  it('leaves the grid with nothing preselected when the host names no default', async () => {
    const { container } = renderSignup();

    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));
    expect(container.querySelector('.ww-tier-preselected')).toBeNull();
  });

  it("planDefault 'free' suggests nothing when the app sells no free plan", async () => {
    const stubs = signupClient({ tiers: [proTier] });
    const { container } = renderSignup({ planDefault: 'free' }, stubs);

    // Nothing to suggest is not a failure: the grid is the one it would have been anyway.
    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));
    expect(container.querySelector('.ww-tier-preselected')).toBeNull();
  });

  it("planDefault 'free' suggests nothing while an invite is being redeemed", async () => {
    const stubs = signupClient();
    const { container } = renderSignup(
      { tokenMode: 'required', registrationToken: 'INVITE-1', planDefault: 'free' },
      stubs,
    );

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    // The invite's plan comes from its token: the grid never appeared for a default to open on.
    expect(container.querySelector('.ww-tier-grid')).toBeNull();
    expect(stubs.registerWithToken).toHaveBeenCalledTimes(1);
  });

  it("planSelection 'skip' takes the app's default plan and ignores the link", async () => {
    const stubs = signupClient();
    const { container } = renderSignup({ planSelection: 'skip', preSelectedTierId: 'tier-pro' }, stubs);

    await screen.findByText('Create Your Account');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    // The default plan, not the one the URL asked for.
    expect(stubs.selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-free', 'price-free', undefined);
  });

  it('changes the plan before the form is filled in without running ahead of it', async () => {
    const onSignupComplete = vi.fn();
    const stubs = signupClient();
    const { container } = renderSignup({ preSelectedTierId: 'tier-pro', onSignupComplete }, stubs);

    await screen.findByText('Create Your Account');
    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }));
    await waitFor(() => expect(stepOf(container)).toBe('plan'));

    const starter = [...container.querySelectorAll<HTMLElement>('.ww-tier-card')].find(
      (card) => card.querySelector('h3')?.textContent === 'Starter',
    );
    fireEvent.click(starter!.querySelector('button')!);

    // Back to the form with the new plan on it — not on to a card form or an account creation with
    // nothing to create it from.
    await waitFor(() => expect(stepOf(container)).toBe('register'));
    expect(container.querySelector('.ww-plan-summary-card')?.textContent).toContain('Starter');
    expect(stubs.registerOpen).not.toHaveBeenCalled();
    expect(payment.props).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Something Went Wrong' })).toBeNull();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(stubs.registerOpen).toHaveBeenCalledTimes(1);
    // The plan they changed to, not the one the link asked for.
    expect(stubs.selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-free', 'price-free', undefined);
  });

  it('takes the card only after the form when the changed plan is a paid one', async () => {
    const stubs = signupClient({ tiers: [proTier, freeTier] });
    const { container } = renderSignup({ preSelectedTierId: 'tier-free' }, stubs);

    await screen.findByText('Create Your Account');
    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }));
    await waitFor(() => expect(stepOf(container)).toBe('plan'));

    const pro = [...container.querySelectorAll<HTMLElement>('.ww-tier-card')].find(
      (card) => card.querySelector('h3')?.textContent === 'Pro',
    );
    fireEvent.click(pro!.querySelector('button')!);

    // No card before the details: a Stripe intent confirmed here would be stranded.
    await waitFor(() => expect(stepOf(container)).toBe('register'));
    expect(payment.props).toBeNull();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('payment'));
    expect(payment.props?.amount).toBe(PRO_MONTHLY);
    expect(payment.props?.customerEmail).toBe('ada@example.com');
  });

  it('offers the packs and carries the ticked ones into the checkout', async () => {
    const stubs = signupClient();
    // Nothing answers the quote, so the flow parks on the checkout with the basket it was given.
    stubs.quote.mockReturnValue(new Promise(() => {}));
    const { container } = renderSignup({ planSelection: 'skip', packSelection: 'multi' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('packs'));

    fireEvent.click(container.querySelector<HTMLElement>('[data-ww-pack="pack-ai"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 1 pack' }));

    await waitFor(() => expect(stubs.quote).toHaveBeenCalledWith('test-app-id', [{ addOnId: 'pack-ai' }]));
    expect(stepOf(container)).toBe('packCheckout');
  });

  it('finishes without packs when the pack step is skipped', async () => {
    const stubs = signupClient();
    const { container } = renderSignup({ planSelection: 'skip', packSelection: 'multi' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('packs'));

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(stubs.quote).not.toHaveBeenCalled();
  });

  it('walks the grid, creates the account and reports the outcome', async () => {
    const onSignupComplete = vi.fn();
    const onAlreadySignedIn = vi.fn();
    const stubs = signupClient();
    const { container } = renderSignup({ onSignupComplete, onAlreadySignedIn }, stubs);

    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));

    const starter = [...container.querySelectorAll<HTMLElement>('.ww-tier-card')].find(
      (card) => card.querySelector('h3')?.textContent === 'Starter',
    );
    fireEvent.click(starter!.querySelector('button')!);

    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(screen.getByRole('heading', { name: /All Set/i })).toBeTruthy();
    // A free plan takes no card at all.
    expect(payment.props).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete).toHaveBeenCalledTimes(1);
    expect(onSignupComplete.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      tier: { tierId: 'tier-free', name: 'Starter' },
      packs: [],
    });
    // The login inside the flow is not "you were already signed in".
    expect(onAlreadySignedIn).not.toHaveBeenCalled();
  });
});

// ── Paying before the account exists ───────────────────────────────────────────

describe('signup view - the card', () => {
  it('takes the card first, then registers, links it and subscribes once', async () => {
    const stubs = signupClient();
    const { container } = renderSignup(
      { preSelectedTierId: 'tier-pro', preSelectedPricingId: 'price-pro-monthly', requireBillingAddress: true },
      stubs,
    );

    await submitRegistration('Create Account', { email: 'ada@example.com' });
    await waitFor(() => expect(stepOf(container)).toBe('payment'));

    // The card form is asked for exactly what the catalog is quoting, for this visitor.
    expect(payment.props?.amount).toBe(PRO_MONTHLY);
    expect(payment.props?.currency).toBe('USD');
    expect(payment.props?.customerEmail).toBe('ada@example.com');
    expect(payment.props?.trialDays).toBe(14);
    expect(payment.props?.isSubscription).toBe(true);
    expect(payment.props?.requireBillingAddress).toBe(true);
    // The account does not exist yet: nothing has been registered.
    expect(stubs.registerOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));

    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(stubs.registerOpen).toHaveBeenCalledTimes(1);
    // Linked by the provider's own id, which is what the server looks a transaction up by.
    expect(stubs.linkTransaction).toHaveBeenCalledWith('pi_1', 'user-1');
    expect(stubs.selfSubscribe).toHaveBeenCalledTimes(1);
    expect(stubs.selfSubscribe).toHaveBeenCalledWith('test-app-id', 'tier-pro', 'price-pro-monthly', 'txn-1');
    expect(screen.getByText(/your 14-day free trial has started/)).toBeTruthy();
  });

  it('says the plan is pending when the server refuses the subscription', async () => {
    const stubs = signupClient();
    stubs.selfSubscribe.mockRejectedValue(new Error('no seats left'));
    const { container } = renderSignup({ planSelection: 'skip' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(screen.getByText(/Plan activation is pending/)).toBeTruthy();
  });
});

// ── Registration tokens ────────────────────────────────────────────────────────

describe('signup view - registration tokens', () => {
  const grant = {
    appId: 'test-app-id',
    appName: 'Test',
    appTierId: 'tier-pro',
    appTierName: 'Pro',
    appTierPricingId: 'price-pro-monthly',
    pricingName: 'Monthly',
    addOnIds: ['pack-docs'],
    addOnNames: ['Docs Pack'],
    featureCodes: ['DOCUMENTS'],
    featureNames: ['Documents'],
  };

  it('shows what the token includes, skips the plan and the card, and never subscribes over it', async () => {
    const onSignupComplete = vi.fn();
    const stubs = signupClient();
    stubs.tokenDetails.mockResolvedValue({ isValid: true, appGrants: [grant] });
    const { container } = renderSignup({ registrationToken: 'TOKEN-1', onSignupComplete }, stubs);

    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    const panel = container.querySelector('.ww-token-plan-summary');
    expect(panel?.textContent).toContain('Your registration token includes');
    expect(panel?.textContent).toContain('Pro');
    expect(panel?.textContent).toContain('Monthly');
    expect(panel?.textContent).toContain('Docs Pack');
    expect(panel?.textContent).toContain('Documents');

    expect(stubs.registerWithToken).toHaveBeenCalledTimes(1);
    // The token issuer is paying for the plan; subscribing over it would replace what they bought.
    expect(stubs.selfSubscribe).not.toHaveBeenCalled();
    expect(payment.props).toBeNull();
    expect(screen.getByText(/created with the Pro from your registration token/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onSignupComplete.mock.calls[0]?.[0]).toMatchObject({
      tokenGrant: { tierId: 'tier-pro', addOnIds: ['pack-docs'], featureCodes: ['DOCUMENTS'] },
      packs: [{ addOnId: 'pack-docs', name: 'Docs Pack', status: 'granted' }],
    });
  });

  it('sends a rejected token back to the form with the server reason', async () => {
    const onError = vi.fn();
    const stubs = signupClient();
    stubs.tokenDetails.mockResolvedValue({ isValid: false, errorMessage: 'That token has expired.', appGrants: [] });
    const { container } = renderSignup({ registrationToken: 'TOKEN-OLD', onError }, stubs);

    await submitRegistration('Continue');

    await screen.findByText('That token has expired.');
    expect(stepOf(container)).toBe('register');
    expect(stubs.registerWithToken).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({ code: 'registration_token_rejected', message: 'That token has expired.' });
  });

  it('carries on normally when the token grants nothing for this app', async () => {
    const stubs = signupClient();
    stubs.tokenDetails.mockResolvedValue({ isValid: true, appGrants: [{ ...grant, appId: 'another-app' }] });
    const { container } = renderSignup({ registrationToken: 'TOKEN-2' }, stubs);

    await submitRegistration('Continue');
    await waitFor(() => expect(stepOf(container)).toBe('plan'));
    expect(container.querySelector('.ww-token-plan-summary')).toBeNull();
  });

  it('an invite prefills the email as the username and asks for nothing else', async () => {
    const stubs = signupClient({ authConfig: { allowOpenRegistration: true, allowTokenRegistration: true } });
    stubs.tokenDetails.mockResolvedValue({ isValid: true, appGrants: [grant] });
    const { container } = renderSignup(
      { tokenMode: 'required', registrationToken: 'INVITE-1', prefillEmail: 'ada@example.com' },
      stubs,
    );

    await screen.findByText('Create Your Account');
    expect((screen.getByLabelText('Username *') as HTMLInputElement).value).toBe('ada@example.com');
    expect((screen.getByLabelText('Email Address *') as HTMLInputElement).value).toBe('ada@example.com');
    // An invite is redeemed, not shopped: no plan and no packs, whatever the app's own flags say.
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('success'));
    expect(stubs.registerWithToken).toHaveBeenCalledTimes(1);
    expect(payment.props).toBeNull();
    expect(stubs.quote).not.toHaveBeenCalled();
  });
});

// ── When something goes wrong ──────────────────────────────────────────────────

describe('signup view - failures', () => {
  it('shows the server refusal and reports its code', async () => {
    const onError = vi.fn();
    const stubs = signupClient();
    stubs.registerOpen.mockRejectedValue(
      new WildwoodError('Registration is not allowed for this app', 403, undefined, {
        errorCode: 'RegistrationNotAllowed',
      }),
    );
    const { container } = renderSignup({ planSelection: 'skip', onError }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('failed'));

    expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeTruthy();
    expect(container.querySelector('.ww-signup-processing .ww-text-muted')?.textContent).toBe(
      'Registration is not allowed for this app',
    );
    expect(onError).toHaveBeenCalledWith({
      code: 'RegistrationNotAllowed',
      message: 'Registration is not allowed for this app',
    });
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Over' })).toBeTruthy();
  });

  it('resumes at the step that failed instead of registering the same person twice', async () => {
    const stubs = signupClient();
    stubs.login.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { container } = renderSignup({ planSelection: 'skip' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('failed'));
    expect(stubs.registerOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(stepOf(container)).toBe('success'));

    expect(stubs.registerOpen).toHaveBeenCalledTimes(1);
    expect(stubs.login).toHaveBeenCalledTimes(2);
  });

  it('starts over back at the form, with what was typed still in it', async () => {
    const stubs = signupClient();
    stubs.registerOpen.mockRejectedValueOnce(new Error('nope'));
    const { container } = renderSignup({ planSelection: 'skip' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('failed'));

    fireEvent.click(screen.getByRole('button', { name: 'Start Over' }));
    await waitFor(() => expect(stepOf(container)).toBe('register'));
    expect((screen.getByLabelText('Email Address *') as HTMLInputElement).value).toBe('ada@example.com');
  });
});

// ── Disclaimers ────────────────────────────────────────────────────────────────

describe('signup view - disclaimers', () => {
  it('holds the signup at the disclaimers the login reported', async () => {
    const stubs = signupClient();
    stubs.login.mockResolvedValue(
      authResponse({ requiresDisclaimerAcceptance: true, pendingDisclaimers: pendingDisclaimer }),
    );
    const { container } = renderSignup({ planSelection: 'skip' }, stubs);

    await submitRegistration('Create Account');
    await waitFor(() => expect(stepOf(container)).toBe('disclaimers'));
    expect(container.querySelector('.ww-signup-disclaimers')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(stepOf(container)).toBe('success'));
  });
});
