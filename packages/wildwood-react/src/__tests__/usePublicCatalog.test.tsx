/**
 * The shared public catalog: one fetch for N mounted instances, a 60 s TTL, failures never cached,
 * and an SSR snapshot that renders on the first paint instead of a spinner.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { buildPublicCatalog, type AppTierAddOnModel, type AppTierModel } from '@wildwood/core';
import { usePublicCatalog, invalidatePublicCatalog, clearPublicCatalogCache } from '@wildwood/react-shared';
import { createTestClient, createWrapper } from './testUtils.js';

const tier = {
  id: 'tier-pro',
  name: 'Pro',
  status: 'Active',
  displayOrder: 1,
  currency: 'USD',
  pricingOptions: [],
} as unknown as AppTierModel;

const pack = {
  id: 'pack-a',
  name: 'Pack A',
  status: 'Active',
  displayOrder: 1,
  pricingOptions: [],
} as unknown as AppTierAddOnModel;

function stubbedClient() {
  const client = createTestClient();
  const tiers = vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue([tier]);
  const addOns = vi.spyOn(client.appTier, 'getPublicAddOns').mockResolvedValue([pack]);
  return { client, tiers, addOns, wrapper: createWrapper(client) };
}

beforeEach(() => {
  clearPublicCatalogCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPublicCatalogCache();
});

describe('usePublicCatalog', () => {
  it('serves two mounted instances from one pair of requests', async () => {
    const { tiers, addOns, wrapper } = stubbedClient();

    const first = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    const second = renderHook(() => usePublicCatalog('app-1'), { wrapper });

    await waitFor(() => expect(first.result.current.catalog).not.toBeNull());
    await waitFor(() => expect(second.result.current.catalog).not.toBeNull());

    expect(tiers).toHaveBeenCalledTimes(1);
    expect(addOns).toHaveBeenCalledTimes(1);
    expect(first.result.current.catalog?.tiers).toHaveLength(1);
    expect(first.result.current.catalog?.currency).toBe('USD');
  });

  it('refetches once the cache entry is older than the TTL', async () => {
    const { tiers, wrapper } = stubbedClient();

    const first = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    await waitFor(() => expect(first.result.current.catalog).not.toBeNull());
    expect(tiers).toHaveBeenCalledTimes(1);

    // Jump past the 60 s TTL for exactly as long as the next mount's cache check takes.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    const second = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    nowSpy.mockRestore();

    await waitFor(() => expect(second.result.current.catalog).not.toBeNull());
    expect(tiers).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure', async () => {
    const { tiers, wrapper } = stubbedClient();
    tiers.mockRejectedValueOnce(new Error('catalog exploded'));

    const first = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    await waitFor(() => expect(first.result.current.error).toBe('catalog exploded'));
    expect(first.result.current.catalog).toBeNull();

    // The next mount must be allowed to try again immediately, not sit on the failure for a minute.
    const second = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    await waitFor(() => expect(second.result.current.catalog).not.toBeNull());
    expect(tiers).toHaveBeenCalledTimes(2);
  });

  it('renders an SSR snapshot synchronously, with no loading flash and no request', async () => {
    const { tiers, addOns, wrapper } = stubbedClient();
    const snapshot = buildPublicCatalog({ appId: 'app-2', tiers: [tier], addOns: [pack] });

    const { result } = renderHook(() => usePublicCatalog('app-2', { initialCatalog: snapshot }), { wrapper });

    expect(result.current.loading).toBe(false);
    expect(result.current.catalog).toBe(snapshot);

    await act(async () => {
      await Promise.resolve();
    });
    expect(tiers).not.toHaveBeenCalled();
    expect(addOns).not.toHaveBeenCalled();
  });

  it('invalidatePublicCatalog refreshes a mounted instance', async () => {
    const { tiers, wrapper } = stubbedClient();

    const { result } = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(tiers).toHaveBeenCalledTimes(1);

    await act(async () => {
      invalidatePublicCatalog('app-1');
    });

    await waitFor(() => expect(tiers).toHaveBeenCalledTimes(2));
    expect(result.current.catalog).not.toBeNull();
  });

  it('refresh() bypasses the shared cache', async () => {
    const { tiers, wrapper } = stubbedClient();

    const { result } = renderHook(() => usePublicCatalog('app-1'), { wrapper });
    await waitFor(() => expect(result.current.catalog).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });
    expect(tiers).toHaveBeenCalledTimes(2);
  });

  it('makes no request while it is disabled', async () => {
    const { tiers, wrapper } = stubbedClient();

    const { result } = renderHook(() => usePublicCatalog('app-1', { enabled: false }), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(tiers).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.catalog).toBeNull();
  });
});
