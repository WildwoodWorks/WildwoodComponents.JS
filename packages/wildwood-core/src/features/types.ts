// Disclaimer and App Tier types - ported from WildwoodComponents.Shared/Models/

// Disclaimer types
export { type PendingDisclaimerModel } from '../auth/types.js';

export interface DisclaimerAcceptanceResult {
  success: boolean;
  message?: string;
}

export interface PendingDisclaimersResponse {
  hasPendingDisclaimers: boolean;
  disclaimers: import('../auth/types.js').PendingDisclaimerModel[];
  errorMessage?: string;
}

export interface DisclaimerAcceptanceResponse {
  success: boolean;
  errorMessage?: string;
}

// App Tier types
export interface AppTierModel {
  id: string;
  appId: string;
  name: string;
  description: string;
  displayOrder: number;
  isDefault: boolean;
  isFreeTier: boolean;
  allowUpgrades: boolean;
  allowDowngrades: boolean;
  status: string;
  badgeColor: string;
  iconClass: string;
  showSubscribeButton: boolean;
  showContactButton: boolean;
  contactButtonUrl?: string;
  showPrice: boolean;
  customBadgeText?: string;
  /**
   * ISO code the tier's prices are quoted in, from the app's payment configuration. The public
   * catalog endpoint fills it in so an anonymous pricing page never guesses a currency; older
   * servers omit it, which is why it is optional here.
   */
  currency?: string;
  pricingOptions: AppTierPricingModel[];
  features: AppTierFeatureModel[];
  limits: AppTierLimitModel[];
}

export interface AppTierPricingModel {
  id: string;
  appTierId: string;
  pricingModelId: string;
  isDefault: boolean;
  displayOrder: number;
  pricingModelName: string;
  price: number;
  billingFrequency: string;
  billingFrequencyLabel?: string;
  /** Free-trial length in days from the underlying PricingModel; the payment processor starts the same trial. */
  trialDays?: number;
}

export interface AppTierFeatureModel {
  id: string;
  featureCode: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  category: string;
}

export interface AppTierLimitModel {
  id: string;
  limitCode: string;
  displayName: string;
  maxValue: number;
  limitType: string;
  unit: string;
  isUnlimited: boolean;
  maxValueDisplay?: string;
}

export interface AppTierAddOnModel {
  id: string;
  appId: string;
  name: string;
  description: string;
  category: string;
  status: string;
  displayOrder: number;
  iconClass: string;
  badgeColor: string;
  trialDays?: number;
  /** ISO code the pack's prices are quoted in — the same app-level currency the tiers carry. */
  currency?: string;
  features: AppTierAddOnFeatureModel[];
  pricingOptions: AppTierAddOnPricingModel[];
  bundledInTierIds: string[];
}

export interface AppTierAddOnFeatureModel {
  id: string;
  featureCode: string;
  displayName: string;
  description: string;
}

export interface AppTierAddOnPricingModel {
  id: string;
  pricingModelId: string;
  pricingModelName: string;
  price: number;
  billingFrequency: string;
  /** Trial length (days) from the underlying PricingModel; drives the processor's native trial. */
  trialDays?: number;
  isDefault: boolean;
}

export interface UserTierSubscriptionModel {
  id: string;
  userId: string;
  appId: string;
  appTierId: string;
  appTierPricingId?: string;
  status: string;
  paymentTransactionId?: string;
  startDate: string;
  endDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEndDate?: string;
  gracePeriodEndDate?: string;
  pendingTierId?: string;
  tierName: string;
  tierDescription: string;
  isFreeTier: boolean;
  pendingTierName: string;
  pendingChangeDate?: string;
  companyId?: string;
  companyName?: string;
}

