// Payment service - ported from WildwoodComponents.Blazor/Services/PaymentProviderService.cs

import type { HttpClient } from '../client/httpClient.js';
import type {
  PaymentProviderType,
  AppPaymentConfigurationDto,
  PlatformFilteredProvidersDto,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  PaymentCompletionResult,
  SavedPaymentMethodDto,
  SubscriptionPlan,
  Subscription,
  SubscriptionResult,
} from './types.js';

export class PaymentService {
  constructor(private http: HttpClient) {}

  // Configuration
  async getAppPaymentConfiguration(appId: string): Promise<AppPaymentConfigurationDto | null> {
    try {
      const { data } = await this.http.get<AppPaymentConfigurationDto>(`api/payments/${appId}/configuration`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getAvailableProviders(appId: string): Promise<PlatformFilteredProvidersDto> {
    const { data } = await this.http.get<PlatformFilteredProvidersDto>(`api/payments/${appId}/providers`);
    return data;
  }

  // Payment operations
  async initiatePayment(request: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
    const { data } = await this.http.post<InitiatePaymentResponse>('api/payments/initiate', request);
    return data;
  }

  async confirmPayment(
    paymentIntentId: string,
    providerType: PaymentProviderType,
    confirmationData?: Record<string, unknown>,
  ): Promise<PaymentCompletionResult> {
    const { data } = await this.http.post<PaymentCompletionResult>('api/payments/confirm', {
      paymentIntentId,
      providerType,
      confirmationData,
    });
    return data;
  }

  async validateAppStoreReceipt(
    appId: string,
    receiptData: string,
    providerType: PaymentProviderType,
  ): Promise<PaymentCompletionResult> {
    const { data } = await this.http.post<PaymentCompletionResult>('api/payments/validate-receipt', {
      appId,
      receiptData,
      providerType,
    });
    return data;
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentCompletionResult> {
    const { data } = await this.http.get<PaymentCompletionResult>(`api/payments/status/${transactionId}`);
    return data;
  }

  async requestRefund(transactionId: string, amount?: number, reason?: string): Promise<PaymentCompletionResult> {
    const { data } = await this.http.post<PaymentCompletionResult>('api/payments/refund', {
      transactionId,
      amount,
      reason,
    });
    return data;
  }

  // Saved payment methods
  async getSavedPaymentMethods(customerId: string): Promise<SavedPaymentMethodDto[]> {
    const { data } = await this.http.get<SavedPaymentMethodDto[]>(`api/payments/methods/${customerId}`);
    return data ?? [];
  }

  async deleteSavedPaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/payments/methods/${paymentMethodId}`);
      return true;
    } catch {
      return false;
    }
  }

  async setDefaultPaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      await this.http.post(`api/payments/methods/${paymentMethodId}/default`);
      return true;
    } catch {
      return false;
    }
  }

  async linkTransactionToUser(
    externalTransactionId: string,
    userId: string,
    companyClientId?: string,
  ): Promise<boolean> {
    try {
      await this.http.post('api/payments/link-transaction', {
        externalTransactionId,
        userId,
        companyClientId,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export class SubscriptionService {
  constructor(private http: HttpClient) {}

  async getPlans(appId: string): Promise<SubscriptionPlan[]> {
    const { data } = await this.http.get<SubscriptionPlan[]>(`api/subscriptions/${appId}/plans`);
    return data ?? [];
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const { data } = await this.http.get<Subscription>(`api/subscriptions/${subscriptionId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getUserSubscriptions(): Promise<Subscription[]> {
    const { data } = await this.http.get<Subscription[]>('api/subscriptions/my');
    return data ?? [];
  }

  async subscribe(planId: string, paymentMethodId?: string): Promise<SubscriptionResult> {
    const { data } = await this.http.post<SubscriptionResult>('api/subscriptions/subscribe', {
      planId,
      paymentMethodId,
    });
    return data;
  }

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const { data } = await this.http.post<SubscriptionResult>(`api/subscriptions/${subscriptionId}/cancel`);
    return data;
  }

  async changePlan(subscriptionId: string, newPlanId: string): Promise<SubscriptionResult> {
    const { data } = await this.http.post<SubscriptionResult>(`api/subscriptions/${subscriptionId}/change-plan`, {
      newPlanId,
    });
    return data;
  }
}
