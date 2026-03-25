// App tier service - ported from WildwoodComponents.Blazor/Services/AppTierComponentService.cs

import type { HttpClient } from '../client/httpClient.js';
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
} from './types.js';

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

  async getUserSubscription(appId?: string): Promise<UserTierSubscriptionModel | null> {
    if (!appId) return null;
    try {
      const { data } = await this.http.get<UserTierSubscriptionModel>(`api/app-tiers/${appId}/my-subscription`);
      return data ?? null;
    } catch {
      return null;
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
   * Subscribe to a tier (admin endpoint).
   */
  async subscribeTo(
    appId: string,
    tierId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/${appId}/subscribe`, {
      AppId: appId,
      AppTierId: tierId,
      AppTierPricingId: pricingId,
      PaymentTransactionId: paymentTransactionId,
    });
    return data;
  }

  /**
   * Self-service tier change for the authenticated user.
   * Uses POST /{appId}/my-subscription/change (SelfChangeTierDto).
   */
  async changeTier(
    appId: string,
    newTierId: string,
    newPricingId?: string,
    immediate = true,
  ): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>(`api/app-tiers/${appId}/my-subscription/change`, {
      NewAppTierId: newTierId,
      NewAppTierPricingId: newPricingId,
      Immediate: immediate,
    });
    return data;
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

  async cancelSubscription(appId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tiers/${appId}/my-subscription/cancel`);
      return true;
    } catch {
      return false;
    }
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
      appTierId,
      appTierPricingId,
      paymentTransactionId,
    });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Add-On Subscription Actions
  // ---------------------------------------------------------------------------

  async subscribeToAddOn(
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/${appId}/subscribe`, {
        AppId: appId,
        AppTierAddOnId: addOnId,
        AppTierAddOnPricingId: pricingId,
        PaymentTransactionId: paymentTransactionId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async cancelAddOnSubscription(subscriptionId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tier-addons/subscriptions/${subscriptionId}/cancel`);
      return true;
    } catch {
      return false;
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

  async getUserFeatures(appId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.http.get<Record<string, boolean>>(`api/app-tiers/${appId}/user-features`);
      return data ?? {};
    } catch {
      return {};
    }
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

  async getCompanyFeatures(_appId: string, companyId: string): Promise<Record<string, boolean>> {
    try {
      const { data } = await this.http.get<Record<string, boolean>>(`api/companies/${companyId}/features`);
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

  async cancelCompanySubscription(appId: string, companyId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tiers/${appId}/cancel/company/${companyId}`);
      return true;
    } catch {
      return false;
    }
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

  async cancelUserSubscription(appId: string, userId: string): Promise<boolean> {
    try {
      await this.http.post(`api/app-tiers/${appId}/cancel/${userId}`);
      return true;
    } catch {
      return false;
    }
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
