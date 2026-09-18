// App tier service - ported from WildwoodComponents.Blazor/Services/AppTierComponentService.cs

import type { HttpClient } from '../client/httpClient.js';
import { WildwoodError } from '../client/errors.js';
import type {
  AppTierModel,
  AppTierAddOnModel,
  UserTierSubscriptionModel,
  UserAddOnSubscriptionModel,
  AppFeatureCheckResultModel,
  AppFeatureDefinitionModel,
  AppFeatureOverrideModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
  AppTierCancelResultModel,
  TierChangePreviewModel,
  SelfChangeTierOptions,
  TrialEligibilityModel,
  AppTierActionError,
  AddOnCheckoutItemInput,
  AddOnCheckoutQuoteModel,
  AddOnCheckoutPaymentMethodModel,
  AddOnCheckoutRequestModel,
  AddOnCheckoutResultModel,
  AddOnCheckoutItemResultModel,
  AddOnSubscribeResultModel,
  AddOnSubscriptionCancelResultModel,
  AddOnSubscriptionReactivateResultModel,
} from './types.js';

/** The parsed error body a failed request carried, when it carried an object at all. */
function errorBody(err: unknown): Record<string, unknown> | null {
  if (!(err instanceof WildwoodError)) return null;
  const details = err.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function stringField(body: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!body) return undefined;
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

/**
 * Turn a thrown request into the structured refusal the tier/pack actions report.
 *
 * The server's own `errorCode` wins whenever it sent one. A 404 that carries NO code is the one
 * case worth naming: it means the route itself is absent, i.e. the server predates this SDK, so
 * it becomes `NotSupported` rather than being reported as a missing subscription. Anything else
 * without a code — a network failure, a 500, a bare 400 — is `RequestFailed`.
 */
export function toAppTierActionError(err: unknown, fallbackMessage: string): AppTierActionError {
  const body = errorBody(err);
  const code = stringField(body, 'errorCode', 'code');
  const message =
    stringField(body, 'errorMessage', 'message', 'error') ??
    (err instanceof Error && err.message ? err.message : fallbackMessage);

  if (err instanceof WildwoodError) {
    return {
      code: code ?? (err.status === 404 ? 'NotSupported' : 'RequestFailed'),
      message,
      status: err.status,
    };
  }

  return { code: code ?? 'RequestFailed', message };
}

/**
 * Build the refusal an action reports instead of throwing.
 *
 * The checkout endpoints answer a refusal with the SAME result DTO they answer a success with, so
 * whatever the server sent is kept and only the fields it left out are filled in from `empty`.
 */
function failedResult<T extends { success: boolean; errorCode?: string; errorMessage?: string }>(
  err: unknown,
  fallbackMessage: string,
  empty: T,
): T {
  const error = toAppTierActionError(err, fallbackMessage);
  const body = errorBody(err);
  const fromServer = body && typeof body.success === 'boolean' ? (body as unknown as T) : null;
  return {
    ...empty,
    ...(fromServer ?? {}),
    success: false,
    errorCode: error.code,
    errorMessage: error.message,
  } as T;
}

/** The PascalCase basket the checkout endpoints bind. */
function toCheckoutItems(
  items: AddOnCheckoutItemInput[] | null | undefined,
): { AddOnId: string; PricingId?: string }[] {
  return (items ?? []).map((item) => ({ AddOnId: item.addOnId, PricingId: item.pricingId }));
}

export class AppTierService {
  constructor(private http: HttpClient) {}

  // ---------------------------------------------------------------------------
  // Tier Browsing
  // ---------------------------------------------------------------------------

  /**
   * Get available tiers for an app. Uses the public endpoint which works
   * for both authenticated and unauthenticated users.
   */
  async getTiers(appId: string): Promise<AppTierModel[]> {
    const { data } = await this.http.get<AppTierModel[]>(`api/app-tiers/${appId}/public`, { skipAuth: true });
    return data ?? [];
  }

  /**
   * Get ALL tiers for an app, including non-public ones (authenticated endpoint).
   * Matches the .NET GetAvailableTiersAsync; use getTiers()/getPublicTiers() for
   * public-facing pages.
   */
  async getAllTiers(appId: string): Promise<AppTierModel[]> {
    try {
      const { data } = await this.http.get<AppTierModel[]>(`api/app-tiers/${appId}`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getTier(tierId: string): Promise<AppTierModel | null> {
    try {
      const { data } = await this.http.get<AppTierModel>(`api/app-tiers/tier/${tierId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get tiers for an app without requiring authentication.
   * For use on public-facing pages like pricing displays.
   * @alias getTiers - same endpoint, kept for backward compatibility
   */
  async getPublicTiers(appId: string): Promise<AppTierModel[]> {
    return this.getTiers(appId);
  }

  /**
   * Get an app's add-ons without requiring authentication.
   * For use on public-facing pages — the add-on twin of getTiers()/getPublicTiers(), so a
   * pricing page can list the à-la-carte packs alongside the tiers.
   *
   * Returns only Active add-ons, each with its pricing options.
   *
   * Errors PROPAGATE here, unlike the authenticated add-on getters below, which swallow and
   * return []. That is deliberate and matches getTiers(): a public page has to be able to tell
   * "this app sells no packs" from "the catalog failed to load", because the honest thing to
   * show a visitor differs — and an empty array cannot express the second.
   */
  async getPublicAddOns(appId: string): Promise<AppTierAddOnModel[]> {
    const { data } = await this.http.get<AppTierAddOnModel[]>(`api/app-tier-addons/${appId}/public`, {
      skipAuth: true,
    });
    return data ?? [];
  }

  /**
   * Get available add-ons for an app (user-facing).
   */
  async getAvailableAddOns(appId: string): Promise<AppTierAddOnModel[]> {
    try {
      const { data } = await this.http.get<AppTierAddOnModel[]>(`api/app-tier-addons/${appId}/available`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Get all add-ons for an app (admin - includes inactive/disabled).
   */
  async getAllAddOns(appId: string): Promise<AppTierAddOnModel[]> {
    try {
      const { data } = await this.http.get<AppTierAddOnModel[]>(`api/app-tier-addons/${appId}`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // User Subscription
  // ---------------------------------------------------------------------------

  /**
   * The user's active subscription, or null when none exists (204 or 404 — the backend 404s
   * for users who never subscribed, matching the pre-July-2026 .NET behavior). THROWS on any
   * other transport/HTTP failure so callers can distinguish "no subscription" from a failed
   * lookup — swallowing both as null made subscribed users look unsubscribed during
   * transient errors.
   */
  async getUserSubscription(appId?: string): Promise<UserTierSubscriptionModel | null> {
    if (!appId) return null;
    try {
      const { data } = await this.http.get<UserTierSubscriptionModel>(`api/app-tiers/${appId}/my-subscription`);
      return data ?? null;
    } catch (err) {
      if (err instanceof WildwoodError && err.code === 'NotFound') return null; // 404 = no subscription
      throw err;
    }
  }

  async getUserAddOns(appId: string): Promise<UserAddOnSubscriptionModel[]> {
    try {
      const { data } = await this.http.get<UserAddOnSubscriptionModel[]>(`api/app-tier-addons/${appId}/my-addons`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Tier Subscription Actions
  // ---------------------------------------------------------------------------

  /**
   * Self-service tier change for the authenticated user.
   * Uses POST /{appId}/my-subscription/change (SelfChangeTierDto).
   * Pass paymentTransactionId when upgrading from a free tier to a paid tier.
   */
  async changeTier(
    appId: string,
    newTierId: string,
    newPricingId?: string,
    immediate?: boolean,
    paymentTransactionId?: string,
  ): Promise<AppTierChangeResultModel>;
  /**
   * Options form, for a caller that can finish a payment. With `supportsPaymentAction: true` a
   * change whose proration needs 3-D Secure comes back `requiresAction` with a `clientSecret` and
   * a `pendingChangeId` to confirm and then {@link AppTierService.completeTierChange}, instead of
   * being refused outright.
   */
  async changeTier(appId: string, options: SelfChangeTierOptions): Promise<AppTierChangeResultModel>;
  async changeTier(
    appId: string,
    tierOrOptions: string | SelfChangeTierOptions,
    newPricingId?: string,
    immediate = true,
    paymentTransactionId?: string,
  ): Promise<AppTierChangeResultModel> {
    const url = `api/app-tiers/${appId}/my-subscription/change`;

    // The positional form posts exactly what it always did: an older server rejects an unknown
    // property, and a caller that never opted into finishing a payment must not appear to have.
    if (typeof tierOrOptions === 'string') {
      const { data } = await this.http.post<AppTierChangeResultModel>(url, {
        NewAppTierId: tierOrOptions,
        NewAppTierPricingId: newPricingId,
        Immediate: immediate,
        PaymentTransactionId: paymentTransactionId,
      });
      return data;
    }

    const { data } = await this.http.post<AppTierChangeResultModel>(url, {
      NewAppTierId: tierOrOptions.newTierId,
      NewAppTierPricingId: tierOrOptions.newPricingId,
      Immediate: tierOrOptions.immediate ?? true,
      PaymentTransactionId: tierOrOptions.paymentTransactionId,
      SupportsPaymentAction: tierOrOptions.supportsPaymentAction ?? false,
    });
    return data;
  }

  /**
   * Finish a plan change that came back `requiresAction`, once the prorated payment has been
   * confirmed in the browser/app. Safe to call repeatedly: the server asks the processor whether
   * the invoice really paid before it moves anything, and answers `processing` while it waits.
   */
  async completeTierChange(appId: string, pendingChangeId: string): Promise<AppTierChangeResultModel> {
    try {
      const { data } = await this.http.post<AppTierChangeResultModel>(
        `api/app-tiers/${appId}/my-subscription/change/${encodeURIComponent(pendingChangeId)}/complete`,
      );
      return data;
    } catch (err) {
      const error = toAppTierActionError(err, 'Failed to complete the plan change');
      return {
        success: false,
        errorMessage: error.message,
        errorCode: error.code,
        isScheduled: false,
      };
    }
  }

  /**
   * Whether this account may still start a free trial in the app — on a tier, and per add-on.
   *
   * Never throws: a failure answers "eligible", which is what a signup screen already shows from
   * the catalog's trial days, and an empty `addOns` map means "unknown" for the same reason. The
   * checkout quote and the payment initiation re-decide authoritatively before any money moves,
   * so the worst a failed lookup does is advertise a trial the checkout then prices in full.
   */
  async trialEligibility(appId: string): Promise<TrialEligibilityModel> {
    try {
      const { data } = await this.http.get<TrialEligibilityModel>(`api/app-tiers/${appId}/trial-eligibility`);
      return {
        tierTrialEligible: data?.tierTrialEligible ?? true,
        addOns: data?.addOns ?? {},
      };
    } catch {
      return { tierTrialEligible: true, addOns: {} };
    }
  }

  /**
   * Admin tier change (requires Admin/CompanyAdmin role).
   * Uses POST /change-tier (ChangeAppTierDto).
   */
  async changeTierAdvanced(
    appId: string,
    userId: string,
    newTierId: string,
    newPricingId?: string,
    immediate = false,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>('api/app-tiers/change-tier', {
      AppId: appId,
      UserId: userId,
      NewAppTierId: newTierId,
      NewAppTierPricingId: newPricingId,
      Immediate: immediate,
    });
    return data;
  }

  /**
   * Shared POST for the three cancel endpoints: on 2xx the cancellation succeeded (the server
   * payload carries isScheduled/effectiveDate/requiresUserAction); failures are reported via
   * success/errorMessage instead of being silently swallowed.
   */
  private async postCancel(url: string): Promise<AppTierCancelResultModel> {
    try {
      const { data } = await this.http.post<AppTierCancelResultModel>(url);
      return { ...data, success: true };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Failed to cancel subscription',
      };
    }
  }

  /**
   * Self-service cancellation. Returns whether the cancellation is scheduled for the end of
   * the billing period (isScheduled + effectiveDate) or took effect immediately.
   */
  async cancelSubscription(appId: string): Promise<AppTierCancelResultModel> {
    return this.postCancel(`api/app-tiers/${appId}/my-subscription/cancel`);
  }

  /**
   * Self-service subscribe to a tier. For use by regular authenticated users
   * (not admins) during signup or plan selection flows.
   */
  async selfSubscribe(
    appId: string,
    appTierId: string,
    appTierPricingId?: string,
    paymentTransactionId?: string,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/${appId}/my-subscription`, {
      AppTierId: appTierId,
      AppTierPricingId: appTierPricingId,
      PaymentTransactionId: paymentTransactionId,
    });
    return data;
  }

  async previewTierChange(appId: string, newTierId: string, newPricingId?: string): Promise<TierChangePreviewModel> {
    const { data } = await this.http.post<TierChangePreviewModel>(
      `api/app-tiers/${appId}/my-subscription/preview-change`,
      {
        NewAppTierId: newTierId,
        NewAppTierPricingId: newPricingId,
      },
    );
    return data;
  }

  async previewTierChangeAdmin(
    appId: string,
    userId: string,
    newTierId: string,
    newPricingId?: string,
  ): Promise<TierChangePreviewModel> {
    const { data } = await this.http.post<TierChangePreviewModel>(
      `api/app-tiers/${appId}/admin/preview-change/${userId}`,
      {
        NewAppTierId: newTierId,
        NewAppTierPricingId: newPricingId,
      },
    );
    return data;
  }

  // ---------------------------------------------------------------------------
  // Add-On Subscription Actions
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Use {@link AppTierService.subscribeToAddOnDetailed}, which reports WHY a
   * subscription was refused (and returns the created subscription) instead of a bare false.
   */
  async subscribeToAddOn(
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ): Promise<boolean> {
    const result = await this.subscribeToAddOnDetailed(appId, addOnId, pricingId, paymentTransactionId);
    return result.success;
  }

  /**
   * Subscribe to a single pack. Returns the created subscription, or a structured refusal — a
   * pack already owned, one bundled in the tier, and a payment the server would not accept are
   * all different problems a UI has to word differently.
   */
  async subscribeToAddOnDetailed(
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ): Promise<AddOnSubscribeResultModel> {
    try {
      const { data } = await this.http.post<UserAddOnSubscriptionModel>(`api/app-tier-addons/${appId}/subscribe`, {
        AppId: appId,
        AppTierAddOnId: addOnId,
        AppTierAddOnPricingId: pricingId,
        PaymentTransactionId: paymentTransactionId,
      });
      return { success: true, subscription: data ?? undefined };
    } catch (err) {
      return { success: false, error: toAppTierActionError(err, 'Failed to subscribe to the pack') };
    }
  }

  /**
   * @deprecated Use {@link AppTierService.cancelAddOnDetailed}, which says whether access
   * continues to the end of the period and why a cancellation was refused.
   */
  async cancelAddOnSubscription(subscriptionId: string): Promise<boolean> {
    const result = await this.cancelAddOnDetailed(subscriptionId);
    return result.success;
  }

  /**
   * Cancel one of the calling user's own packs. By default access continues to the end of the
   * period already paid for (`isScheduled`); `immediate` ends it now.
   */
  async cancelAddOnDetailed(subscriptionId: string, immediate = false): Promise<AddOnSubscriptionCancelResultModel> {
    try {
      const { data } = await this.http.post<AddOnSubscriptionCancelResultModel>(
        `api/app-tier-addons/subscriptions/${subscriptionId}/cancel?immediate=${immediate}`,
      );
      return {
        isScheduled: data?.isScheduled,
        status: data?.status,
        effectiveDate: data?.effectiveDate,
        success: true,
      };
    } catch (err) {
      return failedResult(err, 'Failed to cancel the pack', { success: false });
    }
  }

  /**
   * Take back a scheduled cancellation: the provider stops cancelling at period end and the pack
   * goes back to Active (or Trialing while its trial runs).
   */
  async reactivateAddOn(subscriptionId: string): Promise<AddOnSubscriptionReactivateResultModel> {
    try {
      const { data } = await this.http.post<UserAddOnSubscriptionModel>(
        `api/app-tier-addons/subscriptions/${subscriptionId}/reactivate`,
      );
      return { success: true, status: data?.status, subscription: data ?? undefined };
    } catch (err) {
      return failedResult(err, 'Failed to reactivate the pack', { success: false });
    }
  }

  // ---------------------------------------------------------------------------
  // Pack Checkout (card once, any number of packs)
  // ---------------------------------------------------------------------------

  /**
   * Price a basket of packs. Server-authoritative: the price, billing frequency, trial length and
   * trial eligibility of every line come from the catalog and the account, not from this request.
   *
   * The returned `checkoutId` is echoed back on {@link AppTierService.checkoutAddOns} and is what
   * makes the purchase idempotent.
   */
  async quoteAddOnCheckout(appId: string, items: AddOnCheckoutItemInput[]): Promise<AddOnCheckoutQuoteModel> {
    try {
      const { data } = await this.http.post<AddOnCheckoutQuoteModel>(`api/app-tier-addons/${appId}/checkout/quote`, {
        Items: toCheckoutItems(items),
      });
      return data;
    } catch (err) {
      return failedResult(err, 'Failed to price the packs', {
        success: false,
        checkoutId: '',
        // Deliberately blank: a refused quote priced nothing, and naming a currency here would be
        // inventing one for prices that do not exist.
        currency: '',
        lines: [],
        totalDueToday: 0,
        requiresPaymentMethod: false,
      });
    }
  }

  /**
   * Start the one-off card entry for an account with no card on file. Confirm the returned
   * `clientSecret`, then pass `paymentTransactionId` to {@link AppTierService.checkoutAddOns}.
   */
  async createCheckoutPaymentMethod(appId: string, providerId: string): Promise<AddOnCheckoutPaymentMethodModel> {
    try {
      const { data } = await this.http.post<AddOnCheckoutPaymentMethodModel>(
        `api/app-tier-addons/${appId}/checkout/payment-method`,
        { ProviderId: providerId },
      );
      return data;
    } catch (err) {
      return failedResult(err, 'Failed to start card collection', { success: false });
    }
  }

  /**
   * Buy the basket: one subscription per pack, charged to one card. One pack failing does not
   * stop the others, so read `results` per pack rather than `success` alone — a `requires_action`
   * line still has to be authenticated and then {@link AppTierService.completeAddOnCheckout}d.
   */
  async checkoutAddOns(appId: string, request: AddOnCheckoutRequestModel): Promise<AddOnCheckoutResultModel> {
    try {
      const { data } = await this.http.post<AddOnCheckoutResultModel>(`api/app-tier-addons/${appId}/checkout`, {
        CheckoutId: request.checkoutId,
        ProviderId: request.providerId,
        PaymentTransactionId: request.paymentTransactionId,
        UseSavedCard: request.useSavedCard ?? false,
        Items: toCheckoutItems(request.items),
      });
      return data;
    } catch (err) {
      return failedResult(err, 'Failed to buy the packs', {
        success: false,
        checkoutId: request.checkoutId,
        results: [],
      });
    }
  }

  /**
   * Finish one pack whose card the customer has just authenticated: the payment is verified with
   * the provider and, once it really paid, the pack's subscription is created.
   */
  async completeAddOnCheckout(appId: string, paymentTransactionId: string): Promise<AddOnCheckoutItemResultModel> {
    try {
      const { data } = await this.http.post<AddOnCheckoutItemResultModel>(
        `api/app-tier-addons/${appId}/checkout/complete`,
        { PaymentTransactionId: paymentTransactionId },
      );
      return data;
    } catch (err) {
      const error = toAppTierActionError(err, 'Failed to complete the pack purchase');
      const body = errorBody(err);
      // A refusal here IS the per-item result DTO (the controller returns it with the 400/404),
      // so keep the pack it was about rather than answering about nothing.
      const fromServer =
        body && typeof body.status === 'string' ? (body as unknown as AddOnCheckoutItemResultModel) : null;
      return {
        addOnId: '',
        pricingId: '',
        ...(fromServer ?? {}),
        status: 'failed',
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Usage Tracking
  // ---------------------------------------------------------------------------

  /**
   * Get all limit statuses for the authenticated user.
   * Returns current usage, max values, and whether limits are exceeded.
   */
  async getAllLimitStatuses(appId: string): Promise<AppTierLimitStatusModel[]> {
    const { data } = await this.http.get<AppTierLimitStatusModel[]>(`api/app-tiers/${appId}/limit-statuses`);
    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Feature Gating
  // ---------------------------------------------------------------------------

  /**
   * The user's feature entitlement map. THROWS on transport/HTTP failure: an empty map is a
   * real "no access" answer, so failures must stay distinguishable from it — swallowing them
   * made feature gates lock entitled users out during transient errors.
   */
  async getUserFeatures(appId: string): Promise<Record<string, boolean>> {
    const { data } = await this.http.get<Record<string, boolean>>(`api/app-tiers/${appId}/user-features`);
    return data ?? {};
  }

  async checkFeature(featureKey: string, appId: string): Promise<AppFeatureCheckResultModel> {
    const { data } = await this.http.get<AppFeatureCheckResultModel>(
      `api/app-tiers/${appId}/check-feature/${encodeURIComponent(featureKey)}`,
    );
    return data;
  }

  async getLimitStatus(limitKey: string, appId: string): Promise<AppTierLimitStatusModel> {
    const { data } = await this.http.get<AppTierLimitStatusModel>(
      `api/app-tiers/${appId}/check-limit/${encodeURIComponent(limitKey)}`,
    );
    return data;
  }

  async incrementUsage(appId: string, limitCode: string): Promise<AppTierLimitStatusModel | null> {
    try {
      const { data } = await this.http.post<AppTierLimitStatusModel>(
        `api/app-tiers/${appId}/increment-usage/${encodeURIComponent(limitCode)}`,
      );
      return data ?? null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Feature Definitions
  // ---------------------------------------------------------------------------

  async getFeatureDefinitions(appId: string): Promise<AppFeatureDefinitionModel[]> {
    try {
      const { data } = await this.http.get<AppFeatureDefinitionModel[]>(
        `api/app-feature-definitions/${appId}?activeOnly=true`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Get active feature definitions for the current user (no admin role required).
   * Use this for self-service contexts; `getFeatureDefinitions` hits an admin-only endpoint.
   */
  async getActiveFeatureDefinitions(appId: string): Promise<AppFeatureDefinitionModel[]> {
    try {
      const { data } = await this.http.get<AppFeatureDefinitionModel[]>(`api/app-feature-definitions/${appId}/active`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Company-Scoped Subscription (Admin)
  // ---------------------------------------------------------------------------

  async getCompanySubscription(appId: string, companyId: string): Promise<UserTierSubscriptionModel | null> {
    try {
      const { data } = await this.http.get<UserTierSubscriptionModel>(
        `api/app-tiers/${appId}/subscription/company/${companyId}`,
      );
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getCompanyAddOnSubscriptions(appId: string, companyId: string): Promise<UserAddOnSubscriptionModel[]> {
    try {
      const { data } = await this.http.get<UserAddOnSubscriptionModel[]>(
        `api/app-tier-addons/${appId}/company/${companyId}/addon-subscriptions`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getCompanyLimitStatuses(appId: string, companyId: string): Promise<AppTierLimitStatusModel[]> {
    try {
      const { data } = await this.http.get<AppTierLimitStatusModel[]>(
        `api/app-tiers/${appId}/limits/company/${companyId}`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getCompanyFeatures(appId: string, companyId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.http.get<Record<string, boolean>>(
        `api/app-tiers/${appId}/admin/company-features/${companyId}`,
      );
      return data ?? {};
    } catch {
      return {};
    }
  }

  // ---------------------------------------------------------------------------
  // Company-Scoped Admin Actions
  // ---------------------------------------------------------------------------

  async subscribeCompanyToTier(
    appId: string,
    companyId: string,
    tierId: string,
    pricingId?: string,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/${appId}/subscribe/company`, {
      CompanyId: companyId,
      AppTierId: tierId,
      AppTierPricingId: pricingId,
    });
    return data;
  }

  async changeCompanyTier(
    appId: string,
    companyId: string,
    newTierId: string,
    pricingId?: string,
    immediate = false,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/${appId}/change-tier/company`, {
      CompanyId: companyId,
      NewAppTierId: newTierId,
      NewAppTierPricingId: pricingId,
      Immediate: immediate,
    });
    return data;
  }

  async cancelCompanySubscription(appId: string, companyId: string): Promise<AppTierCancelResultModel> {
    return this.postCancel(`api/app-tiers/${appId}/cancel/company/${companyId}`);
  }

  async subscribeCompanyToAddOn(appId: string, companyId: string, addOnId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/${appId}/subscribe/company`, {
        CompanyId: companyId,
        AppTierAddOnId: addOnId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async cancelCompanyAddOn(subscriptionId: string, immediate = false): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/subscriptions/${subscriptionId}/cancel?immediate=${immediate}`);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // User-Scoped Admin Queries
  // ---------------------------------------------------------------------------

  async getUserSubscriptionAdmin(appId: string, userId: string): Promise<UserTierSubscriptionModel | null> {
    try {
      const { data } = await this.http.get<UserTierSubscriptionModel>(`api/app-tiers/${appId}/subscriptions/${userId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getUserFeaturesAdmin(appId: string, userId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.http.get<Record<string, boolean>>(
        `api/app-tiers/${appId}/admin/user-features/${userId}`,
      );
      return data ?? {};
    } catch {
      return {};
    }
  }

  async getUserLimitStatuses(appId: string, userId: string): Promise<AppTierLimitStatusModel[]> {
    try {
      const { data } = await this.http.get<AppTierLimitStatusModel[]>(
        `api/app-tiers/${appId}/admin/user-limits/${userId}`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getUserAddOnsAdmin(appId: string, userId: string): Promise<UserAddOnSubscriptionModel[]> {
    try {
      const { data } = await this.http.get<UserAddOnSubscriptionModel[]>(
        `api/app-tier-addons/${appId}/admin/user-addons/${userId}`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // User-Scoped Admin Actions
  // ---------------------------------------------------------------------------

  async subscribeUserToTier(
    appId: string,
    userId: string,
    tierId: string,
    pricingId?: string,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/subscribe`, {
      AppId: appId,
      UserId: userId,
      AppTierId: tierId,
      AppTierPricingId: pricingId,
    });
    return data;
  }

  async changeUserTier(
    appId: string,
    userId: string,
    newTierId: string,
    pricingId?: string,
    immediate = false,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/change-tier`, {
      AppId: appId,
      UserId: userId,
      NewAppTierId: newTierId,
      NewAppTierPricingId: pricingId,
      Immediate: immediate,
    });
    return data;
  }

  async cancelUserSubscription(appId: string, userId: string): Promise<AppTierCancelResultModel> {
    return this.postCancel(`api/app-tiers/${appId}/cancel/${userId}`);
  }

  async subscribeUserToAddOn(appId: string, userId: string, addOnId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/${appId}/admin/subscribe-user/${userId}`, {
        AppTierAddOnId: addOnId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async cancelUserAddOn(appId: string, subscriptionId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/${appId}/admin/cancel-user-addon/${subscriptionId}`);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Feature Overrides (Admin)
  // ---------------------------------------------------------------------------

  async getFeatureOverrides(appId: string, userId?: string): Promise<AppFeatureOverrideModel[]> {
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const { data } = await this.http.get<AppFeatureOverrideModel[]>(
        `api/app-tiers/${appId}/admin/feature-overrides${query}`,
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  async setFeatureOverride(
    appId: string,
    userId: string | null,
    featureCode: string,
    isEnabled: boolean,
    reason?: string,
    expiresAt?: string,
  ): Promise<boolean> {
    try {
      await this.http.post(`api/app-tiers/${appId}/admin/feature-overrides`, {
        UserId: userId,
        FeatureCode: featureCode,
        IsEnabled: isEnabled,
        Reason: reason,
        ExpiresAt: expiresAt,
      });
      return true;
    } catch {
      return false;
    }
  }

  async removeFeatureOverride(appId: string, featureCode: string, userId?: string): Promise<boolean> {
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      await this.http.delete(
        `api/app-tiers/${appId}/admin/feature-overrides/${encodeURIComponent(featureCode)}${query}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Usage Limit Overrides
  // ---------------------------------------------------------------------------

  async updateUsageLimit(appId: string, limitCode: string, newMaxValue: number): Promise<boolean> {
    try {
      await this.http.put(`api/app-tiers/${appId}/admin/usage-limits/${encodeURIComponent(limitCode)}`, {
        NewMaxValue: newMaxValue,
      });
      return true;
    } catch {
      return false;
    }
  }

  async resetUsage(appId: string, limitCode: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tiers/${appId}/admin/usage-limits/${encodeURIComponent(limitCode)}/reset`);
      return true;
    } catch {
      return false;
    }
  }

  async updateUserUsageLimit(appId: string, userId: string, limitCode: string, newMaxValue: number): Promise<boolean> {
    try {
      await this.http.put(`api/app-tiers/${appId}/admin/usage-limits/user/${userId}/${encodeURIComponent(limitCode)}`, {
        NewMaxValue: newMaxValue,
      });
      return true;
    } catch {
      return false;
    }
  }

  async resetUserUsage(appId: string, userId: string, limitCode: string): Promise<boolean> {
    try {
      await this.http.post(
        `api/app-tiers/${appId}/admin/usage-limits/user/${userId}/${encodeURIComponent(limitCode)}/reset`,
      );
      return true;
    } catch {
      return false;
    }
  }

  async updateCompanyUsageLimit(
    appId: string,
    companyId: string,
    limitCode: string,
    newMaxValue: number,
  ): Promise<boolean> {
    try {
      await this.http.put(
        `api/app-tiers/${appId}/admin/usage-limits/company/${companyId}/${encodeURIComponent(limitCode)}`,
        { NewMaxValue: newMaxValue },
      );
      return true;
    } catch {
      return false;
    }
  }

  async resetCompanyUsage(appId: string, companyId: string, limitCode: string): Promise<boolean> {
    try {
      await this.http.post(
        `api/app-tiers/${appId}/admin/usage-limits/company/${companyId}/${encodeURIComponent(limitCode)}/reset`,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async getTrackingMode(appId: string): Promise<string> {
    try {
      const { data } = await this.http.get<{ trackingMode: string }>(`api/app-tiers/${appId}/settings/tracking-mode`);
      return data?.trackingMode ?? 'User';
    } catch {
      return 'User';
    }
  }
}
