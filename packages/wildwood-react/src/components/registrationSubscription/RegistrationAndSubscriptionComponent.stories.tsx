import type { Meta, StoryObj } from '@storybook/react-vite';
import { buildPublicCatalog, type AppTierAddOnModel, type AppTierModel } from '@wildwood/core';
import { RegistrationAndSubscriptionComponent } from './RegistrationAndSubscriptionComponent.js';
import { ClosedNotice } from './parts/ClosedNotice.js';
import { DEFAULT_LABELS } from './labels.js';
import type { AddOnGroup } from './types.js';

// A catalog built here rather than fetched, so the pricing stories render with real prices and no
// server. It is the same `buildPublicCatalog` a host calls during a server render, which is what
// makes `initialCatalog` an honest demonstration of the SSR path rather than a story-only prop.

function demoTier(overrides: Partial<AppTierModel>): AppTierModel {
  return {
    id: 'tier',
    appId: 'storybook-demo',
    name: 'Tier',
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
    currency: 'USD',
    pricingOptions: [],
    features: [],
    limits: [],
    ...overrides,
  };
}

function demoPack(overrides: Partial<AppTierAddOnModel>): AppTierAddOnModel {
  return {
    id: 'pack',
    appId: 'storybook-demo',
    name: 'Pack',
    description: '',
    category: '',
    status: 'Active',
    displayOrder: 1,
    iconClass: '',
    badgeColor: '',
    currency: 'USD',
    features: [],
    pricingOptions: [],
    bundledInTierIds: [],
    ...overrides,
  };
}

const starter = demoTier({
  id: 'tier-starter',
  name: 'Starter',
  description: 'Everything you need to get going.',
  displayOrder: 1,
  isFreeTier: true,
  isDefault: true,
  pricingOptions: [
    {
      id: 'price-starter',
      appTierId: 'tier-starter',
      pricingModelId: 'pm-starter',
      pricingModelName: 'Starter',
      isDefault: true,
      displayOrder: 1,
      price: 0,
      billingFrequency: 'Monthly',
    },
  ],
  features: [
    {
      id: 'f-search',
      featureCode: 'SEARCH',
      displayName: 'Opportunity search',
      description: '',
      isEnabled: true,
      category: 'Core',
    },
  ],
});

const pro = demoTier({
  id: 'tier-pro',
  name: 'Pro',
  description: 'For a team that is winning work.',
  displayOrder: 2,
  customBadgeText: 'Most popular',
  pricingOptions: [
    {
      id: 'price-pro-monthly',
      appTierId: 'tier-pro',
      pricingModelId: 'pm-pro-monthly',
      pricingModelName: 'Pro monthly',
      isDefault: true,
      displayOrder: 1,
      price: 79,
      billingFrequency: 'Monthly',
      trialDays: 14,
    },
    {
      id: 'price-pro-annual',
      appTierId: 'tier-pro',
      pricingModelId: 'pm-pro-annual',
      pricingModelName: 'Pro annual',
      isDefault: false,
      displayOrder: 2,
      price: 790,
      billingFrequency: 'Yearly',
      trialDays: 14,
    },
  ],
  features: [
    {
      id: 'f-pipeline',
      featureCode: 'PIPELINE',
      displayName: 'Pipeline and proposals',
      description: '',
      isEnabled: true,
      category: 'Core',
    },
  ],
  limits: [
    {
      id: 'l-pursuits',
      limitCode: 'ACTIVE_PURSUITS',
      displayName: 'Active pursuits',
      maxValue: 25,
      limitType: 'Count',
      unit: 'pursuits',
      isUnlimited: false,
    },
  ],
});

// No pricing options at all: the platform's own definition of a "contact us" plan. The grid renders
// a contact call to action for it instead of inventing a price.
const enterprise = demoTier({
  id: 'tier-enterprise',
  name: 'Enterprise',
  description: 'Talk to us about volume and security review.',
  displayOrder: 3,
  showContactButton: true,
});

const docsPack = demoPack({
  id: 'pack-docs',
  name: 'Documents Pack',
  description: 'Upload, parse and search your own documents.',
  category: 'Content',
  displayOrder: 1,
  pricingOptions: [
    {
      id: 'price-docs',
      pricingModelId: 'pm-docs',
      pricingModelName: 'Documents',
      price: 9,
      billingFrequency: 'Monthly',
      isDefault: true,
    },
  ],
});

const aiPack = demoPack({
  id: 'pack-ai',
  name: 'AI Pack',
  description: 'Drafting and enrichment with the AI flows.',
  category: 'Content',
  displayOrder: 2,
  pricingOptions: [
    {
      id: 'price-ai',
      pricingModelId: 'pm-ai',
      pricingModelName: 'AI',
      price: 19,
      billingFrequency: 'Monthly',
      isDefault: true,
      trialDays: 7,
    },
  ],
});

