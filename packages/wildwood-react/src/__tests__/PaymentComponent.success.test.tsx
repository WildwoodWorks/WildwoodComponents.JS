/**
 * A successful payment is reported once. The success panel's "Continue" used to call
 * `onPaymentSuccess` a second time, so every host that advances on it (the signup wizard runs the whole
 * registration) did its work twice; Continue now has its own callback and only appears with one.
 *
 * And an app that asks for a billing address has to send it: the fields were collected and dropped.
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

function paidOnce() {
  initiatePayment.mockResolvedValue({
    success: true,
    providerType: 1,
    paymentIntentId: 'in_1',
    clientSecret: 'pi_1_secret_abc',
    clientSecretType: 'payment_intent',
  });
  confirmCardPayment.mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
  confirmPayment.mockResolvedValue({ success: true, transactionId: 'txn-1', paymentIntentId: 'pi_1' });
}

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

function fillBillingAddress() {
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Lovelace' } });
  fireEvent.change(screen.getByLabelText('Street Address'), { target: { value: '12 Analytical Way' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Denver' } });
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'CO' } });
  fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '80202' } });
}

describe('PaymentComponent success panel', () => {
  it('reports a successful payment once and offers no Continue without a handler', async () => {
    paidOnce();
    const { onPaymentSuccess } = await renderWithCompleteCard();

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));

    await waitFor(() => expect(screen.getByText('Payment Successful!')).toBeTruthy());
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('offers Continue when given a handler, and Continue does not report the payment again', async () => {
    paidOnce();
    const onContinue = vi.fn();
    const { onPaymentSuccess } = await renderWithCompleteCard({ onContinue });

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));
    await waitFor(() => expect(screen.getByText('Payment Successful!')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'txn-1' }));
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
  });

  it('reports a started trial once and offers Continue only with a handler', async () => {
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

    const onContinue = vi.fn();
    const { onPaymentSuccess } = await renderWithCompleteCard({ trialDays: 14, onContinue });
    fireEvent.click(screen.getByRole('button', { name: /Start 14-day free trial/ }));

    await waitFor(() => expect(screen.getByText('Your free trial has started!')).toBeTruthy());
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('PaymentComponent billing address', () => {
  it('will not start a payment with an incomplete required address', async () => {
    paidOnce();
    await renderWithCompleteCard({ requireBillingAddress: true });

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));

    await waitFor(() => expect(screen.getByText('Please complete your billing address.')).toBeTruthy());
    expect(initiatePayment).not.toHaveBeenCalled();
  });

  it('sends the address it collected', async () => {
    paidOnce();
    await renderWithCompleteCard({ requireBillingAddress: true });
    fillBillingAddress();

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));

    await waitFor(() => expect(initiatePayment).toHaveBeenCalled());
    expect(initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        billingAddress: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          street: '12 Analytical Way',
          city: 'Denver',
          state: 'CO',
          zipCode: '80202',
          country: 'US',
        },
      }),
    );
  });

  it('leaves the address off entirely when the app does not ask for one', async () => {
    paidOnce();
    await renderWithCompleteCard();

    fireEvent.click(screen.getByRole('button', { name: /Pay \$99\.00/ }));

    await waitFor(() => expect(initiatePayment).toHaveBeenCalled());
    expect(initiatePayment.mock.calls[0][0]).not.toHaveProperty('billingAddress');
  });
});
