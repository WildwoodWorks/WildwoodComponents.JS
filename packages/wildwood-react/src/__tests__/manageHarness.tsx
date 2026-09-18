/**
 * The server the manage view is pretending to talk to.
 *
 * Shared by the manage and plan-change suites: one account with a plan, a pack and a feature, and
 * every client method those surfaces may call, stubbed. Prices live here as plain numbers and the
 * assertions format them through core, so no test ever agrees with a component about a price
 * string neither of them got from the server.
 */
import { vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  AppFeatureDefinitionModel,
  AppFeatureOverrideModel,
  AppTierAddOnModel,
  AppTierLimitStatusModel,
  AppTierModel,
  TierChangePreviewModel,
  UserAddOnSubscriptionModel,
  UserTierSubscriptionModel,
  WildwoodClient,
} from '@wildwood/core';
import { createTestClient } from './testUtils.js';
import { docsPack, freeTier, proTier, PRO_MONTHLY } from './signupHarness.js';

export const PRORATED_TODAY = 12.5;

export { PRO_MONTHLY, proTier, freeTier, docsPack };

/** The account's current plan: the free one, so every paid plan reads "Switch to ...". */
export function subscription(overrides: Partial<UserTierSubscriptionModel> = {}): UserTierSubscriptionModel {
  return {
    id: 'sub-1',
    userId: 'user-1',
    appId: 'test-app-id',
    appTierId: 'tier-free',
    appTierName: 'Starter',
    status: 'Active',
    startDate: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as UserTierSubscriptionModel;
}

/** One owned pack. Billed unless the test takes its payment away. */
export function packSubscription(overrides: Partial<UserAddOnSubscriptionModel> = {}): UserAddOnSubscriptionModel {
  return {
    id: 'aos-1',
    userId: 'user-1',
    appId: 'test-app-id',
    appTierAddOnId: 'pack-docs',
    status: 'Active',
    paymentTransactionId: 'txn-docs',
    addOnName: 'Docs Pack',
    addOnDescription: '',
    isBundled: false,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-04-01T00:00:00Z',
    ...overrides,
  } as unknown as UserAddOnSubscriptionModel;
}

export function featureDefinition(overrides: Partial<AppFeatureDefinitionModel> = {}): AppFeatureDefinitionModel {
  return {
    featureCode: 'REPORTS',
    displayName: 'Reports',
    description: '',
    category: '',
    iconClass: '',
    displayOrder: 1,
    isEnabled: false,
    ...overrides,
  } as unknown as AppFeatureDefinitionModel;
}

export function featureOverride(overrides: Partial<AppFeatureOverrideModel> = {}): AppFeatureOverrideModel {
  return {
    id: 'ovr-1',
    appId: 'test-app-id',
    featureCode: 'REPORTS',
    isEnabled: true,
    reason: 'Beta tester',
    ...overrides,
  } as unknown as AppFeatureOverrideModel;
}

export function limitStatus(overrides: Partial<AppTierLimitStatusModel> = {}): AppTierLimitStatusModel {
  return {
    limitCode: 'DOCUMENTS',
    displayName: 'Documents',
    currentUsage: 3,
    maxValue: 10,
    usagePercent: 30,
    unit: 'documents',
    statusMessage: '',
    isUnlimited: false,
    isExceeded: false,
    isAtWarningThreshold: false,
    isHardBlocked: false,
    ...overrides,
  } as unknown as AppTierLimitStatusModel;
}

/** A priced change the server is happy with. Payment-free unless a test asks for a card. */
export function preview(overrides: Partial<TierChangePreviewModel> = {}): TierChangePreviewModel {
  return {
    success: true,
    isUpgrade: true,
    isDowngrade: false,
    isBillingFrequencyChange: false,
    paymentRequired: false,
    paymentBypassAllowed: false,
    paymentProviderAvailable: true,
    featuresGained: [],
    featuresLost: [],
    currency: 'USD',
    currentTierName: 'Starter',
    newTierName: 'Pro',
    newPrice: PRO_MONTHLY,
    daysRemainingInPeriod: 12,
    allowImmediateChange: true,
    allowScheduledChange: true,
    ...overrides,
  } as TierChangePreviewModel;
}

export interface ManageClientOptions {
  tiers?: AppTierModel[];
  addOns?: AppTierAddOnModel[];
  subscription?: UserTierSubscriptionModel | null;
  packs?: UserAddOnSubscriptionModel[];
  limitStatuses?: AppTierLimitStatusModel[];
  featureDefinitions?: AppFeatureDefinitionModel[];
  featureStatus?: Record<string, boolean>;
  featureOverrides?: AppFeatureOverrideModel[];
}

/** Every client method the manage view may call, stubbed. */
export function manageClient(options: ManageClientOptions = {}) {
  const client = createTestClient();
  const {
    tiers = [freeTier, proTier],
    addOns = [docsPack],
    subscription: current = subscription(),
    packs = [],
    limitStatuses = [limitStatus()],
    featureDefinitions = [featureDefinition()],
    featureStatus = { REPORTS: true },
    featureOverrides = [],
  } = options;

  // A signed-in session, stubbed rather than really stored so no refresh timer outlives a test.
  Object.defineProperty(client.session, 'isAuthenticated', { get: () => true, configurable: true });
  Object.defineProperty(client.session, 'userId', { get: () => 'user-1', configurable: true });
  Object.defineProperty(client.session, 'userEmail', { get: () => 'ada@example.com', configurable: true });

  return {
    client: client as WildwoodClient,

    // Reads
    tiers: vi.spyOn(client.appTier, 'getTiers').mockResolvedValue(tiers),
    subscription: vi.spyOn(client.appTier, 'getUserSubscription').mockResolvedValue(current),
    userAddOns: vi.spyOn(client.appTier, 'getUserAddOns').mockResolvedValue(packs),
    limitStatuses: vi.spyOn(client.appTier, 'getAllLimitStatuses').mockResolvedValue(limitStatuses),
    featureDefinitions: vi.spyOn(client.appTier, 'getActiveFeatureDefinitions').mockResolvedValue(featureDefinitions),
    adminFeatureDefinitions: vi.spyOn(client.appTier, 'getFeatureDefinitions').mockResolvedValue(featureDefinitions),
    features: vi.spyOn(client.appTier, 'getUserFeatures').mockResolvedValue(featureStatus),
    availableAddOns: vi.spyOn(client.appTier, 'getAvailableAddOns').mockResolvedValue(addOns),
    allAddOns: vi.spyOn(client.appTier, 'getAllAddOns').mockResolvedValue(addOns),
    featureOverrides: vi.spyOn(client.appTier, 'getFeatureOverrides').mockResolvedValue(featureOverrides),

    // Reads, admin-scoped
    userSubscriptionAdmin: vi.spyOn(client.appTier, 'getUserSubscriptionAdmin').mockResolvedValue(current),
    userAddOnsAdmin: vi.spyOn(client.appTier, 'getUserAddOnsAdmin').mockResolvedValue(packs),
    userLimitStatuses: vi.spyOn(client.appTier, 'getUserLimitStatuses').mockResolvedValue(limitStatuses),
    userFeaturesAdmin: vi.spyOn(client.appTier, 'getUserFeaturesAdmin').mockResolvedValue(featureStatus),

    // The plan change
    preview: vi.spyOn(client.appTier, 'previewTierChange').mockResolvedValue(preview()),
    previewAdmin: vi.spyOn(client.appTier, 'previewTierChangeAdmin').mockResolvedValue(preview()),
    changeTier: vi.spyOn(client.appTier, 'changeTier').mockResolvedValue({ success: true } as never),
    changeUserTier: vi.spyOn(client.appTier, 'changeUserTier').mockResolvedValue({ success: true } as never),
    completeTierChange: vi.spyOn(client.appTier, 'completeTierChange').mockResolvedValue({ success: true } as never),
    selfSubscribe: vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue({ success: true } as never),
    cancelSubscription: vi.spyOn(client.appTier, 'cancelSubscription').mockResolvedValue({ success: true } as never),

    // Packs
    cancelPack: vi
      .spyOn(client.appTier, 'cancelAddOnDetailed')
      .mockResolvedValue({ success: true, isScheduled: true, status: 'PendingCancellation' }),
    reactivatePack: vi.spyOn(client.appTier, 'reactivateAddOn').mockResolvedValue({ success: true, status: 'Active' }),
    quote: vi.spyOn(client.appTier, 'quoteAddOnCheckout'),
    createCard: vi.spyOn(client.appTier, 'createCheckoutPaymentMethod'),
    checkout: vi.spyOn(client.appTier, 'checkoutAddOns'),
    completeCheckout: vi.spyOn(client.appTier, 'completeAddOnCheckout'),

    // Money
    paymentConfig: vi.spyOn(client.payment, 'getAppPaymentConfiguration').mockResolvedValue({
      appId: 'test-app-id',
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
    } as never),
    linkTransaction: vi.spyOn(client.payment, 'linkTransactionToUser').mockResolvedValue(true),
  };
}

export type ManageStubs = ReturnType<typeof manageClient>;

/** Open the plans section (a no-op when it is already the one on screen) and wait for the grid. */
export async function openPlans(): Promise<void> {
  const tab = screen.queryByRole('button', { name: 'Plans' });
  if (tab) fireEvent.click(tab);
  await screen.findByText('Pro');
}

/** Pick a plan from the grid, by the CTA its tier card shows. */
export function chooseTier(cta: string): void {
  fireEvent.click(screen.getByRole('button', { name: cta }));
}

/** Confirm the change the confirmation modal is showing. */
export async function confirmChange(): Promise<void> {
  const footer = await waitFor(() => {
    const element = document.querySelector('.ww-modal-footer');
    if (!element) throw new Error('the confirmation modal is not on screen');
    return element as HTMLElement;
  });
  fireEvent.click(within(footer).getByRole('button', { name: /Switch to|Upgrade for|Confirm Downgrade/ }));
}
