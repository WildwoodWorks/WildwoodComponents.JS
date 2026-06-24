import { describe, it, expect, vi } from 'vitest';
import { DisclaimerService } from '../features/disclaimerService.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post', ReturnType<typeof vi.fn>>;
}

describe('DisclaimerService', () => {
  it('getPendingDisclaimers falls back to the default appId', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ disclaimers: [] }));
    const svc = new DisclaimerService(http, 'default-app');

    await svc.getPendingDisclaimers();

    expect(http.get).toHaveBeenCalledWith('api/disclaimeracceptance/pending/default-app');
  });

  it('getPendingDisclaimers prefers an explicit appId over the default', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ disclaimers: [] }));
    const svc = new DisclaimerService(http, 'default-app');

    await svc.getPendingDisclaimers('other-app');

    expect(http.get).toHaveBeenCalledWith('api/disclaimeracceptance/pending/other-app');
  });

  it('acceptDisclaimer posts the single-acceptance payload with the resolved appId', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new DisclaimerService(http, 'default-app');

    await svc.acceptDisclaimer('disc-1', 'ver-1');

    expect(http.post).toHaveBeenCalledWith('api/disclaimeracceptance/accept', {
      companyDisclaimerId: 'disc-1',
      companyDisclaimerVersionId: 'ver-1',
      appId: 'default-app',
    });
  });

  it('acceptAllDisclaimers posts a bulk payload, mapping ids to the API shape', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new DisclaimerService(http, 'default-app');

    await svc.acceptAllDisclaimers(
      [
        { disclaimerId: 'd1', versionId: 'v1' },
        { disclaimerId: 'd2', versionId: 'v2' },
      ],
      'app-x',
    );

    expect(http.post).toHaveBeenCalledWith('api/disclaimeracceptance/accept-bulk', {
      appId: 'app-x',
      acceptances: [
        { companyDisclaimerId: 'd1', companyDisclaimerVersionId: 'v1' },
        { companyDisclaimerId: 'd2', companyDisclaimerVersionId: 'v2' },
      ],
    });
  });
});
