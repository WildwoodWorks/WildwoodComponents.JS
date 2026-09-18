/**
 * The manage view: what a customer already pays for, and every way of changing it.
 *
 * The rules being defended here are the ones a customer feels. A section the host switched off is
 * gone, not merely hidden behind a tab. A plan picked in a stacked layout still asks for
 * confirmation. A pack cancelled keeps its access to the end of the period it is paid up to - and
 * a pack nobody paid for says so, has no renewal date, and is simply removed. A feature an
 * override grants reads as included rather than as part of a plan that does not carry it.
 *
 * The plan-change path (cards, 3-D Secure, completion) has its own file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import type { AddOnCheckoutQuoteModel } from '@wildwood/core';
import { createWrapper } from './testUtils.js';
import { DOCS_PACK_PRICE } from './signupHarness.js';
import {
  chooseTier,
  confirmChange,
  featureDefinition,
  featureOverride,
  manageClient,
  openPlans,
  packSubscription,
  preview,
  subscription,
  type ManageStubs,
} from './manageHarness.js';

const { RegistrationAndSubscriptionComponent } = await import('../index.js');
type ManageProps = Parameters<typeof RegistrationAndSubscriptionComponent>[0];

let stubs: ManageStubs;

function renderManage(props: Partial<ManageProps> = {}) {
  return render(<RegistrationAndSubscriptionComponent view="manage" appId="test-app-id" {...(props as object)} />, {
    wrapper: createWrapper(stubs.client),
  });
}

beforeEach(() => {
  stubs = manageClient();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('manage view: layout and sections', () => {
  it('names itself and the step the plan change is on', async () => {
    const { container } = renderManage();

    const root = container.querySelector('[data-ww-view="manage"]');
    await waitFor(() => expect(stubs.tiers).toHaveBeenCalled());
    expect(root?.getAttribute('data-ww-step')).toBe('idle');
  });

  it('offers every section the viewer is allowed to see, as tabs', async () => {
    renderManage();
    await waitFor(() => expect(stubs.tiers).toHaveBeenCalled());

    for (const tab of ['Subscription', 'Plans', 'Features', 'Packs', 'Usage']) {
      expect(screen.getByRole('button', { name: tab })).toBeTruthy();
    }
    // Overrides is an admin panel and this viewer is not one.
    expect(screen.queryByRole('button', { name: 'Overrides' })).toBeNull();
  });

  it('shows the overrides section to an admin', async () => {
    renderManage({ isAdmin: true, userId: 'user-1' });

    expect(await screen.findByRole('button', { name: 'Overrides' })).toBeTruthy();
  });

  it('renders only the sections the host asked for', async () => {
    renderManage({ sections: ['plans', 'usage'] });
    await waitFor(() => expect(stubs.tiers).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Usage' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subscription' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Packs' })).toBeNull();
  });

  it('drops the packs section when the host turns packs off', async () => {
    renderManage({ showAddOns: false });
    await waitFor(() => expect(stubs.tiers).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: 'Packs' })).toBeNull();
  });

  it('lifts the subscription card above the tabs instead of behind one', async () => {
    const { container } = renderManage({ showStatusAboveTabs: true });
    await waitFor(() => expect(stubs.subscription).toHaveBeenCalled());

    expect(container.querySelector('.ww-sub-status-card')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Subscription' })).toBeNull();
    // The first tab is then the plan grid.
    expect(await screen.findByText('Pro')).toBeTruthy();
  });

  it('renders every section down the page in a stacked layout', async () => {
    const { container } = renderManage({ layout: 'stacked' });
    await waitFor(() => expect(stubs.tiers).toHaveBeenCalled());

    expect(container.querySelectorAll('.ww-regsub-manage-section').length).toBe(5);
    expect(container.querySelector('.ww-sub-admin-tabs')).toBeNull();
    expect(await screen.findByText('Pro')).toBeTruthy();
  });

  it('confirms a plan change in the stacked layout too', async () => {
    renderManage({ layout: 'stacked' });
    await screen.findByText('Pro');

    chooseTier('Switch to Pro');

    expect(await screen.findByText('Upgrade to Pro')).toBeTruthy();
    expect(document.querySelector('.ww-modal-footer')).not.toBeNull();
  });

  it('hides the cancel button when the host does not offer cancellation', async () => {
    stubs = manageClient({ subscription: subscription({ status: 'Active' }) });
    renderManage({ allowCancel: false, sections: ['subscription'] });
    await waitFor(() => expect(stubs.subscription).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  it('cancels the subscription when it does', async () => {
    renderManage({ sections: ['subscription'] });
    await waitFor(() => expect(stubs.subscription).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Subscription' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Cancellation' }));

    await waitFor(() => expect(stubs.cancelSubscription).toHaveBeenCalledWith('test-app-id'));
  });
});

describe('manage view: features', () => {
  // The overrides themselves are an admin read, so a scope that HAS them is the one that can tell
  // a granted feature from a feature the plan carries.
  const scope = { isAdmin: true, userId: 'user-1', sections: ['features'] as const };

  it('reads a feature an override grants as included', async () => {
    stubs = manageClient({
      featureDefinitions: [featureDefinition({ displayName: 'Reports' })],
      featureStatus: { REPORTS: true },
      featureOverrides: [featureOverride()],
    });
    renderManage({ ...scope, sections: ['features'] });

    expect(await screen.findByText('Reports')).toBeTruthy();
    expect(screen.getByText('Included')).toBeTruthy();
  });

  it('says nothing about inclusion for a feature the plan itself carries', async () => {
    stubs = manageClient({ featureOverrides: [] });
    renderManage({ ...scope, sections: ['features'] });

    expect(await screen.findByText('Reports')).toBeTruthy();
    expect(screen.queryByText('Included')).toBeNull();
  });
});

describe('manage view: packs', () => {
  it('cancels a billed pack at the end of the period, and offers it back', async () => {
    stubs = manageClient({ packs: [packSubscription()] });
    const { rerender } = renderManage({ sections: ['addOns'] });

    expect(await screen.findByText('Docs Pack')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // The customer is told what cancelling does before it happens.
    expect(screen.getByText(/end of the current billing period/)).toBeTruthy();

    // The server answers with the scheduled row, and the refresh brings it back.
    stubs.userAddOns.mockResolvedValue([packSubscription({ status: 'PendingCancellation' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pack' }));

    await waitFor(() => expect(stubs.cancelPack).toHaveBeenCalledWith('aos-1', false));
    rerender(<RegistrationAndSubscriptionComponent view="manage" appId="test-app-id" sections={['addOns']} />);
    expect(await screen.findByText(/Cancels on/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(stubs.reactivatePack).toHaveBeenCalledWith('aos-1'));
  });

  it('shows a pack nobody paid for as included, with no renewal and nothing to reactivate', async () => {
    stubs = manageClient({
      packs: [packSubscription({ paymentTransactionId: undefined, status: 'PendingCancellation' })],
    });
    renderManage({ sections: ['addOns'] });

    expect(await screen.findByText('Included with your registration')).toBeTruthy();
    expect(screen.queryByText(/Renews/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
  });

  it('cancels a pack nobody paid for with its own words, and locally', async () => {
    stubs = manageClient({ packs: [packSubscription({ paymentTransactionId: undefined })] });
    renderManage({ sections: ['addOns'] });

    expect(await screen.findByText('Included with your registration')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText(/included with your registration\. Cancelling removes it/)).toBeTruthy();
    expect(screen.queryByText(/end of the current billing period/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel pack' }));
    await waitFor(() => expect(stubs.cancelPack).toHaveBeenCalledWith('aos-1', false));
  });

  it('offers no pack self-service unless the host allows it', async () => {
    renderManage({ sections: ['addOns'] });

    expect(await screen.findByText('Docs Pack')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add packs' })).toBeNull();
    // Nor a one-click subscribe: a pack is bought through the checkout, with a card.
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
  });

  it('buys packs through the checkout, then refreshes and says so', async () => {
    const quote: AddOnCheckoutQuoteModel = {
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
          trialDays: 0,
          trialEligible: false,
          dueToday: DOCS_PACK_PRICE,
        },
      ],
      totalDueToday: DOCS_PACK_PRICE,
      requiresPaymentMethod: false,
    };
    stubs.quote.mockResolvedValue(quote);
    stubs.checkout.mockResolvedValue({
      success: true,
      checkoutId: 'chk-1',
      results: [{ addOnId: 'pack-docs', pricingId: 'ao-docs', status: 'active' }],
    });
    const onSubscriptionChanged = vi.fn();
    const onEntitlementsChanged = vi.fn();
    renderManage({ sections: ['addOns'], allowPackSelfService: true, onSubscriptionChanged, onEntitlementsChanged });

    fireEvent.click(await screen.findByRole('button', { name: 'Add packs' }));

    const picker = await screen.findByText('Add packs to your plan');
    const modal = picker.closest('.ww-modal') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /Docs Pack/ }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Continue with 1 pack' }));

    await waitFor(() => expect(stubs.checkout).toHaveBeenCalled());
    expect(stubs.checkout.mock.calls[0][1].items).toEqual([{ addOnId: 'pack-docs' }]);
    await waitFor(() => expect(onSubscriptionChanged).toHaveBeenCalled());
    expect(onEntitlementsChanged).toHaveBeenCalledWith('addOn');
    // The refresh ran a second time over the same reads.
    expect(stubs.userAddOns.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('manage view: scope', () => {
  it('previews and applies an admin-scoped change without asking for a card', async () => {
    stubs.previewAdmin.mockResolvedValue(preview({ paymentRequired: true }));
    renderManage({ isAdmin: true, userId: 'user-9', showStatusAboveTabs: true });
    await openPlans();

    chooseTier('Switch to Pro');
    await waitFor(() =>
      expect(stubs.previewAdmin).toHaveBeenCalledWith('test-app-id', 'user-9', 'tier-pro', 'price-pro-monthly'),
    );

    await confirmChange();

    await waitFor(() => expect(stubs.changeUserTier).toHaveBeenCalled());
    expect(stubs.changeUserTier).toHaveBeenCalledWith('test-app-id', 'user-9', 'tier-pro', 'price-pro-monthly', true);
    expect(stubs.changeTier).not.toHaveBeenCalled();
    expect(screen.queryByText('Upgrade to Pro')).toBeNull();
  });
});