export interface UserAddOnSubscriptionModel {
  id: string;
  userId: string;
  appId: string;
  companyId?: string;
  appTierAddOnId: string;
  appTierAddOnPricingId?: string;
  status: string;
  /**
   * The payment that bought this pack. A row WITHOUT one was granted rather than sold — a
   * registration token's included pack, or an admin grant — so nothing bills it and there is
   * nothing to cancel at a provider.
   */
  paymentTransactionId?: string;
  /** The payment provider the pack is billed through, when one bills it. */
  userPaymentProviderId?: string;
  addOnName: string;
  addOnDescription: string;
  isBundled: boolean;
  startDate: string;
  endDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEndDate?: string;
  gracePeriodEndDate?: string;
}

export interface AppFeatureCheckResultModel {
  featureCode: string;
  displayName: string;
  hasAccess: boolean;
  currentTierName: string;
  requiredTierName: string;
  upgradeMessage: string;
  availableAsAddOn: boolean;
  addOnId: string;
  addOnName: string;
  addOnPrice?: number;
}

export interface AppTierLimitStatusModel {
  limitCode: string;
  displayName: string;
  currentUsage: number;
  maxValue: number;
  isUnlimited: boolean;
  usagePercent: number;
  isAtWarningThreshold: boolean;
  isExceeded: boolean;
  isHardBlocked: boolean;
  unit: string;
  statusMessage: string;
}

export interface AppFeatureDefinitionModel {
  featureCode: string;
  displayName: string;
  description: string;
  category: string;
  iconClass: string;
  displayOrder: number;
  isEnabled: boolean;
}

/**
 * Result of a tier change.
 *
 * `requiresAction` and `processing` are "not yet", not "no": the processor accepted the change and
 * is waiting on the customer (3-D Secure) or on itself, and both arrive with `success: false`. A
 * caller must not treat either as a refusal — confirm `clientSecret` and then post the change's
 * `pendingChangeId` to {@link AppTierService.completeTierChange}.
 */
export interface AppTierChangeResultModel {
  success: boolean;
  errorMessage: string;
  subscription?: UserTierSubscriptionModel;
  isScheduled: boolean;
  effectiveDate?: string;
  /** The customer must authenticate the prorated charge before the plan moves. */
  requiresAction?: boolean;
  /** The secret the browser/app confirms. Secret — never log it, never store it. */
  clientSecret?: string;
  /** Id of the parked change, for the completion endpoint. */
  pendingChangeId?: string;
  paymentIntentId?: string;
  /** When the processor drops a parked change that is never authenticated (ISO date). */
  expiresAt?: string;
  /** Amount being authenticated, in major units. */
  amountDue?: number;
  /** Currency of `amountDue`. */
  currency?: string;
  /** The payment is in but the processor has not finished applying the change — complete again shortly. */
  processing?: boolean;
  /** Machine-readable refusal reason; see {@link TierChangeErrorCode}. */
  errorCode?: string;
}

/**
 * The `errorCode` values the plan-change completion path returns (the server's
 * `TierChangeErrorCodes`). A caller may see other strings — the SDK never narrows the wire value
 * to this union — so compare against it rather than switching exhaustively on it.
 */
export type TierChangeErrorCode =
  | 'pending_change_not_found'
  | 'pending_change_expired'
  | 'pending_change_payment_failed'
  | 'pending_change_superseded'
  | 'tier_change_already_in_progress';

/** Options form of a self-service tier change. */
export interface SelfChangeTierOptions {
  newTierId: string;
  newPricingId?: string;
  /** Apply now rather than at the end of the billing period. Defaults to true. */
  immediate?: boolean;
  /** A payment that has already been made, to pay for the new plan. */
  paymentTransactionId?: string;
  /**
   * The caller can confirm a payment (it has the payment SDK loaded) and will call
   * {@link AppTierService.completeTierChange} afterwards. Left false, a change whose proration
   * needs 3-D Secure is refused rather than parked.
   */
  supportsPaymentAction?: boolean;
}

