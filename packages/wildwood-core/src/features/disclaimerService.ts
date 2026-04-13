// Disclaimer service - ported from WildwoodComponents.Blazor disclaimer patterns

import type { HttpClient } from '../client/httpClient.js';
import type { PendingDisclaimersResponse, DisclaimerAcceptanceResult, DisclaimerAcceptanceResponse } from './types.js';

export class DisclaimerService {
  constructor(
    private http: HttpClient,
    private defaultAppId: string,
  ) {}

  async getPendingDisclaimers(appId?: string): Promise<PendingDisclaimersResponse> {
    const targetAppId = appId ?? this.defaultAppId;
    const { data } = await this.http.get<PendingDisclaimersResponse>(`api/disclaimeracceptance/pending/${targetAppId}`);
    return data;
  }

  async acceptDisclaimer(disclaimerId: string, versionId: string, appId?: string): Promise<DisclaimerAcceptanceResult> {
    const { data } = await this.http.post<DisclaimerAcceptanceResult>('api/disclaimeracceptance/accept', {
      companyDisclaimerId: disclaimerId,
      companyDisclaimerVersionId: versionId,
      appId: appId ?? this.defaultAppId,
    });
    return data;
  }

  async acceptAllDisclaimers(
    acceptances: Array<{ disclaimerId: string; versionId: string }>,
    appId?: string,
  ): Promise<DisclaimerAcceptanceResponse> {
    const { data } = await this.http.post<DisclaimerAcceptanceResponse>('api/disclaimeracceptance/accept-bulk', {
      appId: appId ?? this.defaultAppId,
      acceptances: acceptances.map((a) => ({
        companyDisclaimerId: a.disclaimerId,
        companyDisclaimerVersionId: a.versionId,
      })),
    });
    return data;
  }
}
