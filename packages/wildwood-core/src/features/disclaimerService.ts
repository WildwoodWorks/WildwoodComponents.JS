// Disclaimer service - ported from WildwoodComponents.Blazor disclaimer patterns

import type { HttpClient } from '../client/httpClient.js';
import type { PendingDisclaimersResponse, DisclaimerAcceptanceResult, DisclaimerAcceptanceResponse } from './types.js';

export class DisclaimerService {
  constructor(private http: HttpClient) {}

  async getPendingDisclaimers(appId: string): Promise<PendingDisclaimersResponse> {
    const { data } = await this.http.get<PendingDisclaimersResponse>(`api/disclaimeracceptance/pending/${appId}`);
    return data;
  }

  async acceptDisclaimer(disclaimerId: string, versionId: string): Promise<DisclaimerAcceptanceResult> {
    const { data } = await this.http.post<DisclaimerAcceptanceResult>('api/disclaimeracceptance/accept', {
      disclaimerId,
      versionId,
    });
    return data;
  }

  async acceptAllDisclaimers(
    acceptances: Array<{ disclaimerId: string; versionId: string }>,
  ): Promise<DisclaimerAcceptanceResponse> {
    const { data } = await this.http.post<DisclaimerAcceptanceResponse>('api/disclaimeracceptance/accept-bulk', {
      acceptances,
    });
    return data;
  }
}
