// The DOM-free decisions the signup wizard makes about a plan: what a registration token already
// granted, whether the wizard activates a plan itself, and what the success step says.
//
// They live outside the component because this package has no React renderer, so this is where the
// rules can be tested. The web wizard makes the same three decisions inline.

import type {
  AppTierChangeResultModel,
  AppTierModel,
  AppTierPricingModel,
  RegistrationTokenAppGrant,
  RegistrationTokenDetails,
} from '@wildwood/core';

/**
 * The plan a registration token gives THIS app, if any.
 *
 * `details` is `null` when the token's details could not be read (an older server, a network
 * failure) — which is not the same as an invalid token, so a null simply means "no grant to honour"
 * and the wizard carries on with its normal flow and the plain validity check. App ids are compared
 * case-insensitively: the server returns them in whichever casing it stored.
 */
export function findTokenPlanGrant(
  details: RegistrationTokenDetails | null | undefined,
  appId: string,
): RegistrationTokenAppGrant | null {
  if (!details || !appId) return null;
  const wanted = appId.toLowerCase();
  return details.appGrants?.find((grant) => grant.appId?.toLowerCase() === wanted) ?? null;
}

/** What happened to the plan the wizard was asked to activate. */
export interface SignupPlanActivation {
  /** Whether the server was asked to subscribe at all. */
  attempted: boolean;
  /** True when the subscribe was refused or failed. Non-fatal: the account exists either way. */
  failed: boolean;
  /** The refusal, for the log. */
  errorMessage?: string;
}

export interface SignupPlanActivationInput {
  tier: Pick<AppTierModel, 'id'> | null;
  pricing: Pick<AppTierPricingModel, 'id'> | null;
  /** The plan a registration token already set up, when the wizard is running on one. */
  tokenGrant: RegistrationTokenAppGrant | null;
  paymentTransactionId?: string;
  /** `client.appTier.selfSubscribe`, with the app id already bound. */
  selfSubscribe: (
    tierId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ) => Promise<AppTierChangeResultModel>;
}

/**
 * Activate the plan the wizard chose.
 *
 * Two rules, both of them bugs when they were missing:
 *
 * 1. **Never subscribe over a token's plan.** Registering with a token that carries a plan already
 *    subscribed the account to it; subscribing again REPLACES that subscription, which cancels the
 *    plan the token just set up. A grant means there is nothing for the wizard to activate.
 * 2. **A refusal is not a failed signup.** The server answers a refused subscribe with a 4xx, which
 *    the client throws — so a rejection is treated exactly like a `success: false` result. The
 *    account exists and the plan can be activated later; the wizard says so instead of stranding
 *    the user on "Activating your plan...".
 */
export async function activateSignupPlan({
  tier,
  pricing,
  tokenGrant,
  paymentTransactionId,
  selfSubscribe,
}: SignupPlanActivationInput): Promise<SignupPlanActivation> {
  if (tokenGrant || !tier) return { attempted: false, failed: false };

  const result = await selfSubscribe(tier.id, pricing?.id, paymentTransactionId).catch(
    (err: unknown): AppTierChangeResultModel => ({
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      isScheduled: false,
    }),
  );

  if (!result.success) {
    return { attempted: true, failed: true, errorMessage: result.errorMessage };
  }
  return { attempted: true, failed: false };
}

export interface SignupSuccessMessageInput {
  /** The plan a registration token set up, when the signup ran on one. */
  tokenGrant: RegistrationTokenAppGrant | null;
  /** True when the wizard never offered a plan at all (`skipTierSelection`, nothing pre-selected). */
  accountOnly: boolean;
  /** True when {@link activateSignupPlan} reported a refusal. */
  subscriptionFailed: boolean;
  /** Free-trial days on the plan that was paid for, if any. */
  trialDays?: number;
}

/** The success step's copy, in the order the web wizard resolves it. */
export function signupSuccessMessage({
  tokenGrant,
  accountOnly,
  subscriptionFailed,
  trialDays = 0,
}: SignupSuccessMessageInput): string {
  if (tokenGrant) {
    return `Your account has been created with the ${tokenGrant.appTierName ?? 'plan'} from your registration token.`;
  }
  if (accountOnly) return 'Your account has been created successfully.';
  if (subscriptionFailed) {
    return 'Your account is ready! Plan activation is pending — you can select a plan from your dashboard.';
  }
  if (trialDays > 0) {
    return `Your account has been created and your ${trialDays}-day free trial has started.`;
  }
  return 'Your account has been created and your plan is active.';
}
