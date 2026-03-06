'use client';

import { useState, useCallback } from 'react';
import type {
  AppPaymentConfigurationDto,
  PlatformFilteredProvidersDto,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  PaymentCompletionResult,
  SavedPaymentMethodDto,
  PaymentProviderType,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UsePaymentReturn {
  loading: boolean;
  error: string | null;
  savedMethods: SavedPaymentMethodDto[];
  getAppPaymentConfiguration: () => Promise<AppPaymentConfigurationDto | null>;
  getAvailableProviders: () => Promise<PlatformFilteredProvidersDto>;
  initiatePayment: (request: InitiatePaymentRequest) => Promise<InitiatePaymentResponse>;
  confirmPayment: (paymentIntentId: string, providerType: PaymentProviderType, confirmationData?: Record<string, unknown>) => Promise<PaymentCompletionResult>;
  getPaymentStatus: (transactionId: string) => Promise<PaymentCompletionResult>;
  requestRefund: (transactionId: string, amount?: number, reason?: string) => Promise<PaymentCompletionResult>;
  validateAppStoreReceipt: (receiptData: string, providerType: PaymentProviderType) => Promise<PaymentCompletionResult>;
  linkTransactionToUser: (externalTransactionId: string, userId: string, companyClientId?: string) => Promise<boolean>;
  getSavedPaymentMethods: (customerId: string) => Promise<SavedPaymentMethodDto[]>;
  deleteSavedPaymentMethod: (methodId: string) => Promise<boolean>;
  setDefaultPaymentMethod: (methodId: string) => Promise<boolean>;
}

export function usePayment(): UsePaymentReturn {
  const client = useWildwood();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethodDto[]>([]);

  const appId = client.config.appId ?? '';

  const getAppPaymentConfiguration = useCallback(async () => {
    return client.payment.getAppPaymentConfiguration(appId);
  }, [client, appId]);

  const getAvailableProviders = useCallback(async () => {
    return client.payment.getAvailableProviders(appId);
  }, [client, appId]);

  const initiatePayment = useCallback(async (request: InitiatePaymentRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await client.payment.initiatePayment(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const confirmPayment = useCallback(async (
    paymentIntentId: string,
    providerType: PaymentProviderType,
    confirmationData?: Record<string, unknown>,
  ) => {
    setLoading(true);
    setError(null);
    try {
      return await client.payment.confirmPayment(paymentIntentId, providerType, confirmationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment confirmation failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const getPaymentStatus = useCallback(async (transactionId: string) => {
    return client.payment.getPaymentStatus(transactionId);
  }, [client]);

  const requestRefund = useCallback(async (transactionId: string, amount?: number, reason?: string) => {
    setLoading(true);
    setError(null);
    try {
      return await client.payment.requestRefund(transactionId, amount, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund request failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const validateAppStoreReceipt = useCallback(async (receiptData: string, providerType: PaymentProviderType) => {
    return client.payment.validateAppStoreReceipt(appId, receiptData, providerType);
  }, [client, appId]);

  const linkTransactionToUser = useCallback(async (externalTransactionId: string, userId: string, companyClientId?: string) => {
    return client.payment.linkTransactionToUser(externalTransactionId, userId, companyClientId);
  }, [client]);

  const getSavedPaymentMethods = useCallback(async (customerId: string) => {
    const methods = await client.payment.getSavedPaymentMethods(customerId);
    setSavedMethods(methods);
    return methods;
  }, [client]);

  const deleteSavedPaymentMethod = useCallback(async (methodId: string) => {
    return client.payment.deleteSavedPaymentMethod(methodId);
  }, [client]);

  const setDefaultPaymentMethod = useCallback(async (methodId: string) => {
    return client.payment.setDefaultPaymentMethod(methodId);
  }, [client]);

  return {
    loading, error, savedMethods,
    getAppPaymentConfiguration, getAvailableProviders,
    initiatePayment, confirmPayment, getPaymentStatus,
    requestRefund, validateAppStoreReceipt, linkTransactionToUser,
    getSavedPaymentMethods, deleteSavedPaymentMethod, setDefaultPaymentMethod,
  };
}
