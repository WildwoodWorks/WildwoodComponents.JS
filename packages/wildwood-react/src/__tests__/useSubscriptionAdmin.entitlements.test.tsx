/**
 * useSubscriptionAdmin's entitlement contract: a bare `false` is a refusal and must say so, and
 * every entitlement-changing mutation drops the shared feature cache AND announces itself on the
 * client's emitter so the rest of the app can re-read.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { WildwoodEvents } from '@wildwood/core';
import { useSubscriptionAdmin, useFeatures, clearFeatureCache } from '@wildwood/react-shared';
import { createTestClient, createWrapper } from './testUtils.js';

beforeEach(() => {
  clearFeatureCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearFeatureCache();
});

describe('useSubscriptionAdmin entitlement handling', () => {
  it('turns a refused add-on subscribe into an error instead of a silent success', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'subscribeToAddOn').mockResolvedValue(false);

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.subscribeToAddOn('app-1', 'pack-a');
    });

    // The boolean still comes back — callers branch on it — but the refusal is now visible.
    expect(ok).toBe(false);
    expect(result.current.error).toBe('The request was refused: could not subscribe to the pack.');
  });

  it('leaves error alone when the mutation succeeds', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'subscribeToAddOn').mockResolvedValue(true);

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.subscribeToAddOn('app-1', 'pack-a');
    });

    expect(result.current.error).toBeNull();
  });

  it('emits entitlementsChanged and refreshes mounted feature gates', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'subscribeToAddOn').mockResolvedValue(true);
    const getUserFeatures = vi.spyOn(client.appTier, 'getUserFeatures').mockResolvedValue({ DOCUMENTS: true });

    const seen: WildwoodEvents['entitlementsChanged'][] = [];
    client.events.on('entitlementsChanged', (event) => seen.push(event));

    const { result } = renderHook(
      () => ({ admin: useSubscriptionAdmin(), features: useFeatures({ appId: 'app-1' }) }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(getUserFeatures).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.admin.subscribeToAddOn('app-1', 'pack-a');
    });

    expect(seen).toEqual([{ appId: 'app-1', reason: 'addOn' }]);
    // invalidateFeatures() dropped the shared cache and told every mounted gate to reload.
    await waitFor(() => expect(getUserFeatures).toHaveBeenCalledTimes(2));
  });

  it('uses the reason that matches the mutation', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'changeTier').mockResolvedValue({ success: true, errorMessage: '', isScheduled: false });
    vi.spyOn(client.appTier, 'cancelAddOnDetailed').mockResolvedValue({ success: true, isScheduled: true });
    vi.spyOn(client.appTier, 'reactivateAddOn').mockResolvedValue({ success: true, status: 'Active' });
    vi.spyOn(client.appTier, 'setFeatureOverride').mockResolvedValue(true);

    const seen: WildwoodEvents['entitlementsChanged'][] = [];
    client.events.on('entitlementsChanged', (event) => seen.push(event));

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.changeTierWithOptions('app-1', { newTierId: 'tier-pro', supportsPaymentAction: true });
      await result.current.cancelAddOnDetailed('sub-1');
      await result.current.reactivateAddOn('sub-1');
      await result.current.setFeatureOverride('app-1', 'user-1', 'DOCUMENTS', true);
    });

    expect(seen.map((event) => event.reason)).toEqual(['tierChange', 'cancel', 'reactivate', 'manual']);
    // The subscription-scoped endpoints take no appId, so the client's configured app is used.
    expect(seen[1]?.appId).toBe('test-app-id');
  });

  it('changeTierWithOptions passes the options through and does not treat 3-D Secure as a failure', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.appTier, 'changeTier').mockResolvedValue({
      success: false,
      errorMessage: '',
      isScheduled: false,
      requiresAction: true,
      clientSecret: 'pi_secret',
      pendingChangeId: 'pending-1',
    });

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.changeTierWithOptions('app-1', { newTierId: 'tier-pro', supportsPaymentAction: true });
    });

    expect(spy).toHaveBeenCalledWith('app-1', { newTierId: 'tier-pro', supportsPaymentAction: true });
    expect(result.current.error).toBeNull();
  });

  it('the detailed cancel surfaces the server error code', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'cancelAddOnDetailed').mockResolvedValue({
      success: false,
      errorCode: 'addon_subscription_forbidden',
    });

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    await act(async () => {
      const cancelled = await result.current.cancelAddOnDetailed('sub-1');
      expect(cancelled.errorCode).toBe('addon_subscription_forbidden');
    });

    expect(result.current.error).toBe(
      'The request was refused: could not cancel the pack (addon_subscription_forbidden).',
    );
  });

  it('the detailed subscribe surfaces a structured refusal', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'subscribeToAddOnDetailed').mockResolvedValue({
      success: false,
      error: { code: 'BundledInTier', message: 'That pack is already part of your plan', status: 400 },
    });

    const { result } = renderHook(() => useSubscriptionAdmin(), { wrapper: createWrapper(client) });

    await act(async () => {
      const subscribed = await result.current.subscribeToAddOnDetailed('app-1', 'pack-a');
      expect(subscribed.success).toBe(false);
    });

    expect(result.current.error).toBe('That pack is already part of your plan');
  });
});
