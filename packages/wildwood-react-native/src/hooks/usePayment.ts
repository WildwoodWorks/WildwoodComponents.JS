import { useState, useCallback } from 'react';
import type {
  AppPaymentConfigurationDto,
  PlatformFilteredProvidersDto,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  SavedPaymentMethodDto,
} from '@wildwood/core';
import { useWildwood } from './useWildwood';

export interface UsePaymentReturn {
  loading: boolean;
  error: string | null;
  savedMethods: SavedPaymentMethodDto[];
  getAppPaymentConfiguration: () => Promise<AppPaymentConfigurationDto | null>;
  getAvailableProviders: () => Promise<PlatformFilteredProvidersDto>;
  initiatePayment: (request: InitiatePaymentRequest) => Promise<InitiatePaymentResponse>;
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
    initiatePayment, getSavedPaymentMethods,
    deleteSavedPaymentMethod, setDefaultPaymentMethod,
  };
}