/** What `GET api/app-tiers/{appId}/trial-eligibility` answers. */
export interface TrialEligibilityModel {
  /** Whether this account may still start a free trial on a tier. */
  tierTrialEligible: boolean;
  /** The same answer per active add-on, keyed by add-on id. A missing key means "unknown". */
  addOns: Record<string, boolean>;
}

/** One pack in a checkout basket. Leave `pricingId` out to take the pack's default pricing. */
export interface AddOnCheckoutItemInput {
  addOnId: string;
  pricingId?: string;
}

/** One quoted pack. Every field is the server's own answer — never the client's ask. */
export interface AddOnCheckoutQuoteLineModel {
  addOnId: string;
  pricingId: string;
  name: string;
  price: number;
  billingFrequency: string;
  trialDays: number;
  /** Whether THIS account may still use the pack's trial (one trial per account). */
  trialEligible: boolean;
  /** Zero when the pack starts a trial, else the full price. */
  dueToday: number;
  trialEnd?: string;
}

/** The card already on file, named the way a UI shows it. Never carries a payment method id. */
export interface AddOnCheckoutSavedCardModel {
  brand?: string;
  last4?: string;
}

/**
 * A priced basket. `checkoutId` is echoed back on the purchase and is what makes it idempotent,
 * so a double-clicked buy button cannot buy the same pack twice.
 */
