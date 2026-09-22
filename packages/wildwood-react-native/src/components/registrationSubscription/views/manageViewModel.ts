// Every decision the native manage view makes, as functions with no React and no react-native in
// them.
//
// The ORDER of a plan change - preview, confirm, card, change, challenge, complete - is the shared
// `usePlanChangeFlow`, and the panels are this package's existing admin panels. What is here is the
// half a view owns: which sections render and in what arrangement, where the card for a change comes
// from, which packs are still on offer, and the two rules a store-billed device adds.
//
// It exists as its own module because this package ships no component renderer under vitest: a rule
// that lives inside JSX is a rule that cannot be tested.
//
// Three rules bind the file:
//
//  · No price is ever stated here. Amounts come off the catalog or the server's preview and are
//    formatted by `formatMoney`; a guard test greps this directory for a price literal.
//  · `SupportsPaymentAction` is asked for ONLY when something on this device can answer a bank's
//    challenge. Telling the server otherwise parks a change nobody can finish.
//  · A store-billed device is told the truth about who bills it, rather than being quoted a
//    proration the store will not honour.

import type {
  AppTierAddOnModel,
  AppTierLimitStatusModel,
  AppTierModel,
  UserAddOnSubscriptionModel,
} from '@wildwood/core';
import type {
  PaymentActionAdapter,
  PaymentRequiredArgs,
  PlanChangeStep,
  RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { ownsAddOn } from '../../subscription/AddOnsPanel';
import type { ManageLayout, ManageSection } from '../types';

/** The sections a viewer may see, in the order they render when the host names none. */
export const ALL_MANAGE_SECTIONS: ManageSection[] = [
  'subscription',
  'plans',
  'features',
  'addOns',
  'usage',
  'overrides',
];

export interface ManageSectionInput {
  /** The host's own order, or undefined for {@link ALL_MANAGE_SECTIONS}. */
  sections?: ManageSection[];
  isAdmin: boolean;
  showAddOns: boolean;
}

/**
 * Which sections render, in the order they were asked for.
 *
 * The two filters apply whether the section was named or defaulted: naming `overrides` does not let
 * a non-admin see per-user grants, and naming `addOns` does not put the packs panel back on a
 * surface the host turned packs off for.
 */
export function visibleManageSections({ sections, isAdmin, showAddOns }: ManageSectionInput): ManageSection[] {
  return (sections ?? ALL_MANAGE_SECTIONS).filter((section) => {
    if (section === 'overrides') return isAdmin;
    if (section === 'addOns') return showAddOns;
    return true;
  });
}

/** Where the subscription card goes, and what is left for the tabs or the stack below it. */
export interface ManageBodyLayout {
  /** The subscription card is lifted out of the section list and rendered above it. */
  statusAbove: boolean;
  /** The sections the tab bar or the stacked page carries. */
  body: ManageSection[];
}

/**
 * The status card lifted above the tabs is not ALSO one of the sections below them - it would
 * otherwise render twice, which is what the web's `showStatusAboveTabs` has always avoided.
 */
export function manageBodyLayout(visible: ManageSection[], showStatusAboveTabs: boolean): ManageBodyLayout {
  const statusAbove = showStatusAboveTabs && visible.includes('subscription');
  return {
    statusAbove,
    body: visible.filter((section) => !(statusAbove && section === 'subscription')),
  };
}

/**
 * Which tab is open: the one the user chose while it is still on offer, else the first.
 *
 * A tab can stop being on offer without anybody pressing anything - `isAdmin` flipping takes
 * `overrides` away - and a layout that keeps pointing at it renders nothing at all.
 */
export function currentManageTab(active: ManageSection | null, body: ManageSection[]): ManageSection | undefined {
  return active && body.includes(active) ? active : body[0];
}

/** The heading a section carries, in both layouts. Every one of them is a label. */
export function manageSectionTitle(section: ManageSection, labels: RegistrationSubscriptionLabels): string {
  switch (section) {
    case 'subscription':
      return labels.sectionStatus;
    case 'plans':
      return labels.sectionPlans;
    case 'features':
      return labels.sectionFeatures;
    case 'addOns':
      return labels.sectionPacks;
    case 'usage':
      return labels.sectionUsage;
    case 'overrides':
      return labels.sectionOverrides;
  }
}

/** Whether this layout puts one section on screen at a time. */
export function isTabbedLayout(layout: ManageLayout): boolean {
  return layout !== 'stacked';
}

/**
 * The currency the panels quote in: the host's override, then the currency the server quoted the
 * plans in, and only then the platform's fallback. Never a guessed one.
 */
export function manageCurrency(currency: string | undefined, tiers: readonly AppTierModel[]): string {
  return currency ?? tiers.find((tier) => tier.currency)?.currency ?? 'USD';
}

/**
 * The limit statuses the usage panel renders.
 *
 * A host merge that has not answered yet must not blank the panel, so the server's own statuses
 * stand until it does.
 */
export function effectiveLimitStatuses(
  merged: AppTierLimitStatusModel[],
  fromServer: AppTierLimitStatusModel[],
  hasMerge: boolean,
): AppTierLimitStatusModel[] {
  if (!hasMerge) return fromServer;
  return merged.length > 0 ? merged : fromServer;
}

/* ------------------------------------------------------------------------------------------------
 * The card a plan change needs
 * ---------------------------------------------------------------------------------------------- */

/** Where the card for a plan change comes from, at this moment. */
export type PlanChangeCardSource =
  /** Nothing is being collected: the change is elsewhere in the flow, or needs no card. */
  | 'none'
  /** The host's own `onPaymentRequired` owns the step; its answer is final. */
  | 'host'
  /** The component's own `PaymentModal` is mounted for it. */
  | 'builtIn'
  /** Nothing on this surface can take a card, so the customer is told where to finish. */
  | 'finishOnWeb';

export interface PlanChangeCardInput {
  /** The machine's step. */
  step: PlanChangeStep;
  /** A host `onPaymentRequired` was supplied. */
  hasHostHandler: boolean;
  /** What the flow wants collected - null while the host's handler owns the step. */
  paymentRequest: PaymentRequiredArgs | null;
  /** This surface mounts the built-in `PaymentModal`. */
  collectsPaymentInApp: boolean;
}

/**
 * Which of the four applies.
 *
 * The host's handler wins wherever it exists - it predates the built-in modal and a host that wired
 * one means it. Otherwise the surface's own modal takes the card: `PaymentComponent` completes a
 * payment on this stack with no payment SDK at all (the provider's own page, or a server-owned
 * completion), so a missing `PaymentActionAdapter` does not make the card uncollectable. A surface
 * that mounts no modal is the only one left with nothing to offer, and it says so rather than
 * spinning on a step that will never resolve.
 */
export function planChangeCardSource(input: PlanChangeCardInput): PlanChangeCardSource {
  if (input.step !== 'collectingPayment') return 'none';
  if (input.hasHostHandler) return 'host';
  if (!input.paymentRequest) return 'none';
  return input.collectsPaymentInApp ? 'builtIn' : 'finishOnWeb';
}

/**
 * Whether the change may tell the server this device can answer a 3-D Secure challenge.
 *
 * The shared flow reads exactly this: with an adapter it posts the options form carrying
 * `SupportsPaymentAction: true` and the server may PARK a change on a challenge; without one it
 * posts the plain change, which the server refuses rather than parking. Asking for a park nothing
 * can answer strands the customer's money in an intent nobody confirms.
 */
export function maySendSupportsPaymentAction(handler: PaymentActionAdapter | null | undefined): boolean {
  return handler != null;
}

/* ------------------------------------------------------------------------------------------------
 * Packs, and what a store-billed device changes
 * ---------------------------------------------------------------------------------------------- */

/** The parts of a pack subscription the manage view's own rules read. */
type OwnedPackRow = Pick<UserAddOnSubscriptionModel, 'status' | 'appTierAddOnId'>;

/**
 * The packs still on offer: everything the account does not already have access to.
 *
 * A cancelled or expired row is on offer again; one scheduled to cancel is still owned, so it is
 * not sold twice. That is the single `grantsAccess` rule the panel's own lists follow.
 */
export function availablePacks(
  addOns: readonly AppTierAddOnModel[],
  subscriptions: readonly OwnedPackRow[],
): AppTierAddOnModel[] {
  return addOns.filter((addOn) => !ownsAddOn(subscriptions, addOn.id));
}

export interface PackSelfServiceInput {
  /** The host allows the user to buy packs. */
  allowPackSelfService: boolean;
  /** The packs panel is on screen at all. */
  showAddOns: boolean;
  /** The app's payment configuration says this device must pay through its store. */
  storeOnly: boolean;
}

/**
 * Whether the packs panel offers "Add packs".
 *
 * A store-billed device is the interesting case: pack checkout is a card purchase and there is no
 * store product behind an add-on, so the PURCHASE is hidden. Packs the account already has - bought,
 * bundled or granted - still render, and can still be cancelled: hiding those would hide what the
 * customer is paying for.
 */
export function packSelfServiceOffered({ allowPackSelfService, showAddOns, storeOnly }: PackSelfServiceInput): boolean {
  return allowPackSelfService && showAddOns && !storeOnly;
}

/**
 * Whether the confirmation shows the server's proration figures.
 *
 * The preview prices a card change: a credit for unused days, a prorated charge today, a next
 * billing date. None of that describes a store subscription, which the store prices and bills on
 * its own terms, so on a store-billed device the figures are replaced by the
 * {@link RegistrationSubscriptionLabels.storeManagesBilling} notice.
 */
export function showsProration(storeOnly: boolean): boolean {
  return !storeOnly;
}
