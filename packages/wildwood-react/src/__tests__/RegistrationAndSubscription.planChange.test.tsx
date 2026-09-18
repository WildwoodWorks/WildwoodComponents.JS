/**
 * Changing the plan: preview, confirm, card, 3-D Secure, completion.
 *
 * The expensive rules are the ones being defended. A change is never posted twice, whatever
 * StrictMode, a double-click or a payment callback does. A charge the bank wants to see is a "not
 * yet", not a refusal: the parked change is completed after the customer confirms it, and a server
 * still applying it is asked again rather than reported as a failure. A card the customer never
 * gave changes nothing at all. And the component collects that card itself - the host's own
 * `onPaymentRequired` still wins when it has one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { formatMoney } from '@wildwood/core';
import { createWrapper } from './testUtils.js';
import { PRO_MONTHLY } from './signupHarness.js';
import { chooseTier, confirmChange, manageClient, openPlans, preview, type ManageStubs } from './manageHarness.js';

// Stripe.js is never fetched in a test: the instance the flow confirms with is the stub below.
const stripeCore = vi.hoisted(() => ({
  getStripeInstance: vi.fn(),
  loadStripe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@wildwood/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wildwood/core')>()),
  loadStripe: stripeCore.loadStripe,
  getStripeInstance: stripeCore.getStripeInstance,
}));

// The card form is PaymentComponent's business and has its own suites; here it only has to say
// what it was asked to collect, and answer.
const payment = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock('../components/payment/PaymentComponent.js', async () => {
  const { createElement } = await import('react');
  return {
    PaymentComponent: (props: Record<string, unknown>) => {
      payment.props.push(props);
      return createElement('div', null, [
        createElement(
          'button',
          {
            type: 'button',
            key: 'pay',
            onClick: () =>
              (props.onPaymentSuccess as (result: { transactionId: string; paymentIntentId: string }) => void)({
                transactionId: 'txn-card',
                paymentIntentId: 'pi_card',
              }),
          },
          'Pay now',
        ),
        createElement('button', { type: 'button', key: 'cancel', onClick: props.onCancel as () => void }, 'Go back'),
      ]);
    },
  };
});

const { RegistrationAndSubscriptionComponent } = await import('../index.js');
type ManageProps = Parameters<typeof RegistrationAndSubscriptionComponent>[0];

const confirmCardPayment = vi.fn();
let stubs: ManageStubs;

function renderManage(props: Partial<ManageProps> = {}, strict = false) {
  const element = (
    <RegistrationAndSubscriptionComponent
      view="manage"
      appId="test-app-id"
      showStatusAboveTabs
      {...(props as object)}
    />
  );
  return render(strict ? <StrictMode>{element}</StrictMode> : element, { wrapper: createWrapper(stubs.client) });
}

/** The plan grid, a click on Pro, and the confirmation it opens. */
async function upgradeToPro(): Promise<void> {
  await openPlans();
  chooseTier('Switch to Pro');
  await confirmChange();
}

