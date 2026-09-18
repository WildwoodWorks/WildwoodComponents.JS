/**
 * The add-on panel sells packs, so what it says about one has to be true: the trial the processor will
 * actually start, the pack's own currency, and an offer only for a pack the user does not already own.
 * A refused subscribe or cancel is reported rather than swallowed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { AddOnsPanel } from '../components/subscription/admin/AddOnsPanel.js';

const pack = (overrides: Partial<AppTierAddOnModel> = {}): AppTierAddOnModel =>
  ({
    id: 'addon-seats',
    appId: 'app-1',
    name: 'Extra Seats',
    description: 'More people on the account.',
    category: '',
    status: 'Active',
    displayOrder: 0,
    iconClass: '',
    badgeColor: '',
    features: [],
    bundledInTierIds: [],
    pricingOptions: [
      {
        id: 'aap-monthly',
        pricingModelId: 'pm-monthly',
        pricingModelName: 'Monthly',
        price: 19,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    ...overrides,
  }) as AppTierAddOnModel;

const subscription = (overrides: Partial<UserAddOnSubscriptionModel> = {}): UserAddOnSubscriptionModel =>
  ({
    id: 'sub-1',
    userId: 'user-1',
    appId: 'app-1',
    appTierAddOnId: 'addon-seats',
    status: 'Active',
    paymentTransactionId: 'txn-seats',
    addOnName: 'Extra Seats',
    addOnDescription: '',
    isBundled: false,
    startDate: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as UserAddOnSubscriptionModel;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AddOnsPanel', () => {
  it('takes the trial from the pricing option that is bought, not the pack', () => {
    const addOn = pack({
      trialDays: 7,
      pricingOptions: [
        {
          id: 'aap-monthly',
          pricingModelId: 'pm-monthly',
          pricingModelName: 'Monthly',
          price: 19,
          billingFrequency: 'Monthly',
          trialDays: 14,
          isDefault: true,
        },
      ],
    });

    render(<AddOnsPanel addOns={[addOn]} subscriptions={[]} />);

    expect(screen.getByText('14-day free trial')).toBeTruthy();
    expect(screen.queryByText('7-day free trial')).toBeNull();
  });

  it('falls back to the pack when the pricing option starts no trial', () => {
    render(<AddOnsPanel addOns={[pack({ trialDays: 7 })]} subscriptions={[]} />);

    expect(screen.getByText('7-day free trial')).toBeTruthy();
  });

  it('says nothing about a trial — and never renders a bare 0 — when there is none', () => {
    const { container } = render(<AddOnsPanel addOns={[pack({ trialDays: 0 })]} subscriptions={[]} />);

    expect(screen.queryByText(/free trial/)).toBeNull();
    expect(container.textContent).not.toMatch(/(^|[^0-9.])0([^0-9.]|$)/);
  });

  it('prices the pack in its own currency', () => {
    render(<AddOnsPanel addOns={[pack({ currency: 'EUR' })]} subscriptions={[]} currency="USD" />);

    expect(screen.getByText(/€19\.00\/monthly/)).toBeTruthy();
  });

  it('offers a pack again once its subscription is cancelled', () => {
    render(
      <AddOnsPanel
        addOns={[pack()]}
        subscriptions={[subscription({ status: 'Cancelled' })]}
        onSubscribe={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeTruthy();
    expect(screen.queryByText('Subscribed')).toBeNull();
    expect(screen.queryByText('Active Add-Ons')).toBeNull();
  });

  it('still counts a pack scheduled to cancel as owned, and says when it ends', () => {
    render(
      <AddOnsPanel
        addOns={[pack()]}
        subscriptions={[subscription({ status: 'PendingCancellation', endDate: '2026-03-01T00:00:00Z' })]}
        onSubscribe={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Active Add-Ons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
    expect(screen.getByText(/Cancels on/)).toBeTruthy();
    expect(screen.queryByText(/Renews/)).toBeNull();
  });

  it('still says a pack is scheduled to cancel when the server sent no end date', () => {
    render(<AddOnsPanel addOns={[pack()]} subscriptions={[subscription({ status: 'PendingCancellation' })]} />);

    expect(screen.getByText(/Cancels at the end of the billing period/)).toBeTruthy();
  });

  it('reports a subscribe the host refused', async () => {
    const onSubscribe = vi.fn().mockResolvedValue(false);
    render(<AddOnsPanel addOns={[pack()]} subscriptions={[]} onSubscribe={onSubscribe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not subscribe to Extra Seats');
    expect(alert.className).toContain('ww-alert-danger');
  });

  it('reports a subscribe that threw, and clears it on the next attempt', async () => {
    const onSubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('Card declined.'))
      .mockImplementationOnce(() => new Promise(() => {}));
    render(<AddOnsPanel addOns={[pack()]} subscriptions={[]} onSubscribe={onSubscribe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Card declined.');

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('reports a cancel the host refused', async () => {
    const onCancel = vi.fn().mockResolvedValue(false);
    render(<AddOnsPanel addOns={[pack()]} subscriptions={[subscription()]} onCancel={onCancel} />);

    // Nothing is cancelled on the first click: the row asks first.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText(/end of the current billing period/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel pack' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not cancel Extra Seats');
  });
});
