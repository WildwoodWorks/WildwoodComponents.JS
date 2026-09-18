import type {
  AppTierModel,
  AppTierPricingModel,
  AppTierChangeResultModel,
  TierChangePreviewModel,
} from '@wildwood/core';
import type { PaymentRequiredArgs } from '@wildwood/react-shared';

/**
 * Payload handed to a host app when a tier change needs money collected before the server will
 * apply it. The host resolves with a payment transaction id to continue, or `null`/`undefined`
 * to cancel.
 *
 * Declared in `@wildwood/react-shared` alongside the flows that hand it out — one shape for web and
 * native — and re-exported from here so existing imports keep resolving.
 */
export type { PaymentRequiredArgs } from '@wildwood/react-shared';

/** The parts of a tier's pricing option a payment needs to start that plan's own subscription. */
export type TierChangePricingOption = Pick<AppTierPricingModel, 'id' | 'pricingModelId' | 'price' | 'trialDays'>;

/**
 * The payment seam itself. Returning a transaction id retries the change with that id;
 * returning `null`/`undefined` means the user backed out — the change is abandoned silently.
 */
export type OnPaymentRequired = (args: PaymentRequiredArgs) => Promise<string | null | undefined>;

/**
 * Shown when the server wants payment but the host never wired {@link OnPaymentRequired}. Kept in
 * one place so SubscriptionAdminComponent and AppTierComponent say the same thing.
 */
export const PAYMENT_CALLBACK_MISSING_MESSAGE =
  'Payment is required. Wire the onPaymentRequired callback to collect payment.';

/**
 * The tier's pricing option a change was made against: the tier by id, then its pricing option by
 * the tier-pricing link id the plans grid handed out. The same lookup the web admin component does.
 */
export function findTierPricing(
  tiers: readonly AppTierModel[],
  tierId: string,
  pricingId?: string,
): AppTierPricingModel | undefined {
  return tiers.find((t) => t.id === tierId)?.pricingOptions?.find((p) => p.id === pricingId);
}

/**
 * What the host's payment callback is told about a change that needs paying for.
 *
 * The money is the PLAN's price, not the preview's prorated charge: the payment starts the new
 * plan's own recurring subscription (and its trial), so it must be quoted and charged at what that
 * subscription costs. Quoting the proration made the host collect a one-time amount against a
 * pricing model the server could not find, which left no subscription, no renewal and no trial.
 * `pricingId` stays the tier-pricing link id existing callers already receive; `pricingModelId` is
 * the model behind it, which is what `PaymentComponent`'s `pricingModelId` needs.
 */
export function paymentArgsForTierChange(
  selection: { tierId: string; tierName: string; pricingId?: string },
  preview: Pick<TierChangePreviewModel, 'proratedChargeToday' | 'newPrice'>,
  pricing?: TierChangePricingOption | null,
): PaymentRequiredArgs {
  return {
    tierId: selection.tierId,
    tierName: selection.tierName,
    pricingId: selection.pricingId,
    pricingModelId: pricing?.pricingModelId,
    price: pricing?.price ?? preview.newPrice ?? preview.proratedChargeToday ?? 0,
    trialDays: pricing?.trialDays,
  };
}

/**
 * Whether a change to this tier can possibly need payment. Free targets never can (the server
 * charges for free -> paid and paid -> more expensive only), so they skip the preview round-trip
 * and go straight to the change, exactly as before the seam existed.
 */
export function shouldPreviewTierChange(tier: Pick<AppTierModel, 'isFreeTier'>): boolean {
  return tier.isFreeTier !== true;
}

export interface TierChangeFlowInput {
  tier: Pick<AppTierModel, 'id' | 'name' | 'isFreeTier'>;
  /**
   * The pricing option the change is for, when the caller has one. It carries the plan's price,
   * pricing model and trial into {@link PaymentRequiredArgs}; without it the payment falls back to
   * the preview's figures.
   */
  pricing?: TierChangePricingOption | null;
  /** Prices the change without applying it. Resolve failures are tolerated — see the flow below. */
  previewTierChange: (tierId: string) => Promise<TierChangePreviewModel>;
  /** Applies the change (changeTier or selfSubscribe), optionally with a payment transaction id. */
  applyChange: (paymentTransactionId?: string) => Promise<AppTierChangeResultModel>;
  onPaymentRequired?: OnPaymentRequired;
}

export type TierChangeFlowOutcome =
  | { status: 'changed' }
  /** The host's payment callback resolved empty: the user backed out. Not an error. */
  | { status: 'cancelled' }
  | { status: 'failed'; errorMessage: string };

/**
 * Runs a self-service tier change through the payment seam, mirroring what
 * SubscriptionAdminComponent does around its confirmation modal:
 *
 * - the preview gates on `preview.paymentRequired` (never on a locally computed price);
 * - a missing callback surfaces {@link PAYMENT_CALLBACK_MISSING_MESSAGE};
 * - an empty callback result cancels without an error.
 *
 * A preview that fails (rejects, or comes back `success: false`) degrades to the direct change
 * call, so a host whose preview endpoint is unavailable keeps the pre-seam behaviour rather than
 * losing the ability to change tier at all.
 *
 * Throws from `applyChange` propagate, except in the unwired-payment case where they are the
 * server's payment 400 and are replaced with the clearer message.
 */
export async function runTierChangeWithPayment({
  tier,
  pricing,
  previewTierChange,
  applyChange,
  onPaymentRequired,
}: TierChangeFlowInput): Promise<TierChangeFlowOutcome> {
  let preview: TierChangePreviewModel | null = null;
  if (shouldPreviewTierChange(tier)) {
    try {
      const result = await previewTierChange(tier.id);
      if (result.success) preview = result;
    } catch {
      // Degrade to the direct call — the server still enforces payment.
    }
  }

  const toOutcome = (result: AppTierChangeResultModel): TierChangeFlowOutcome =>
    result.success
      ? { status: 'changed' }
      : { status: 'failed', errorMessage: result.errorMessage || 'Tier change failed' };

  if (!preview?.paymentRequired) {
    return toOutcome(await applyChange());
  }

  if (!onPaymentRequired) {
    // Keep the pre-seam behaviour (attempt it — an admin override or a stale preview may still
    // let it through) but report the actionable message instead of the raw server 400.
    try {
      const result = await applyChange();
      if (result.success) return { status: 'changed' };
    } catch {
      // fall through to the message below
    }
    return { status: 'failed', errorMessage: PAYMENT_CALLBACK_MISSING_MESSAGE };
  }

  const paymentTransactionId = await onPaymentRequired(
    paymentArgsForTierChange({ tierId: tier.id, tierName: tier.name, pricingId: pricing?.id }, preview, pricing),
  );
  if (!paymentTransactionId) return { status: 'cancelled' };

  return toOutcome(await applyChange(paymentTransactionId));
}
