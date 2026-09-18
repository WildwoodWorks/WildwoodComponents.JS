// The public API of the native registration-and-subscription surfaces.
//
// The web package declares all three views' props in one file so a host reads the component's API
// from one place; this is the React Native half of that file, and it grows a view at a time.
//
// What is deliberately NOT here, because it has no native meaning:
//
//  · `className` — React Native has no class names. `style` and `testID` take its place.
//  · `initialCatalog` / SSR seeding — there is no server render to seed from.
//  · `includeJsonLd` — schema.org offers are a page's structured data, not an app screen's.
//
// Everything else mirrors the web props name-for-name, so one set of docs describes both stacks.

import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import type { AppTierAddOnModel } from '@wildwood/core';
import type {
  PricingBilling,
  RegistrationSubscriptionError,
  RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';

// Re-exported so a host reads the component's whole API from this module, exactly as the web's
// `types.ts` re-exports the shapes that moved to the shared package.
export type { PricingBilling, RegistrationSubscriptionError } from '@wildwood/react-shared';

/** Which surface is being rendered. Also the value its root's `testID` carries. */
export type RegistrationSubscriptionView = 'pricing' | 'signup' | 'manage';

/** Props every view shares. */
export interface RegistrationSubscriptionCommonProps {
  /** The app to read the catalog and settings of. Defaults to the client's configured app. */
  appId?: string;
  /** Overrides the currency the server quotes the catalog in. Rarely needed. */
  currency?: string;
  /** Overrides for any of the component's strings. Unset keys keep the shipped copy. */
  labels?: Partial<RegistrationSubscriptionLabels>;
  /** Where "contact us" and enterprise plans point. Opened with `Linking.openURL`. */
  contactUrl?: string;
  /** Called whenever the component gives up on something. Never throws into the host's render. */
  onError?: (error: RegistrationSubscriptionError) => void;
  /** Applied to the view's root, as on every component in this package. */
  style?: ViewStyle;
  /** Replaces the root's built-in test hook (the view's own name). */
  testID?: string;
}

/** What the visitor chose on a pricing surface. The host decides where that leads. */
export interface PricingSelection {
  /** The chosen plan, when a plan was chosen. Absent when only packs were picked. */
  tierId?: string;
  /** The plan's pricing option under the current billing cycle. */
  pricingId?: string;
  /** The billing cycle the toggle was on when the choice was made. */
  billing: PricingBilling;
  /** Every pack selected at that moment, in catalog order. Empty rather than absent. */
  addOnIds: string[];
}

/** A heading the host files packs under, matched on the add-on's catalog `category`. */
export interface AddOnGroup {
  /** Stable id, used as the React key and as the group's `testID`. */
  id: string;
  /** The heading itself. */
  title: string;
  /** Optional sentence under the heading. */
  blurb?: string;
  /** Catalog categories that belong under this heading. */
  categories: string[];
}

/** Host-supplied marketing copy for one pack, joined to the live catalog entry. */
export interface AddOnPresentation {
  /** Replaces the catalog's own description. */
  blurb?: string;
  /** The allowance the pack buys, e.g. "500 documents a month". Shown under the blurb. */
  meter?: string;
  /** Rendered before the pack's name. A string is wrapped for you; a node is rendered as given. */
  icon?: ReactNode;
}

/** Whether, and how many, packs a visitor may pick on a pricing surface. */
export type PricingPackSelection = 'none' | 'multi';

export interface RegistrationSubscriptionPricingProps extends RegistrationSubscriptionCommonProps {
  /** Show the plan grid. Default true. */
  showPlans?: boolean;
  /** Show the pack grid. Default false — most pricing screens sell plans only. */
  showAddOns?: boolean;
  /** Keep free plans in the grid. Default true; false hides every `isFreeTier` plan. */
  offerFreeTierChoice?: boolean;
  /**
   * `'none'` gives each pack its own call to action; `'multi'` lets the visitor tick several and
   * continue once. Default `'none'`.
   */
  packSelection?: PricingPackSelection;
  /** Headings to file packs under. Empty groups are dropped; unmatched packs get a trailing group. */
  addOnGroups?: AddOnGroup[];
  /** Host copy for a pack. Return undefined to keep the catalog's own words. */
  describeAddOn?: (addOn: AppTierAddOnModel) => AddOnPresentation | undefined;
  /** Show the monthly/annual toggle when any plan is priced annually. Default true. */
  showBillingToggle?: boolean;
  /** Which side the toggle starts on. Default `'monthly'`. */
  defaultBilling?: PricingBilling;
  /** Show each plan's feature list. Default true. */
  showFeatureComparison?: boolean;
  /** Show each plan's usage limits. Default true. */
  showLimits?: boolean;
  /** Marks one plan as the visitor's current choice (a selection carried in from another screen). */
  highlightTierId?: string;
  /** Replaces the built-in loading placeholder. */
  loadingFallback?: ReactNode;
  /** Replaces the built-in "pricing is unavailable" panel, Retry included. */
  errorFallback?: ReactNode;
  /** Called when the visitor picks a plan, a pack, or a set of packs. */
  onSelect: (selection: PricingSelection) => void;
}