export interface AddOnCheckoutQuoteModel {
  success: boolean;
  checkoutId: string;
  /** The provider this quote's saved card and `requiresPaymentMethod` are about; echo it back. */
  providerId?: string;
  /** ISO currency of the quoted prices. Empty when the quote was refused before pricing anything. */
  currency: string;
  lines: AddOnCheckoutQuoteLineModel[];
  totalDueToday: number;
  /** True when there is no card to reuse and one has to be collected first. */
  requiresPaymentMethod: boolean;
  savedCard?: AddOnCheckoutSavedCardModel;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * The card-collection intent: confirm `clientSecret`, then hand `paymentTransactionId` to the
 * checkout, which reads the saved card off it.
 */
export interface AddOnCheckoutPaymentMethodModel {
  success: boolean;
  clientSecret?: string;
  setupIntentId?: string;
  paymentTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * What became of one pack: it is running (`trialing`/`active`), the customer still has to
 * authenticate the card (`requires_action`, with nothing subscribed yet), or it failed and
 * nothing was charged.
 */
export type AddOnCheckoutItemStatus = 'trialing' | 'active' | 'requires_action' | 'failed';

export interface AddOnCheckoutItemResultModel {
  addOnId: string;
  pricingId: string;
  status: AddOnCheckoutItemStatus;
  /** The add-on subscription row's id, once there is one. */
  subscriptionId?: string;
  trialEnd?: string;
  amountDueToday?: number;
  /** The 3-D Secure secret for a pack the bank wants authenticated. Secret — never log it. */
  clientSecret?: string;
  paymentIntentId?: string;
  paymentTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** One result per requested pack, or a refusal that stopped the whole basket. */
export interface AddOnCheckoutResultModel {
  success: boolean;
  checkoutId: string;
  results: AddOnCheckoutItemResultModel[];
  /** Set when nothing was attempted — a bad basket, a foreign provider, no card. */
  errorCode?: string;
  errorMessage?: string;
}

/** The purchase. The card comes from exactly one of `paymentTransactionId` or `useSavedCard`. */
export interface AddOnCheckoutRequestModel {
  checkoutId: string;
  providerId: string;
  paymentTransactionId?: string;
  useSavedCard?: boolean;
  items: AddOnCheckoutItemInput[];
}

/**
 * Why a quote, a purchase or one pack was refused (the server's `AddOnCheckoutErrors`). Callers
 * may see other strings; compare against this union rather than switching exhaustively on it.
 */
export type AddOnCheckoutErrorCode =
  | 'NoItems'
  | 'DuplicateItem'
  | 'AppNotFound'
  | 'AddOnNotFound'
  | 'AddOnNotAvailable'
  | 'PricingNotFound'
  | 'AlreadySubscribed'
  | 'BundledInTier'
  | 'TierTooLow'
  | 'DependencyMissing'
  | 'ProviderNotAvailable'
  | 'PaymentMethodRequired'
  | 'TransactionNotFound'
  | 'TransactionNotYours'
  | 'TransactionProviderMismatch'
  | 'PaymentNotVerified'
  | 'CheckoutIdRequired'
  | 'ProcessorError'
  | 'SubscriptionNotCreated';

/** The `errorCode` values the pack lifecycle returns (the server's `AddOnSubscriptionErrorCodes`). */
export type AddOnSubscriptionErrorCode =
  | 'addon_subscription_not_found'
  | 'addon_subscription_forbidden'
  | 'addon_subscription_provider_refused'
  | 'addon_subscription_not_pending_cancellation'
  | 'addon_subscription_not_provider_billed'
  | 'addon_subscription_error';

/**
 * A refusal an add-on/tier action reports instead of throwing.
 *
 * `code` is the server's own error code when it sent one; otherwise it is `'NotSupported'` (the
 * route is absent — a server older than this SDK) or `'RequestFailed'` (the request never got a
 * structured answer).
 */
export interface AppTierActionError {
  code: string;
  message: string;
  /** HTTP status, when the failure got that far. */
  status?: number;
}

/** Result of subscribing to a single pack. */
export type AddOnSubscribeResultModel =
  | { success: true; subscription?: UserAddOnSubscriptionModel }
  | { success: false; error: AppTierActionError };

/**
 * Result of cancelling a pack. `isScheduled` true means access continues until `effectiveDate`
 * (the end of the period already paid for); false means it ended now.
 */
export interface AddOnSubscriptionCancelResultModel {
  success: boolean;
  isScheduled?: boolean;
  /** The row's status after the call. */
  status?: string;
  effectiveDate?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Result of clearing a scheduled pack cancellation. */
export interface AddOnSubscriptionReactivateResultModel {
  success: boolean;
  status?: string;
  /** The refreshed subscription, so a client can render the restored status without a re-read. */
  subscription?: UserAddOnSubscriptionModel;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Result of a subscription cancellation. isScheduled=true means access continues until
 * effectiveDate (the end of the current billing period); false means access ended immediately.
 * requiresUserAction is set for store-billed subscriptions (Apple App Store / Google Play):
 * the platform cannot stop the store's billing — show userActionInstructions/userActionUrl
 * so the user cancels in their store settings too.
 */
export interface AppTierCancelResultModel {
  success: boolean;
  errorMessage?: string;
  isScheduled?: boolean;
  effectiveDate?: string;
  requiresUserAction?: boolean;
  userActionUrl?: string;
  userActionInstructions?: string;
}

export interface AppFeatureOverrideModel {
  id: string;
  appId: string;
  companyId?: string;
  userId?: string;
  featureCode: string;
  isEnabled: boolean;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface TierChangePreviewModel {
  success: boolean;
  errorMessage?: string;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isBillingFrequencyChange: boolean;
  paymentRequired: boolean;
  paymentBypassAllowed: boolean;
  paymentProviderAvailable: boolean;
  currentTierName?: string;
  currentPrice?: number;
  currentBillingFrequency?: string;
  newTierName?: string;
  newPrice?: number;
  newBillingFrequency?: string;
  monthlyEquivalentCurrent?: number;
  monthlyEquivalentNew?: number;
  proratedChargeToday?: number;
  creditAmount?: number;
  nextBillingAmount?: number;
  nextBillingDate?: string;
  effectiveDate?: string;
  featuresGained: string[];
  featuresLost: string[];
  currency: string;
  daysRemainingInPeriod: number;
  allowImmediateChange: boolean;
  allowScheduledChange: boolean;
}
