// In-app purchase (IAP) types - the platform-agnostic contract shared by React Native,
// and future Swift/Kotlin, clients that validate App Store / Play Store purchases.

import type { PaymentProviderType, PaymentCompletionResult } from './types.js';

/**
 * Maps a store product id (as configured in App Store Connect / Google Play Console)
 * onto the Wildwood tier - and optionally the pricing model - it grants.
 */
export interface IapProductMapping {
  productId: string;
  tierId: string;
  pricingId?: string;
}

/**
 * The payment provider types that represent a native app store.
 */
export type StoreProviderType = PaymentProviderType.AppleAppStore | PaymentProviderType.GooglePlayStore;

/**
 * A completed native store purchase, ready to be handed to the server for validation.
 * This is the receipt hand-off seam: everything the server needs to validate a store
 * purchase, independent of which store library produced it.
 */
export interface StorePurchase {
  providerType: StoreProviderType;
  /** The store product id that was purchased. */
  productId: string;
  /**
   * The proof of purchase. On Apple this is the StoreKit 2 signed JWS transaction;
   * on Google this is the `purchaseToken` returned by Google Play Billing.
   */
  purchaseToken: string;
  /** The store's own transaction id, when the client has it. */
  transactionId?: string;
  /** True when this purchase came from a restore flow rather than a fresh purchase. */
  isRestore?: boolean;
}

/**
 * The result of validating a store purchase. `transactionId` is the Wildwood payment
 * transaction id, which callers pass as `paymentTransactionId` to
 * `appTier.changeTier` / `appTier.selfSubscribe`.
 */
export type StorePurchaseValidationResult = PaymentCompletionResult;