beforeEach(() => {
  stubs = manageClient();
  payment.props.length = 0;
  confirmCardPayment.mockReset().mockResolvedValue({ paymentIntent: { id: 'pi_card', status: 'succeeded' } });
  stripeCore.getStripeInstance.mockReset().mockResolvedValue({ confirmCardPayment });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('plan change: the card', () => {
  beforeEach(() => {
    // The trial the card modal offers comes from the tier's own pricing option, not the preview.
    stubs.preview.mockResolvedValue(preview({ paymentRequired: true }));
  });

  it('collects the card itself, with what the plan will be billed as', async () => {
    renderManage();
    await upgradeToPro();

    expect(await screen.findByText('Upgrade to Pro')).toBeTruthy();
    const props = payment.props[payment.props.length - 1];
    expect(props.pricingModelId).toBe('pm-monthly');
    expect(props.amount).toBe(PRO_MONTHLY);
    expect(props.trialDays).toBe(14);
    expect(props.isSubscription).toBe(true);
    expect(props.customerEmail).toBe('ada@example.com');
    expect(props.currency).toBe('USD');
    // The price on screen is the server's, formatted by core - never a string this test invented.
    expect(props.description).toBe('Upgrade to Pro');
    expect(formatMoney(props.amount as number, 'USD')).toBe(formatMoney(PRO_MONTHLY, 'USD'));
  });

  it('changes the plan once the card is taken, then refreshes and says so', async () => {
    const onSubscriptionChanged = vi.fn();
    const onEntitlementsChanged = vi.fn();
    renderManage({ onSubscriptionChanged, onEntitlementsChanged });
    await upgradeToPro();

    fireEvent.click(await screen.findByRole('button', { name: 'Pay now' }));

    await waitFor(() => expect(stubs.changeTier).toHaveBeenCalled());
    expect(stubs.changeTier).toHaveBeenCalledTimes(1);
    expect(stubs.changeTier).toHaveBeenCalledWith('test-app-id', {
      newTierId: 'tier-pro',
      newPricingId: 'price-pro-monthly',
      immediate: true,
      paymentTransactionId: 'txn-card',
      supportsPaymentAction: true,
    });
    await waitFor(() => expect(onSubscriptionChanged).toHaveBeenCalled());
    expect(onEntitlementsChanged).toHaveBeenCalledWith('tierChange');
    // The payment is attributed to the user afterwards, by the provider's own id.
    expect(stubs.linkTransaction).toHaveBeenCalledWith('pi_card', 'user-1');
  });

  it('changes nothing when the customer closes the card modal', async () => {
    renderManage();
    await upgradeToPro();

    fireEvent.click(await screen.findByRole('button', { name: 'Go back' }));

    // Back to the confirmation the customer came from, with nothing charged or changed.
    await screen.findByText('Keep Current Plan');
    expect(stubs.changeTier).not.toHaveBeenCalled();
  });

  it('leaves the card to the host when it brought its own modal', async () => {
    const onPaymentRequired = vi.fn().mockResolvedValue('txn-host');
    renderManage({ onPaymentRequired });
    await upgradeToPro();

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalled());
    expect(onPaymentRequired).toHaveBeenCalledWith(
      expect.objectContaining({ tierId: 'tier-pro', tierName: 'Pro', pricingModelId: 'pm-monthly', trialDays: 14 }),
    );
    expect(screen.queryByText('Upgrade to Pro')).toBeNull();
    await waitFor(() =>
      expect(stubs.changeTier).toHaveBeenCalledWith(
        'test-app-id',
        expect.objectContaining({ paymentTransactionId: 'txn-host' }),
      ),
    );
  });
});

describe('plan change: 3-D Secure', () => {
  const parked = {
    success: false,
    requiresAction: true,
    clientSecret: 'pi_secret',
    pendingChangeId: 'pending-1',
    amountDue: 12.5,
    currency: 'USD',
  };

  it('confirms the charge and completes the parked change', async () => {
    stubs.changeTier.mockResolvedValue(parked as never);
    const onEntitlementsChanged = vi.fn();
    renderManage({ onEntitlementsChanged });
    await upgradeToPro();

    await waitFor(() => expect(confirmCardPayment).toHaveBeenCalledWith('pi_secret'));
    expect(stripeCore.getStripeInstance).toHaveBeenCalledWith('pk_test_123');
    await waitFor(() => expect(stubs.completeTierChange).toHaveBeenCalledWith('test-app-id', 'pending-1'));
    await waitFor(() => expect(onEntitlementsChanged).toHaveBeenCalledWith('tierChange'));
  });

  it('asks again while the server is still applying the change', async () => {
    stubs.changeTier.mockResolvedValue(parked as never);
    stubs.completeTierChange
      .mockResolvedValueOnce({ success: false, processing: true, pendingChangeId: 'pending-1' } as never)
      .mockResolvedValueOnce({ success: true } as never);
    const onSubscriptionChanged = vi.fn();
    renderManage({ onSubscriptionChanged });
    await upgradeToPro();

    await waitFor(() => expect(stubs.completeTierChange).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(onSubscriptionChanged).toHaveBeenCalled());
  });

  it('says why a declined card stopped the change, and picks it back up', async () => {
    stubs.changeTier.mockResolvedValue(parked as never);
    confirmCardPayment.mockResolvedValueOnce({ error: { message: 'Your card was declined.' } });
    renderManage();
    await upgradeToPro();

    expect(await screen.findByText('Your card was declined.')).toBeTruthy();
    expect(stubs.completeTierChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    await waitFor(() => expect(confirmCardPayment).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stubs.completeTierChange).toHaveBeenCalledWith('test-app-id', 'pending-1'));
  });

  it('says so in words when the payment window closed, and reports the code', async () => {
    stubs.changeTier.mockResolvedValue(parked as never);
    stubs.completeTierChange.mockResolvedValue({
      success: false,
      errorCode: 'pending_change_expired',
      errorMessage: 'Pending change expired',
    } as never);
    const onError = vi.fn();
    renderManage({ onError });

    await upgradeToPro();

    expect(await screen.findByText('The payment window closed - please start the change again')).toBeTruthy();
    // The report comes out of an effect, which runs AFTER the commit that painted the notice above.
    // Asserting it the moment the text appears races that effect on a loaded machine; the payload is
    // still asserted in full.
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith({
        code: 'pending_change_expired',
        message: 'The payment window closed - please start the change again',
      }),
    );
  });

  it('previews, changes and completes exactly once under StrictMode', async () => {
    stubs.changeTier.mockResolvedValue(parked as never);
    renderManage({}, true);

    await upgradeToPro();

    await waitFor(() => expect(stubs.completeTierChange).toHaveBeenCalledTimes(1));
    expect(stubs.preview).toHaveBeenCalledTimes(1);
    expect(stubs.changeTier).toHaveBeenCalledTimes(1);
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
  });
});

describe('plan change: refusals', () => {
  it('reports a change the server simply refused', async () => {
    stubs.changeTier.mockResolvedValue({ success: false, errorMessage: 'That plan is not available.' } as never);
    const onError = vi.fn();
    renderManage({ onError });

    await upgradeToPro();

    expect(await screen.findByText('That plan is not available.')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith({ code: 'tier_change_failed', message: 'That plan is not available.' });
  });

  it('reports a preview the server could not price, and changes nothing', async () => {
    stubs.preview.mockResolvedValue({ success: false, errorMessage: 'No such plan.' } as never);
    const onError = vi.fn();
    renderManage({ onError });

    await openPlans();
    chooseTier('Switch to Pro');

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith({ code: 'tier_preview_failed', message: 'No such plan.' }),
    );
    expect(stubs.changeTier).not.toHaveBeenCalled();
    expect(document.querySelector('.ww-modal-footer')).toBeNull();
  });
});