const insightsPack = demoPack({
  id: 'pack-insights',
  name: 'Insights Pack',
  description: 'Award history and competitor analysis.',
  category: 'Analytics',
  displayOrder: 3,
  pricingOptions: [
    {
      id: 'price-insights',
      pricingModelId: 'pm-insights',
      pricingModelName: 'Insights',
      price: 29,
      billingFrequency: 'Monthly',
      isDefault: true,
    },
  ],
});

const demoCatalog = buildPublicCatalog({
  appId: 'storybook-demo',
  tiers: [starter, pro, enterprise],
  addOns: [docsPack, aiPack, insightsPack],
});

const demoGroups: AddOnGroup[] = [
  { id: 'content', title: 'Content and drafting', blurb: 'Bring your own material.', categories: ['Content'] },
  { id: 'analytics', title: 'Analytics', blurb: 'Know the field before you bid.', categories: ['Analytics'] },
];

const meta: Meta<typeof RegistrationAndSubscriptionComponent> = {
  title: 'Billing/RegistrationAndSubscriptionComponent',
  component: RegistrationAndSubscriptionComponent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'One component for everything a customer does with money: `view="pricing" | "signup" | "manage"`.',
          '',
          'The pricing stories pass an `initialCatalog` built with `buildPublicCatalog`, so they render',
          'real prices with no server — the same path a prerendered pricing page uses. The signup and',
          'manage stories talk to the app the Storybook provider is configured for, so they need a',
          'reachable API (and, for manage, a signed-in user); run them against the test harness rather',
          'than expecting them to paint here.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof RegistrationAndSubscriptionComponent>;

/** Plans and packs, grouped under the host's own headings, priced from the snapshot. */
export const Pricing: Story = {
  args: {
    view: 'pricing',
    initialCatalog: demoCatalog,
    showAddOns: true,
    packSelection: 'multi',
    addOnGroups: demoGroups,
    contactUrl: '/contact?plan=enterprise',
    onSelect: (selection) => console.log('selection', selection),
  },
};

/** A packs-only pricing section: no plan grid, one call to action for the whole basket. */
export const PricingPacksOnly: Story = {
  args: {
    view: 'pricing',
    initialCatalog: demoCatalog,
    showPlans: false,
    showAddOns: true,
    packSelection: 'multi',
    addOnGroups: demoGroups,
    describeAddOn: (addOn) => (addOn.id === 'pack-docs' ? { meter: '500 documents a month' } : undefined),
    onSelect: (selection) => console.log('packs', selection.addOnIds),
  },
};

/**
 * The whole way in. Needs the harness API: the form's options come from the app's live
 * authentication configuration, and the plan and packs from its public catalog.
 */
export const Signup: Story = {
  args: {
    view: 'signup',
    initialCatalog: demoCatalog,
    preSelectedTierId: 'tier-pro',
    preSelectedPricingId: 'price-pro-monthly',
    packSelection: 'multi',
    contactUrl: '/contact',
    onSignupComplete: (outcome) => console.log('signed up', outcome),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Registration itself is a server call, so this story needs the harness API. ' +
          'The plan summary and the pack grid render from the snapshot regardless.',
      },
    },
  },
};

/** Invite redemption: the token is the only way in, with no plan and no pack step. */
export const SignupInvite: Story = {
  args: {
    view: 'signup',
    initialCatalog: demoCatalog,
    tokenMode: 'required',
    registrationToken: 'demo-invitation-token',
    prefillEmail: 'invitee@example.com',
    planSelection: 'skip',
    packSelection: 'none',
    onSignupComplete: (outcome) => console.log('invite redeemed', outcome),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Overrides the app configuration, a closed one included, because the server validates the ' +
          'invite token itself. Needs the harness API to check the token.',
      },
    },
  },
};

/** What a customer already pays for, and every way of changing it. Needs a signed-in user. */
export const Manage: Story = {
  args: {
    view: 'manage',
    layout: 'stacked',
    sections: ['subscription', 'plans', 'addOns', 'usage'],
    allowPackSelfService: true,
    onEntitlementsChanged: (reason) => console.log('entitlements changed', reason),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Reads the signed-in account's own subscription, so it needs the harness API and a session. " +
          'The plan change, its card modal and 3-D Secure all live in this view.',
      },
    },
  },
};

/**
 * The closed-registration panel on its own, for a host that wants to say so without mounting the
 * signup flow. Rendered directly, so it needs nothing at all.
 */
export const Closed: Story = {
  args: { view: 'signup' },
  render: () => (
    <ClosedNotice
      message={DEFAULT_LABELS.registrationClosed}
      contactUrl="/contact"
      contactLabel={DEFAULT_LABELS.contactUs}
    />
  ),
};
