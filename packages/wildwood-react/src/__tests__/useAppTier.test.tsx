import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AppTierChangeResultModel, TierChangePreviewModel } from '@wildwood/core';
import { useAppTier } from '../hooks/useAppTier.js';
import { createTestClient, createWrapper } from './testUtils.js';

const changeResult: AppTierChangeResultModel = { success: true, errorMessage: '', isScheduled: false };

const preview: TierChangePreviewModel = {
  success: true,
  isUpgrade: true,
  isDowngrade: false,
  isBillingFrequencyChange: false,
  paymentRequired: true,
  paymentBypassAllowed: false,
  paymentProviderAvailable: true,
  newTierName: 'Summit',
  proratedChargeToday: 12.5,
  featuresGained: ['Unlimited flows'],
  featuresLost: [],
  currency: 'USD',
  daysRemainingInPeriod: 12,
  allowImmediateChange: true,
  allowScheduledChange: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAppTier', () => {
  it('exposes previewTierChange alongside the other tier actions', () => {
    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper() });
    expect(typeof result.current.previewTierChange).toBe('function');
    expect(typeof result.current.changeTier).toBe('function');
    expect(typeof result.current.selfSubscribe).toBe('function');
  });

  it('previewTierChange calls core with the configured appId and returns the preview', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.appTier, 'previewTierChange').mockResolvedValue(preview);

    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper(client) });

    let received: TierChangePreviewModel | undefined;
    await act(async () => {
      received = await result.current.previewTierChange('tier-2', 'pricing-2');
    });

    expect(spy).toHaveBeenCalledWith('test-app-id', 'tier-2', 'pricing-2');
    expect(received).toEqual(preview);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('previewTierChange surfaces a failure through error and rethrows', async () => {
    const client = createTestClient();
    vi.spyOn(client.appTier, 'previewTierChange').mockRejectedValue(new Error('preview exploded'));

    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper(client) });

    await act(async () => {
      await expect(result.current.previewTierChange('tier-2')).rejects.toThrow('preview exploded');
    });

    await waitFor(() => expect(result.current.error).toBe('preview exploded'));
    expect(result.current.loading).toBe(false);
  });

  it('forwards paymentTransactionId to core changeTier', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.appTier, 'changeTier').mockResolvedValue(changeResult);
    vi.spyOn(client.appTier, 'getUserSubscription').mockResolvedValue(null);

    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.changeTier('tier-2', 'pricing-2', true, 'txn-99');
    });

    expect(spy).toHaveBeenCalledWith('test-app-id', 'tier-2', 'pricing-2', true, 'txn-99');
  });

  it('leaves paymentTransactionId undefined when the caller omits it (unchanged call shape)', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.appTier, 'changeTier').mockResolvedValue(changeResult);
    vi.spyOn(client.appTier, 'getUserSubscription').mockResolvedValue(null);

    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.changeTier('tier-2');
    });

    expect(spy).toHaveBeenCalledWith('test-app-id', 'tier-2', undefined, undefined, undefined);
  });

  it('forwards paymentTransactionId to core selfSubscribe', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.appTier, 'selfSubscribe').mockResolvedValue(changeResult);
    vi.spyOn(client.appTier, 'getUserSubscription').mockResolvedValue(null);

    const { result } = renderHook(() => useAppTier(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.selfSubscribe('tier-2', 'pricing-2', 'txn-99');
    });

    expect(spy).toHaveBeenCalledWith('test-app-id', 'tier-2', 'pricing-2', 'txn-99');
  });
});
