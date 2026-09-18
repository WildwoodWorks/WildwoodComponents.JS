// The public API of `RegistrationAndSubscriptionComponent`.
//
// All three views are declared here, in one file, on purpose: a host reading the component's API
// sees every surface it has, and the props of one view never have to be hunted for in another
// module. All three are implemented.
//
// Nothing in this file imports anything with a runtime cost — it is types only, so a landing page
// that pulls in the pricing view does not drag the admin surfaces along with it.

import type { ReactNode } from 'react';
import type {
  AppTierAddOnModel,
  AppTierLimitStatusModel,
  PublicCatalog,
  UserTierSubscriptionModel,
} from '@wildwood/core';
import type { EntitlementsChangedReason, SignupOutcome, SignupTokenMode } from '@wildwood/react-shared';
import type { PaymentRequiredArgs } from '../subscription/admin/SubscriptionAdminComponent.js';
import type { RegistrationSubscriptionLabels } from './labels.js';

/** Which surface the component renders. The prop is the discriminant of its props union. */
export type RegistrationSubscriptionView = 'pricing' | 'signup' | 'manage';

/** What a failure inside the component is reported as. `code` is stable; `message` is for people. */
export interface RegistrationSubscriptionError {
  /** A stable, machine-readable reason, e.g. `catalog_unavailable`. */
  code: string;
  /** What went wrong, in words a host can show. */
  message: string;
}

/** The billing cycle a pricing selection was made under. */
export type PricingBilling = 'monthly' | 'annual';

/** Props every view shares. */
export interface RegistrationSubscriptionCommonProps {
  /** The app to read the catalog and settings of. Defaults to the client's configured app. */
  appId?: string;
  /** Overrides the currency the server quotes the catalog in. Rarely needed. */
  currency?: string;
  /** Appended to the component's own root class. */
  className?: string;
  /** Overrides for any of the component's strings. Unset keys keep the shipped copy. */
  labels?: Partial<RegistrationSubscriptionLabels>;
  /** Where "contact us" and enterprise plans point. Passed to `TierCard` as its contact URL. */
  contactUrl?: string;
  /** Called whenever the component gives up on something. Never throws into the host's render. */
  onError?: (error: RegistrationSubscriptionError) => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Pricing view
// ───────────────────────────────────────────────────────────────────────────────

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
  /** Stable id, used as the React key and as the group's `data-ww-group` attribute. */
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
  /** Rendered before the pack's name. */
  icon?: ReactNode;
}

/** Whether, and how many, packs a visitor may pick on a pricing surface. */
export type PricingPackSelection = 'none' | 'multi';

