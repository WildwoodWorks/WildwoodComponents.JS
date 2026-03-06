import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePayment } from '../hooks/usePayment.js';
import { createWrapper } from './testUtils.js';

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
    expect(typeof result.current.linkTransactionToUser).toBe('function');
    expect(typeof result.current.getSavedPaymentMethods).toBe('function');
    expect(typeof result.current.deleteSavedPaymentMethod).toBe('function');
    expect(typeof result.current.setDefaultPaymentMethod).toBe('function');
  });
});
