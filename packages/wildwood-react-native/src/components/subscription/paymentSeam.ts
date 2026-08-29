import type { AppTierModel, AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';

/**
 * Payload handed to a host app when a tier change needs money collected before the server will
 * apply it. The host resolves with a payment transaction id to continue, or `null`/`undefined`
 * to cancel.
 */
export interface PaymentRequiredArgs {
  tierId: string;
  tierName: string;
  pricingId?: string;
  price?: number;
}

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
 * What the payment callback should collect: the prorated charge when the server computed one,
 * otherwise the new tier's list price, otherwise nothing.
 */
export function paymentAmountForPreview(
  preview: Pick<TierChangePreviewModel, 'proratedChargeToday' | 'newPrice'>,
): number {
  return preview.proratedChargeToday ?? preview.newPrice ?? 0;
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

  const paymentTransactionId = await onPaymentRequired({
    tierId: tier.id,
    tierName: tier.name,
    price: paymentAmountForPreview(preview),
  });
  if (!paymentTransactionId) return { status: 'cancelled' };

  return toOutcome(await applyChange(paymentTransactionId));
}
