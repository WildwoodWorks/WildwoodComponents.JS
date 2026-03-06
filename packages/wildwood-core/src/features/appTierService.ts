// App tier service - ported from WildwoodComponents.Blazor app tier patterns

import type { HttpClient } from '../client/httpClient.js';
import type {
  AppTierModel,
  UserTierSubscriptionModel,
  AppFeatureCheckResultModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
} from './types.js';

export class AppTierService {
  constructor(private http: HttpClient) {}

  async getTiers(appId: string): Promise<AppTierModel[]> {
    const { data } = await this.http.get<AppTierModel[]>(`api/apptiers/${appId}/tiers`);
    return data ?? [];
  }

  async getTier(tierId: string): Promise<AppTierModel | null> {
    try {
      const { data } = await this.http.get<AppTierModel>(`api/apptiers/tiers/${tierId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getUserSubscription(): Promise<UserTierSubscriptionModel | null> {
    try {
      const { data } = await this.http.get<UserTierSubscriptionModel>('api/apptiers/my-subscription');
      return data ?? null;
    } catch {
      return null;
    }
  }

  async checkFeature(featureKey: string): Promise<AppFeatureCheckResultModel> {
    const { data } = await this.http.get<AppFeatureCheckResultModel>(
      `api/apptiers/features/${encodeURIComponent(featureKey)}/check`,
    );
    return data;
  }

  async getLimitStatus(limitKey: string): Promise<AppTierLimitStatusModel> {
    const { data } = await this.http.get<AppTierLimitStatusModel>(
      `api/apptiers/limits/${encodeURIComponent(limitKey)}/status`,
    );
    return data;
  }

  async changeTier(tierId: string, pricingModelId?: string): Promise<AppTierChangeResultModel> {
    const { data } = await this.http.post<AppTierChangeResultModel>('api/apptiers/change', {
      tierId,
      pricingModelId,
    });
    return data;
  }
}
