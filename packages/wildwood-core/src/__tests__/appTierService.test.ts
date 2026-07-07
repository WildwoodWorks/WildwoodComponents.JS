import { describe, it, expect, vi } from 'vitest';
import { AppTierService } from '../features/appTierService.js';
import { WildwoodError } from '../client/errors.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
    put: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post' | 'put' | 'delete', ReturnType<typeof vi.fn>>;
}

describe('AppTierService', () => {
  it('getTiers hits the public endpoint and skips auth', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok([{ id: 't1' }, { id: 't2' }]));
    const svc = new AppTierService(http);

    const tiers = await svc.getTiers('app-1');

    expect(http.get).toHaveBeenCalledWith('api/app-tiers/app-1/public', { skipAuth: true });
    expect(tiers).toHaveLength(2);
  });

  it('getTier returns null when the lookup throws', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('404'));
    const svc = new AppTierService(http);

    expect(await svc.getTier('nope')).toBeNull();
  });

  it('changeTier posts the PascalCase change payload', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new AppTierService(http);

    await svc.changeTier('app-1', 'tier-2', 'pricing-7', true, 'txn-9');

    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/change', {
      NewAppTierId: 'tier-2',
      NewAppTierPricingId: 'pricing-7',
      Immediate: true,
      PaymentTransactionId: 'txn-9',
    });
  });

  it('cancelSubscription surfaces the scheduled-cancel payload and reports failures', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, isScheduled: true, effectiveDate: '2026-08-01T00:00:00Z' }));
    const svc = new AppTierService(http);

    const result = await svc.cancelSubscription('app-1');
    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/cancel');
    expect(result.success).toBe(true);
    expect(result.isScheduled).toBe(true);
    expect(result.effectiveDate).toBe('2026-08-01T00:00:00Z');

    http.post.mockRejectedValueOnce(new Error('boom'));
    const failed = await svc.cancelSubscription('app-1');
    expect(failed.success).toBe(false);
    expect(failed.errorMessage).toBe('boom');
  });

  it('getUserSubscription returns null for 204/404 but THROWS on other lookup failures', async () => {
    const http = makeHttp();
    const svc = new AppTierService(http);

    // 204 No Content → data undefined → null ("no subscription")
    expect(await svc.getUserSubscription('app-1')).toBeNull();

    // 404 also means "no subscription": the backend 404s for users who never subscribed
    // (pre-July-2026 .NET behavior), so it must not surface as a dashboard error.
    http.get.mockRejectedValueOnce(new WildwoodError('Not Found', 404));
    expect(await svc.getUserSubscription('app-1')).toBeNull();

    // Any other failed lookup must stay distinguishable from "no subscription" — subscribed
    // users were shown "no plan" banners on transient errors when both resolved to null.
    http.get.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.getUserSubscription('app-1')).rejects.toThrow('boom');
    http.get.mockRejectedValueOnce(new WildwoodError('Server Error', 500));
    await expect(svc.getUserSubscription('app-1')).rejects.toThrow('Server Error');
  });

  it('getUserFeatures returns the feature map from the API and THROWS on failure', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ chat: true, payments: false }));
    const svc = new AppTierService(http);

    const features = await svc.getUserFeatures('app-1');

    expect(http.get).toHaveBeenCalledWith('api/app-tiers/app-1/user-features');
    expect(features).toEqual({ chat: true, payments: false });

    // Failures must not masquerade as an empty (= no access) map — feature gates would lock
    // entitled users out during transient errors.
    http.get.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.getUserFeatures('app-1')).rejects.toThrow('boom');
  });
});