export interface RegistrationSubscriptionPricingProps extends RegistrationSubscriptionCommonProps {
  /** Show the plan grid. Default true. */
  showPlans?: boolean;
  /** Show the pack grid. Default false — most pricing pages sell plans only. */
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
  /** Marks one plan as the visitor's current choice (a selection carried in from another page). */
  highlightTierId?: string;
  /** A catalog built during a server render: renders real prices on the first paint. */
  initialCatalog?: PublicCatalog;
  /** Replaces the built-in loading placeholder. */
  loadingFallback?: ReactNode;
  /** Replaces the built-in "pricing is unavailable" panel, Retry included. */
  errorFallback?: ReactNode;
  /** Emit schema.org offers for the live catalog. Pass an object to set the offers' canonical URL. */
  includeJsonLd?: boolean | { url?: string };
  /** Called when the visitor picks a plan, a pack, or a set of packs. */
  onSelect: (selection: PricingSelection) => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Signup view
// ───────────────────────────────────────────────────────────────────────────────

/** Whether the signup flow asks the visitor to choose a plan. */
export type SignupPlanSelection = 'choose' | 'skip';

/**
 * Whether the signup flow offers packs. `'multi'` is the pack grid, ticked and continued once —
 * the same wording the pricing view uses, because it is the same grid. Packs a signup link already
 * chose are bought either way; `'none'` only takes the step where they are picked out of the flow.
 */
export type SignupPackSelection = 'multi' | 'none';

/** What {@link RegistrationSubscriptionSignupProps.renderClosed} is told about a closed app. */
export interface RegistrationClosedInfo {
  /** The copy the component would have shown. */
  message: string;
  /** The component's `contactUrl`, if it was given one. */
  contactUrl?: string;
}

export interface RegistrationSubscriptionSignupProps extends RegistrationSubscriptionCommonProps {
  /** The plan a pricing page already chose. Ignored when the app does not sell it. */
  preSelectedTierId?: string;
  /** The pricing option within that plan (the annual one, typically). */
  preSelectedPricingId?: string;
  /** Packs a pricing page already chose. Checked against the catalog and capped at 25. */
  preSelectedAddOnIds?: string[];
  /** An invitation token from the signup link. */
  registrationToken?: string;
  /** Pre-fills the username and email fields, e.g. from an invitation. */
  prefillEmail?: string;
  /** `'skip'` leaves the plan to the host: a single-plan product, or one chosen elsewhere. */
  planSelection?: SignupPlanSelection;
  /** Whether the visitor may pick packs on the way in. Default `'none'`. */
  packSelection?: SignupPackSelection;
  /** `'required'` is invite redemption: a token is the only way in. Default `'auto'`. */
  tokenMode?: SignupTokenMode;
  /** Ask for a billing address on the payment step. */
  requireBillingAddress?: boolean;
  /** Where the host wants the visitor sent afterwards. Carried, never navigated to. */
  returnUrl?: string;
  /** Called instead of rendering the form when the visitor already has a session. */
  onAlreadySignedIn?: () => void;
  /** Called once the account exists and everything asked for has been granted or reported. */
  onSignupComplete?: (outcome: SignupOutcome) => void;
  /** Called when the visitor backs out. */
  onCancel?: () => void;
  /** Called after the new user's entitlements change, so the host can refresh its own gates. */
  onEntitlementsChanged?: (reason: EntitlementsChangedReason) => void;
  /** Replaces the built-in "registration is closed" notice. */
  renderClosed?: (info: RegistrationClosedInfo) => ReactNode;
  /** A catalog built during a server render, for a first paint with real prices. */
  initialCatalog?: PublicCatalog;
}

// ───────────────────────────────────────────────────────────────────────────────
// Manage view
// ───────────────────────────────────────────────────────────────────────────────

/** How the manage view arranges its sections. */
export type ManageLayout = 'tabs' | 'stacked';

/** The panels the manage view can show. */
export type ManageSection = 'subscription' | 'plans' | 'features' | 'addOns' | 'usage' | 'overrides';

export interface RegistrationSubscriptionManageProps extends RegistrationSubscriptionCommonProps {
  /** `'tabs'` is one panel at a time; `'stacked'` renders them all down the page. Default `'tabs'`. */
  layout?: ManageLayout;
  /**
   * Which panels to show, in order. Defaults to everything the viewer is allowed to see: `overrides`
   * needs `isAdmin` and `addOns` needs `showAddOns`, whether they are asked for or defaulted.
   */
  sections?: ManageSection[];
  /** Keep the subscription card above the tab bar instead of behind a tab. */
  showStatusAboveTabs?: boolean;
  /** Unlocks the admin-only panels (overrides, usage editing). */
  isAdmin?: boolean;
  /** Whose subscription to manage. Defaults to the signed-in user. */
  userId?: string;
  /** The company whose subscription to manage, for company-level plans. */
  companyId?: string;
  /** Let the user buy packs themselves, through the component's own card-once checkout. */
  allowPackSelfService?: boolean;
  /** Offer cancellation. Default true; false hides the subscription's cancel button. */
  allowCancel?: boolean;
  /** Show the packs panel. Default true. */
  showAddOns?: boolean;
  /** Overlay the host's own real-time usage on the server's limit statuses before they render. */
  onMergeUsage?: (
    statuses: AppTierLimitStatusModel[],
    subscription: UserTierSubscriptionModel | null,
  ) => AppTierLimitStatusModel[] | Promise<AppTierLimitStatusModel[]>;
  /**
   * Called when a change needs a card and none is on file. Return a payment transaction id to
   * complete the change, or null to abandon it.
   *
   * Optional, and rarely wanted: the view has its own card modal and uses it when this is left
   * out. A host that passes one keeps full control — its answer is taken instead, exactly as the
   * older `SubscriptionAdminComponent` behaved.
   */
  onPaymentRequired?: (args: PaymentRequiredArgs) => Promise<string | null | undefined>;
  /** Called after the subscription changes, so the host can refresh whatever else shows it. */
  onSubscriptionChanged?: () => void;
  /** Called after entitlements change, so the host can refresh its own gates. */
  onEntitlementsChanged?: (reason: EntitlementsChangedReason) => void;
  /** Where the host wants the user sent after a change. Carried, never navigated to. */
  returnUrl?: string;
}

// ───────────────────────────────────────────────────────────────────────────────
// The component's own props
// ───────────────────────────────────────────────────────────────────────────────

/** `view` picks the surface, and with it the rest of the props. */
export type RegistrationAndSubscriptionComponentProps =
  | ({ view: 'pricing' } & RegistrationSubscriptionPricingProps)
  | ({ view: 'signup' } & RegistrationSubscriptionSignupProps)
  | ({ view: 'manage' } & RegistrationSubscriptionManageProps);
