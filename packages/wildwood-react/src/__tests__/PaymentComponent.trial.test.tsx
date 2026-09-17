/**
 * A subscription that starts with a free trial charges nothing at signup, but the card still has to be
 * saved or there is nothing to charge when the trial ends. PaymentComponent asks the server for a
 * SetupIntent in that case and confirms it with Stripe instead of confirming a payment.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import type { PaymentProviderDto } from '@wildwood/core';

const initiatePayment = vi.fn();
const confirmPayment = vi.fn();

vi.mock('../hooks/usePayment.js', () => ({
  usePayment: () => ({
    loading: false,
    error: null,
    savedMethods: [],
    getAppPaymentConfiguration: vi.fn(),
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

const { PaymentComponent } = await import('../components/payment/PaymentComponent.js');

const stripeProvider = {
  id: 'prov-stripe',
  name: 'Stripe',
  providerType: 1,
  isEnabled: true,
  isDefault: true,
  publishableKey: 'pk_test_123',
} as unknown as PaymentProviderDto;

let cardChange: ((e: { complete: boolean; empty: boolean }) => void) | undefined;
const confirmCardSetup = vi.fn();
const confirmCardPayment = vi.fn();

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
    confirmCardPayment,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete window.Stripe;
});

async function renderWithCompleteCard(props: Partial<Parameters<typeof PaymentComponent>[0]> = {}) {
  const onPaymentSuccess = vi.fn();
  render(
    <PaymentComponent
      appId="app-1"
      amount={99}
      pricingModelId="pm-monthly"
      isSubscription
      preloadedProviders={[stripeProvider]}
      onPaymentSuccess={onPaymentSuccess}
      {...props}
    />,
  );
  await waitFor(() => expect(cardChange).toBeDefined());
  act(() => cardChange!({ complete: true, empty: false }));
  return { onPaymentSuccess };
}

describe('PaymentComponent free trial', () => {
  it('offers the trial instead of a charge', async () => {
    await renderWithCompleteCard({ trialDays: 14 });

    expect(screen.getByRole('button', { name: /Start 14-day free trial/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
    expect(screen.getByText(/won't be charged today/)).toBeTruthy();
  });

  it('saves the card through the SetupIntent and reports success without charging', async () => {
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'seti_1',
      clientSecret: 'seti_1_secret_abc',
      clientSecretType: 'setup_intent',
      subscriptionId: 'sub_1',
      trialDays: 14,
      trialEnd: '2026-10-01T00:00:00Z',
    });
    confirmCardSetup.mockResolvedValue({ setupIntent: { id: 'seti_1', status: 'succeeded' } });
    confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-1', paymentIntentId: 'seti_1' });

    const { onPaymentSuccess } = await renderWithCompleteCard({ trialDays: 14 });
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));

    await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalled());
    expect(initiatePayment).toHaveBeenCalledWith(expect.objectContaining({ supportsSetupIntent: true }));
    expect(confirmCardSetup).toHaveBeenCalledWith('seti_1_secret_abc', expect.anything());
    expect(confirmCardPayment).not.toHaveBeenCalled();
    expect(confirmPayment).toHaveBeenCalledWith('seti_1', 1);
    expect(onPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'txn-1', paymentIntentId: 'seti_1', subscriptionId: 'sub_1' }),
    );
    expect(screen.getByText('Your free trial has started!')).toBeTruthy();
  });

  it('shows the card error and does not complete when the card setup fails', async () => {
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'seti_1',
      clientSecret: 'seti_1_secret_abc',
      clientSecretType: 'setup_intent',
    });
    confirmCardSetup.mockResolvedValue({ error: { message: 'Your card was declined.' } });

    const { onPaymentSuccess } = await renderWithCompleteCard({ trialDays: 14 });
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));

    await waitFor(() => expect(screen.getByText('Your card was declined.')).toBeTruthy());
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(onPaymentSuccess).not.toHaveBeenCalled();
  });

  it('retries a declined card on the same SetupIntent instead of starting another subscription', async () => {
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'seti_1',
      clientSecret: 'seti_1_secret_abc',
      clientSecretType: 'setup_intent',
      subscriptionId: 'sub_1',
    });
    confirmCardSetup
      .mockResolvedValueOnce({ error: { message: 'Your card was declined.' } })
      .mockResolvedValueOnce({ setupIntent: { id: 'seti_1', status: 'succeeded' } });
    confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-1', paymentIntentId: 'seti_1' });

    const { onPaymentSuccess } = await renderWithCompleteCard({ trialDays: 14 });
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));
    await waitFor(() => expect(screen.getByText('Your card was declined.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));
    await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalled());

    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(confirmCardSetup).toHaveBeenCalledTimes(2);
    expect(confirmCardSetup).toHaveBeenLastCalledWith('seti_1_secret_abc', expect.anything());
  });

  it('asks before charging when the server starts the plan without its trial', async () => {
    // The account already had its trial, so the server created a paid subscription instead.
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'in_2',
      clientSecret: 'pi_2_secret_abc',
      clientSecretType: 'payment_intent',
    });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { id: 'pi_2', status: 'succeeded' } });
    confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-3', paymentIntentId: 'pi_2' });

    const { onPaymentSuccess } = await renderWithCompleteCard({ trialDays: 14 });
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));

    await waitFor(() => expect(screen.getByText(/free trial isn't available on your account/)).toBeTruthy());
    expect(confirmCardPayment).not.toHaveBeenCalled();
    expect(onPaymentSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/won't be charged today/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));
    await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalled());
    expect(initiatePayment).toHaveBeenCalledTimes(1);
    expect(confirmCardPayment).toHaveBeenCalledWith('pi_2_secret_abc', expect.anything());
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });

  it('offers the trial again when the same form is reused for another plan', async () => {
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'in_2',
      clientSecret: 'pi_2_secret_abc',
      clientSecretType: 'payment_intent',
    });
    const view = render(
      <PaymentComponent
        appId="app-1"
        amount={99}
        pricingModelId="pm-monthly"
        isSubscription
        trialDays={14}
        preloadedProviders={[stripeProvider]}
      />,
    );
    await waitFor(() => expect(cardChange).toBeDefined());
    act(() => cardChange!({ complete: true, empty: false }));
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));
    await waitFor(() => expect(screen.getByText(/free trial isn't available on your account/)).toBeTruthy());

    view.rerender(
      <PaymentComponent
        appId="app-1"
        amount={149}
        pricingModelId="pm-business"
        isSubscription
        trialDays={14}
        preloadedProviders={[stripeProvider]}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Start 14-day free trial/ })).toBeTruthy());
    expect(screen.queryByText(/free trial isn't available on your account/)).toBeNull();
  });

  it('still confirms a payment when there is no trial', async () => {
    initiatePayment.mockResolvedValue({
      success: true,
      providerType: 1,
      paymentIntentId: 'in_1',
      clientSecret: 'pi_1_secret_abc',
      clientSecretType: 'payment_intent',
    });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-2', paymentIntentId: 'pi_1' });

    const { onPaymentSuccess } = await renderWithCompleteCard();
    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));

    await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalled());
    expect(confirmCardPayment).toHaveBeenCalledWith('pi_1_secret_abc', expect.anything());
    expect(confirmCardSetup).not.toHaveBeenCalled();
    // The server recorded the subscription's first invoice, so that is what it is asked to verify.
    expect(confirmPayment).toHaveBeenCalledWith('in_1', 1);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });
});
