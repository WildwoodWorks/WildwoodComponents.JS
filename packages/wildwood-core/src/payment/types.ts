// Payment types - ported from WildwoodComponents.Shared/Models/PaymentProviderModels.cs
// and WildwoodComponents.Blazor/Models/ComponentModels.cs

export enum PaymentProviderType {
  Stripe = 1,
  PayPal = 2,
  Square = 3,
  Braintree = 4,
  AuthorizeNet = 5,
  AppleAppStore = 10,
  GooglePlayStore = 11,
  ApplePay = 20,
  GooglePay = 21,
  Klarna = 30,
  Affirm = 31,
  Afterpay = 32,
  Razorpay = 40,
  Adyen = 41,
  Coinbase = 50,
  BitPay = 51,
}

export enum PaymentProviderCategory {
  CardProcessor = 1,
  AppStore = 2,
  DigitalWallet = 3,
  BuyNowPayLater = 4,
  Regional = 5,
  Cryptocurrency = 6,
}

export enum PaymentMethod {
  CreditCard = 'CreditCard',
  BankTransfer = 'BankTransfer',
  DigitalWallet = 'DigitalWallet',
  Cryptocurrency = 'Cryptocurrency',
}

export enum PaymentStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Completed = 'Completed',
  Failed = 'Failed',
  Cancelled = 'Cancelled',
  Refunded = 'Refunded',
}

export interface PaymentProviderDto {
  id: string;
  name: string;
  displayName?: string;
  providerType: number;
  category: number;
  isEnabled: boolean;
  isDefault: boolean;
  isSandboxMode: boolean;
  displayOrder: number;
  publishableKey?: string;
  clientId?: string;
  merchantId?: string;
  supportsSubscriptions: boolean;
  supportsRefunds: boolean;
  supports3DSecure: boolean;
  supportsSavedPaymentMethods: boolean;
  supportsApplePay: boolean;
  supportsGooglePay: boolean;
  allowedPlatforms: number;
  isAppStoreExclusive: boolean;
  supportedCurrencies?: string;
  defaultCurrency?: string;
}

export interface AppPaymentConfigurationDto {
  appId: string;
  appName: string;
  isPaymentEnabled: boolean;
  defaultCurrency: string;
  supportedCurrencies?: string;
  allowSavedPaymentMethods: boolean;
  requireBillingAddress: boolean;
  require3DSecure: boolean;
  providers: PaymentProviderDto[];
  defaultProviderId?: string;
}

export interface PlatformFilteredProvidersDto {
  appId: string;
  platform: string;
  requiresAppStorePayment: boolean;
  requiredProviderId?: string;
  availableProviders: PaymentProviderDto[];
  defaultProvider?: PaymentProviderDto;
}

export interface InitiatePaymentRequest {
  providerId: string;
  appId: string;
  amount: number;
  currency?: string;
  description?: string;
  customerId?: string;
  customerEmail?: string;
  orderId?: string;
  subscriptionId?: string;
  pricingModelId?: string;
  isSubscription?: boolean;
  billingFrequency?: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface InitiatePaymentResponse {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  redirectUrl?: string;
  approvalUrl?: string;
  orderId?: string;
  subscriptionId?: string;
  requiresClientConfirmation?: boolean;
  errorMessage?: string;
  errorCode?: string;
  providerType: PaymentProviderType;
  productIds?: string[];
  providerData?: Record<string, unknown>;
}

export interface PaymentCompletionResult {
  success: boolean;
  transactionId?: string;
  paymentIntentId?: string;
  subscriptionId?: string;
  amountPaid?: number;
  currency?: string;
  status?: string;
  errorMessage?: string;
  errorCode?: string;
  completedAt?: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SavedPaymentMethodDto {
  id: string;
  customerId: string;
  providerType: number;
  type: string;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  createdAt: string;
}

export interface PaymentSuccessEventArgs {
  transactionId?: string;
  paymentIntentId?: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  providerType: number;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentFailureEventArgs {
  errorMessage?: string;
  errorCode?: string;
  providerType: number;
  isRetryable: boolean;
  declineCode?: string;
}

export interface PaymentRequest {
  id: string;
  amount: number;
  currency: string;
  merchantId: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;
  billingAddress: BillingAddress;
  metadata?: Record<string, unknown>;
}

export interface BillingAddress {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PaymentResult {
  isSuccess: boolean;
  transactionId?: string;
  paymentId?: string;
  errorMessage?: string;
  errorCode?: string;
  amount: number;
  currency: string;
  processedAt: string;
  status: PaymentStatus;
  additionalData?: Record<string, unknown>;
}

// Subscription types

export enum BillingInterval {
  Weekly = 'Weekly',
  Monthly = 'Monthly',
  Quarterly = 'Quarterly',
  Yearly = 'Yearly',
}

export enum SubscriptionStatus {
  Active = 'Active',
  Paused = 'Paused',
  Cancelled = 'Cancelled',
  Expired = 'Expired',
  Trial = 'Trial',
  PendingPayment = 'PendingPayment',
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: BillingInterval;
  monthlyEquivalent?: number;
  isFree: boolean;
  isRecommended: boolean;
  features?: string[];
  limitations?: string[];
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  nextBillingDate?: string;
  cancelledAt?: string;
  features?: string[];
  metadata?: Record<string, unknown>;
}

export interface SubscriptionResult {
  isSuccess: boolean;
  errorMessage?: string;
  errorCode?: string;
  subscription?: Subscription;
  paymentUrl?: string;
  additionalData?: Record<string, unknown>;
}
