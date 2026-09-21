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
//  · `returnUrl` — the web carries it without ever navigating to it, for a host that reads it back
//    off the props. A native screen has no URL to come back to: where a finished signup goes is the
//    navigator's business, and `onSignupComplete` is where a host hangs that. Carrying a dead URL
//    prop here would only imply the component might open it.
//
// Everything else mirrors the web props name-for-name, so one set of docs describes both stacks.

import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import type {
  AppTierAddOnModel,
  AppTierLimitStatusModel,
  IapProductMapping,
  UserTierSubscriptionModel,
} from '@wildwood/core';
import type {
  PaymentActionAdapter,
  PaymentRequiredArgs,
  PricingBilling,
  RegistrationSubscriptionError,
  RegistrationSubscriptionLabels,
  EntitlementsChangedReason,
  SignupOutcome,
  SignupPackSelection,
  SignupPaymentOrder,
  SignupPlanDefault,
  SignupPlanSelection,
  SignupTokenMode,
} from '@wildwood/react-shared';

// Re-exported so a host reads the component's whole API from this module, exactly as the web's
// `types.ts` re-exports the shapes that moved to the shared package.
export type {
  PricingBilling,
  RegistrationSubscriptionError,
  SignupPlanSelection,
  SignupPlanDefault,
  SignupPackSelection,
} from '@wildwood/react-shared';

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

// ───────────────────────────────────────────────────────────────────────────────
// Signup view
// ───────────────────────────────────────────────────────────────────────────────

/** What {@link RegistrationSubscriptionSignupProps.renderClosed} is told about a closed app. */
export interface RegistrationClosedInfo {
  /** The copy the component would have shown. */
  message: string;
  /** The component's `contactUrl`, if it was given one. */
  contactUrl?: string;
}

export interface RegistrationSubscriptionSignupProps extends RegistrationSubscriptionCommonProps {
  /** The plan a pricing screen already chose. Ignored when the app does not sell it. */
  preSelectedTierId?: string;
  /** The pricing option within that plan (the annual one, typically). */
  preSelectedPricingId?: string;
  /** Packs a pricing screen already chose. Deduped and capped at 25, then vetted against the catalog. */
  preSelectedAddOnIds?: string[];
  /** An invitation token from the signup link. */
  registrationToken?: string;
  /** Pre-fills the username and email fields, e.g. from an invitation. */
  prefillEmail?: string;
  /** `'skip'` leaves the plan to the host: a single-plan product, or one chosen elsewhere. */
  planSelection?: SignupPlanSelection;
  /** `'free'` opens the plan step on the app's free plan — a suggestion the visitor still
   *  confirms, not a choice already made. Ignored once a link or a grant has chosen. */
  planDefault?: SignupPlanDefault;
  /** Whether the visitor may pick packs on the way in. Default `'none'`. */
  packSelection?: SignupPackSelection;
  /** `'required'` is invite redemption: a token is the only way in. Default `'auto'`. */
  tokenMode?: SignupTokenMode;
  /**
   * When the plan's card is taken. Default `'afterAccount'` on React Native, where the web defaults
   * to `'beforeAccount'`: a store purchase that succeeds before a registration that then fails
   * strands a paid subscription with nobody to attach it to, and a store refund is a support ticket
   * rather than a void. An account with no plan is the cheaper of the two failures, so the account
   * is made first and the card taken after it. A host that bills by card only and wants the web
   * order back passes `'beforeAccount'`.
   */
  paymentOrder?: SignupPaymentOrder;
  /**
   * Carried through to the payment step for an app whose payment configuration wants a billing
   * address. This package ships NO address form — the native payment screen collects an amount and
   * hands the card to the host's payment-action handler — so the flag is passed on and nothing is
   * collected for it here. A host that needs one collects it and supplies it to its own handler.
   */
  requireBillingAddress?: boolean;
  /**
   * Store products to buy a plan with when the app is sold through the App Store or Google Play
   * (`requiresAppStorePayment`). Maps each tier (and optionally each pricing option) to a store
   * product id, exactly as {@link useInAppPurchases} takes them. Without it there is no product to
   * buy a store-billed plan with, and the payment step says the purchase has to be finished
   * elsewhere rather than offering a card the store would refuse.
   */
  iapProducts?: IapProductMapping[];
  /**
   * How a card sheet or 3-D Secure challenge is shown on this device. Overrides `WildwoodProvider`'s
   * handler. Without one, packs are only bought against a card already on file and a challenge is
   * reported rather than attempted — see the README.
   */
  paymentActionHandler?: PaymentActionAdapter;
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
  /**
   * Let the user buy packs themselves, through the component's own card-once checkout. Ignored on a
   * device the app's store must bill: there is no store product behind a pack.
   */
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
   * Optional, and rarely wanted: the view has its own card modal and uses it when this is left out.
   * A host that passes one keeps full control — its answer is taken instead, exactly as the older
   * `SubscriptionAdminComponent` behaved.
   */
  onPaymentRequired?: (args: PaymentRequiredArgs) => Promise<string | null | undefined>;
  /**
   * How a card sheet or 3-D Secure challenge is shown on this device. Overrides `WildwoodProvider`'s
   * handler. Without one the change is never parked on a challenge the device cannot answer — see
   * the README.
   */
  paymentActionHandler?: PaymentActionAdapter;
  /** Called after the subscription changes, so the host can refresh whatever else shows it. */
  onSubscriptionChanged?: () => void;
  /** Called after entitlements change, so the host can refresh its own gates. */
  onEntitlementsChanged?: (reason: EntitlementsChangedReason) => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// The component's own props
// ───────────────────────────────────────────────────────────────────────────────

/** `view` picks the surface, and with it the rest of the props. */
export type RegistrationAndSubscriptionComponentProps =
  | ({ view: 'pricing' } & RegistrationSubscriptionPricingProps)
  | ({ view: 'signup' } & RegistrationSubscriptionSignupProps)
  | ({ view: 'manage' } & RegistrationSubscriptionManageProps);
