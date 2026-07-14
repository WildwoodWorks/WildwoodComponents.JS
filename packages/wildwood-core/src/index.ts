// @wildwood/core - Public API

// Client
export { createWildwoodClient } from './client/WildwoodClient.js';
export type { WildwoodClient } from './client/WildwoodClient.js';
export type {
  WildwoodConfig,
  RequestOptions,
  ApiResponse,
  ApiError,
  RequestInterceptor,
  ResponseInterceptor,
} from './client/types.js';
export { HttpClient } from './client/httpClient.js';
export { WildwoodError } from './client/errors.js';
export type { WildwoodErrorCode } from './client/errors.js';
export { createExternalApiClient, ExternalApiError } from './client/externalApiClient.js';
export type {
  ExternalApiClient,
  ExternalApiClientOptions,
  ExternalApiRequestOptions,
} from './client/externalApiClient.js';

// Auth
export { validatePasswordClientSide } from './auth/passwordUtils.js';
export { AuthService } from './auth/authService.js';
export { SessionManager } from './auth/sessionManager.js';
export {
  decodeJwtPayload,
  getTokenExpiry,
  isTokenExpired,
  getTokenRemainingMs,
  getRefreshTimeMs,
  extractUserFromToken,
} from './auth/tokenUtils.js';
export type { JwtPayload } from './auth/tokenUtils.js';
export { openOAuthPopup, isPopupSupported } from './auth/oauthPopup.js';
export type { OAuthPopupResult } from './auth/oauthPopup.js';
export { AuthErrorCodes } from './auth/authErrorCodes.js';
export type { AuthErrorCode } from './auth/authErrorCodes.js';
export type {
  LoginRequest,
  RegistrationRequest,
  RegistrationFormData,
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
  ValidateRegistrationRequest,
  ValidateRegistrationResponse,
  OpenRegistrationResult,
} from './auth/types.js';

// AI
export { AIService } from './ai/aiService.js';
export type { TTSVoice } from './ai/aiService.js';
export { AIFlowService } from './ai/aiFlowService.js';
export type { AIFlowRequestOptions, AIFlowEventHandler } from './ai/aiFlowService.js';
export { AIFlowSubscriptionService } from './ai/aiFlowSubscriptionService.js';
export type { AIFlowSubscriptionRequestOptions } from './ai/aiFlowSubscriptionService.js';
// Shared SSE plumbing for fetch-based streaming transports
export { createSseParser, isAbort } from './ai/sse.js';
export type { SseFrame } from './ai/sse.js';
export type {
  AIMessage,
  AISession,
  AISessionSummary,
  AIConfiguration,
  AIChatRequest,
  AIChatResponse,
  AIChatSettings,
  ChatTypingIndicator,
  AIFlowModel,
  AIFlowInputField,
  AIFlowRunEvent,
  AIFlowRunResult,
  AIFlowRunSummary,
  AIFlowRunDetail,
  AIFlowSubscription,
  AIFlowSubscriptionCreateRequest,
  AIFlowSubscriptionUpdateRequest,
} from './ai/types.js';

// Documents (tenant document storage + text extraction)
export { DocumentService } from './documents/documentService.js';
export type { DocumentRequestOptions } from './documents/documentService.js';
export type { AppDocumentModel, AppDocumentStatus, AppDocumentTextResult } from './documents/types.js';

// Messaging
export { MessagingService } from './messaging/messagingService.js';
export { createSignalRManager } from './messaging/signalRManager.js';
export type { SignalRManager, SignalRManagerConfig, SignalRConnectionState } from './messaging/signalRManager.js';
export { MessageType, ThreadType, ParticipantRole, UserStatus } from './messaging/types.js';
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
export { PaymentService } from './payment/paymentService.js';
export { PaymentProviderType, PaymentProviderCategory, PaymentMethod, PaymentStatus } from './payment/types.js';
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
} from './payment/types.js';

// Payment Script Loader
export {
  loadScript,
  loadStripe,
  loadPayPal,
  loadApplePay,
  loadGooglePay,
  isScriptLoaded,
} from './payment/scriptLoader.js';
export type { ScriptLoadOptions } from './payment/scriptLoader.js';

