import { describe, it, expect, vi } from 'vitest';
import { AppTierService } from '../features/appTierService.js';
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

  it('cancelSubscription returns true on success and false on error', async () => {
    const http = makeHttp();
    const svc = new AppTierService(http);

    expect(await svc.cancelSubscription('app-1')).toBe(true);
    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/cancel');

    http.post.mockRejectedValueOnce(new Error('boom'));
    expect(await svc.cancelSubscription('app-1')).toBe(false);
  });

  it('getUserSubscription returns null when none exists', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('no sub'));
    const svc = new AppTierService(http);

    expect(await svc.getUserSubscription('app-1')).toBeNull();
  });

  it('getUserFeatures returns the feature map from the API', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ chat: true, payments: false }));
    const svc = new AppTierService(http);

    const features = await svc.getUserFeatures('app-1');

    expect(http.get).toHaveBeenCalledWith('api/app-tiers/app-1/user-features');
    expect(features).toEqual({ chat: true, payments: false });
  });
});
