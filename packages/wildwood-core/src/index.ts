// @wildwood/core - Public API

// Client
export { createWildwoodClient } from './client/WildwoodClient.js';
export type { WildwoodClient } from './client/WildwoodClient.js';
export type { WildwoodConfig, RequestOptions, ApiResponse, ApiError, RequestInterceptor, ResponseInterceptor } from './client/types.js';
export { HttpClient } from './client/httpClient.js';
export { WildwoodError } from './client/errors.js';
export type { WildwoodErrorCode } from './client/errors.js';

// Auth
export { AuthService } from './auth/authService.js';
export { SessionManager } from './auth/sessionManager.js';
export { decodeJwtPayload, getTokenExpiry, isTokenExpired, getTokenRemainingMs, getRefreshTimeMs, extractUserFromToken } from './auth/tokenUtils.js';
export type { JwtPayload } from './auth/tokenUtils.js';
export type {
  LoginRequest,
  RegistrationRequest,
  AuthenticationResponse,
  TwoFactorMethodInfo,
  TwoFactorVerifyRequest,
  TwoFactorVerifyResponse,
  TwoFactorSendCodeRequest,
  TwoFactorSendCodeResponse,
  AuthProvider,
  AuthProviderDetails,
  AppComponentAuthProvidersResponse,
  AuthenticationConfiguration,
  CaptchaConfiguration,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshTokenRequest,
  PendingDisclaimerModel,
} from './auth/types.js';

// AI
export { AIService } from './ai/aiService.js';
export type { TTSVoice } from './ai/aiService.js';
export type {
  AIMessage,
  AISession,
  AISessionSummary,
  AIConfiguration,
  AIChatRequest,
  AIChatResponse,
  AIChatSettings,
  ChatTypingIndicator,
  FlowDefinition,
  FlowInputField,
  FlowExecution,
  FlowStepExecution,
  FlowExecuteRequest,
} from './ai/types.js';

// Messaging
export { MessagingService } from './messaging/messagingService.js';
export { createSignalRManager } from './messaging/signalRManager.js';
export type { SignalRManager, SignalRManagerConfig, SignalRConnectionState } from './messaging/signalRManager.js';
export {
  MessageType,
  ThreadType,
  ParticipantRole,
  UserStatus,
} from './messaging/types.js';
export type {
  SecureMessage,
  MessageThread,
  ThreadParticipant,
  ThreadSettings,
  MessageAttachment,
  MessageReaction,
  MessageReadReceipt,
  CompanyAppUser,
  OnlineStatus,
  TypingIndicator,
  SecureMessagingSettings,
  NotificationSettings,
  PendingAttachment,
  MessageSearchResult,
  MessageDraft,
} from './messaging/types.js';

// Payment
export { PaymentService, SubscriptionService } from './payment/paymentService.js';
export {
  PaymentProviderType,
  PaymentProviderCategory,
  PaymentMethod,
  PaymentStatus,
  BillingInterval,
  SubscriptionStatus,
} from './payment/types.js';
export type {
  PaymentProviderDto,
  AppPaymentConfigurationDto,
  PlatformFilteredProvidersDto,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  PaymentCompletionResult,
  SavedPaymentMethodDto,
  PaymentSuccessEventArgs,
  PaymentFailureEventArgs,
  PaymentRequest,
  BillingAddress,
  PaymentResult,
  SubscriptionPlan,
  Subscription,
  SubscriptionResult,
} from './payment/types.js';

// Payment Script Loader
export { loadScript, loadStripe, loadPayPal, loadApplePay, loadGooglePay, isScriptLoaded } from './payment/scriptLoader.js';
export type { ScriptLoadOptions } from './payment/scriptLoader.js';

// Notifications
export { NotificationService } from './notifications/notificationService.js';
export {
  NotificationType,
  NotificationActionStyle,
  NotificationPosition,
} from './notifications/types.js';
export type {
  ToastNotification,
  NotificationAction,
  NotificationActionArgs,
} from './notifications/types.js';

// Security
export { TwoFactorService } from './security/twoFactorService.js';
export { CaptchaService } from './security/captchaService.js';
export type {
  TwoFactorUserStatus,
  TwoFactorCredential,
  EmailEnrollmentResult,
  AuthenticatorEnrollmentResult,
  RecoveryCodeInfo,
  RegenerateRecoveryCodesResult,
  TrustedDevice,
} from './security/types.js';

// Features
export { DisclaimerService } from './features/disclaimerService.js';
export { AppTierService } from './features/appTierService.js';
export type {
  DisclaimerAcceptanceResult,
  PendingDisclaimersResponse,
  DisclaimerAcceptanceResponse,
  AppTierModel,
  AppTierPricingModel,
  AppTierFeatureModel,
  AppTierLimitModel,
  AppTierAddOnModel,
  UserTierSubscriptionModel,
  UserAddOnSubscriptionModel,
  AppFeatureCheckResultModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
} from './features/types.js';

// Theme
export { ThemeService } from './theme/themeService.js';
export type { ComponentTheme, ThemeName } from './theme/types.js';

// Platform
export type { Platform, PlatformInfo, StorageAdapter } from './platform/types.js';
export { LocalStorageAdapter, MemoryStorageAdapter, createStorageAdapter } from './platform/storageService.js';
export { detectPlatform } from './platform/platformDetection.js';

// Events
export { WildwoodEventEmitter } from './events/eventEmitter.js';
export type { WildwoodEvents } from './events/eventEmitter.js';
