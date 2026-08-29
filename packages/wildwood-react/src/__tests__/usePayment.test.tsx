import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PaymentProviderType, type PaymentCompletionResult, type StorePurchase } from '@wildwood/core';
import { usePayment } from '../hooks/usePayment.js';
import { createTestClient, createWrapper } from './testUtils.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePayment', () => {
  it('starts not loading with no error', () => {
    const { result } = renderHook(() => usePayment(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('starts with empty saved methods', () => {
    const { result } = renderHook(() => usePayment(), { wrapper: createWrapper() });
    expect(result.current.savedMethods).toEqual([]);
  });

  it('exposes all payment methods', () => {
    const { result } = renderHook(() => usePayment(), { wrapper: createWrapper() });
    expect(typeof result.current.getAppPaymentConfiguration).toBe('function');
    expect(typeof result.current.getAvailableProviders).toBe('function');
    expect(typeof result.current.initiatePayment).toBe('function');
    expect(typeof result.current.confirmPayment).toBe('function');
    expect(typeof result.current.getPaymentStatus).toBe('function');
    expect(typeof result.current.requestRefund).toBe('function');
    expect(typeof result.current.validateAppStoreReceipt).toBe('function');
    expect(typeof result.current.validateStorePurchase).toBe('function');
    expect(typeof result.current.linkTransactionToUser).toBe('function');
    expect(typeof result.current.getSavedPaymentMethods).toBe('function');
    expect(typeof result.current.deleteSavedPaymentMethod).toBe('function');
    expect(typeof result.current.setDefaultPaymentMethod).toBe('function');
  });

  it('validateStorePurchase forwards the configured appId and the purchase to core', async () => {
    const client = createTestClient();
    const validated: PaymentCompletionResult = { success: true, transactionId: 'wildwood-txn-1' };
    const spy = vi.spyOn(client.payment, 'validateStorePurchase').mockResolvedValue(validated);

    const purchase: StorePurchase = {
      providerType: PaymentProviderType.AppleAppStore,
      productId: 'io.wildwood.summit.monthly',
      purchaseToken: 'signed-jws',
      transactionId: 'store-txn-1',
      isRestore: false,
    };

    const { result } = renderHook(() => usePayment(), { wrapper: createWrapper(client) });

    let received: PaymentCompletionResult | undefined;
    await act(async () => {
      received = await result.current.validateStorePurchase(purchase);
    });

    expect(spy).toHaveBeenCalledWith('test-app-id', purchase);
    expect(received?.transactionId).toBe('wildwood-txn-1');
  });
});