// Notifications (client-side toast queue)
export { NotificationService } from './notifications/notificationService.js';
export { NotificationType, NotificationActionStyle, NotificationPosition } from './notifications/types.js';
export type { ToastNotification, NotificationAction, NotificationActionArgs } from './notifications/types.js';

// Notification Inbox (backend-connected: bell + list + preferences)
export { NotificationInboxService } from './notifications/notificationInboxService.js';
export type { NotificationInboxRequestOptions } from './notifications/notificationInboxService.js';
export { createDefaultNotificationPreference } from './notifications/inboxTypes.js';
export type { AppNotification, AppNotificationStatus, UserNotificationPreference } from './notifications/inboxTypes.js';

// Browser (Web Notifications API) channel helpers
export {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from './notifications/browserNotifications.js';
export type { BrowserNotificationOptions } from './notifications/browserNotifications.js';

// Security
export { TwoFactorService } from './security/twoFactorService.js';
export { CaptchaService } from './security/captchaService.js';
export type {
  TwoFactorConfiguration,
  TwoFactorConfigurationMethod,
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

// Consent Management
export { ConsentService } from './consent/consentService.js';
export { NON_NECESSARY_CATEGORIES, GPC_FORCED_OFF } from './consent/types.js';
export type {
  ConsentCategory,
  ScriptInjectionMode,
  ScriptLoadPosition,
  ScriptLoadStrategy,
  NonTargetDefault,
  ConsentMethod,
  ConsentScript,
  GeoDecision,
  PublicConsentConfig,
  ConsentRecordRequest,
  ConsentState,
  ConsentInitResult,
  ConsentChangeListener,
  ConsentServiceOptions,
} from './consent/types.js';
export {
  CURRENCY_SYMBOLS,
  getCurrencySymbol,
  formatPrice,
  isAnnualFrequency,
  hasAnnualPricing,
  isEnterpriseTier,
  isRawBadgeColor,
  shouldShowTierStatusBadge,
  getSelectedPricing,
  computeAnnualDiscount,
} from './features/tierUtils.js';
export type {
  DisclaimerAcceptanceResult,
  PendingDisclaimersResponse,
  DisclaimerAcceptanceResponse,
  AppTierModel,
  AppTierPricingModel,
  AppTierFeatureModel,
  AppTierLimitModel,
  AppTierAddOnModel,
  AppTierAddOnFeatureModel,
  AppTierAddOnPricingModel,
  UserTierSubscriptionModel,
  UserAddOnSubscriptionModel,
  AppFeatureCheckResultModel,
  AppFeatureDefinitionModel,
  AppFeatureOverrideModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
  AppTierCancelResultModel,
  TierChangePreviewModel,
} from './features/types.js';

// Feedback
export { FeedbackService } from './feedback/feedbackService.js';
export type {
  FeedbackWidgetConfig,
  FeedbackAttachment,
  FeedbackConsoleEntry,
  FeedbackBrowserContext,
  SubmitFeedbackInput,
  SystemFeedback,
  FeedbackDuplicateCheck,
  FeedbackVoteResult,
} from './feedback/types.js';

// Theme
export { ThemeService } from './theme/themeService.js';
export type { ComponentTheme, ThemeName } from './theme/types.js';

// Platform
export type { Platform, PlatformInfo, DistributionSource, StorageAdapter } from './platform/types.js';
export { LocalStorageAdapter, MemoryStorageAdapter, createStorageAdapter } from './platform/storageService.js';
export {
  detectPlatform,
  isProviderAvailable,
  getRequiredAppStoreProviderType,
  isApplePayAvailableAsync,
  isGooglePayAvailableAsync,
} from './platform/platformDetection.js';

// Utils
export { formatTimestamp, formatFileSize } from './utils/formatUtils.js';
export { sanitizeHtml } from './utils/htmlSanitizer.js';

// Events
export { WildwoodEventEmitter } from './events/eventEmitter.js';
export type { WildwoodEvents } from './events/eventEmitter.js';
