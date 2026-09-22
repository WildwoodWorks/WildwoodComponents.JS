// The registration-and-subscription types that carry no UI.
//
// A view's props belong to the package that renders them — `className`, a `ReactNode` fallback and
// a `renderClosed` callback are web words — but the shapes the FLOWS speak in are the same on every
// stack, so they live here and every UI package imports them.

/** What a failure inside the component is reported as. `code` is stable; `message` is for people. */
export interface RegistrationSubscriptionError {
  /** A stable, machine-readable reason, e.g. `catalog_unavailable`. */
  code: string;
  /** What went wrong, in words a host can show. */
  message: string;
}

/** The billing cycle a pricing selection was made under. */
export type PricingBilling = 'monthly' | 'annual';

/** Whether the signup flow asks the visitor to choose a plan. */
export type SignupPlanSelection = 'choose' | 'skip';

/** The plan the grid opens on when nothing has chosen one. */
export type SignupPlanDefault = 'none' | 'free';

/**
 * Whether the signup flow offers packs. `'multi'` is the pack grid, ticked and continued once —
 * the same wording the pricing view uses, because it is the same grid. Packs a signup link already
 * chose are bought either way; `'none'` only takes the step where they are picked out of the flow.
 */
export type SignupPackSelection = 'multi' | 'none';

/**
 * What a plan change needs a card for. Handed to the host's own `onPaymentRequired`, and to the
 * built-in card modal when the host brought none.
 */
export interface PaymentRequiredArgs {
  tierId: string;
  tierName: string;
  /** The tier's pricing option (AppTierPricing id). Not a pricing model id. */
  pricingId?: string;
  /**
   * The pricing model behind that option — what `PaymentComponent`'s `pricingModelId` needs, so the payment
   * starts the plan's recurring subscription (and its trial) rather than a one-time charge.
   */
  pricingModelId?: string;
  /** The amount the plan's subscription charges (the pricing option's price). */
  price?: number;
  /** Free-trial days on the pricing option; pass to `PaymentComponent`'s `trialDays`. */
  trialDays?: number;
}

/** The plan a tier grid was asked to move to. */
export interface TierSelectedEventArgs {
  tierId: string;
  tierName: string;
  pricingId?: string;
  price?: number;
  isFreeTier: boolean;
  /** False when the account has no subscription yet, which is a subscribe rather than a change. */
  isChange: boolean;
}
