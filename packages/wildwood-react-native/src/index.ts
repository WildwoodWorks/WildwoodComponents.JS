// @wildwood/react-native - Public API

// Provider
export { WildwoodProvider } from './provider/WildwoodProvider.js';
export type { WildwoodProviderProps } from './provider/WildwoodProvider.js';
export { WildwoodContext } from './provider/WildwoodContext.js';

// Hooks
export { useWildwood } from './hooks/useWildwood.js';
export { useAuth } from './hooks/useAuth.js';
export type { UseAuthReturn } from './hooks/useAuth.js';
export { useSession } from './hooks/useSession.js';
export type { UseSessionReturn } from './hooks/useSession.js';
export { useNotifications } from './hooks/useNotifications.js';
export type { UseNotificationsReturn } from './hooks/useNotifications.js';
export { useTheme } from './hooks/useTheme.js';
export type { UseThemeReturn } from './hooks/useTheme.js';
export { useAI } from './hooks/useAI.js';
export type { UseAIReturn } from './hooks/useAI.js';
export { useAIFlow } from './hooks/useAIFlow.js';
export type { UseAIFlowReturn } from './hooks/useAIFlow.js';
export { useMessaging } from './hooks/useMessaging.js';
export type { UseMessagingReturn } from './hooks/useMessaging.js';
export { usePayment } from './hooks/usePayment.js';
export type { UsePaymentReturn } from './hooks/usePayment.js';
export { useSubscription } from './hooks/useSubscription.js';
export type { UseSubscriptionReturn } from './hooks/useSubscription.js';
export { useTwoFactor } from './hooks/useTwoFactor.js';
export type { UseTwoFactorReturn } from './hooks/useTwoFactor.js';
export { useDisclaimer } from './hooks/useDisclaimer.js';
export type { UseDisclaimerReturn } from './hooks/useDisclaimer.js';
export { useAppTier } from './hooks/useAppTier.js';
export type { UseAppTierReturn } from './hooks/useAppTier.js';
export { useCaptcha } from './hooks/useCaptcha.js';
export type { UseCaptchaReturn } from './hooks/useCaptcha.js';
export { useWildwoodComponent } from './hooks/useWildwoodComponent.js';
export type { UseWildwoodComponentReturn } from './hooks/useWildwoodComponent.js';
export { usePlatformDetection } from './hooks/usePlatformDetection.js';
export type { UsePlatformDetectionReturn } from './hooks/usePlatformDetection.js';

// Components
export { AuthenticationComponent } from './components/AuthenticationComponent.js';
export type { AuthenticationComponentProps } from './components/AuthenticationComponent.js';
export { NotificationComponent } from './components/NotificationComponent.js';
export type { NotificationComponentProps } from './components/NotificationComponent.js';
export { NotificationToastComponent } from './components/NotificationToastComponent.js';
export type { NotificationToastComponentProps } from './components/NotificationToastComponent.js';
export { TwoFactorSettingsComponent } from './components/TwoFactorSettingsComponent.js';
export type { TwoFactorSettingsComponentProps } from './components/TwoFactorSettingsComponent.js';
export { DisclaimerComponent } from './components/DisclaimerComponent.js';
export type { DisclaimerComponentProps } from './components/DisclaimerComponent.js';
export { AppTierComponent } from './components/AppTierComponent.js';
export type { AppTierComponentProps } from './components/AppTierComponent.js';
export { AIChatComponent } from './components/AIChatComponent.js';
export type { AIChatComponentProps } from './components/AIChatComponent.js';
export { SecureMessagingComponent } from './components/SecureMessagingComponent.js';
export type { SecureMessagingComponentProps } from './components/SecureMessagingComponent.js';
export { PaymentComponent } from './components/PaymentComponent.js';
export type { PaymentComponentProps } from './components/PaymentComponent.js';
export { PaymentFormComponent } from './components/PaymentFormComponent.js';
export type { PaymentFormComponentProps } from './components/PaymentFormComponent.js';
export { SubscriptionComponent } from './components/SubscriptionComponent.js';
export type { SubscriptionComponentProps } from './components/SubscriptionComponent.js';
export { SubscriptionManagerComponent } from './components/SubscriptionManagerComponent.js';
export type { SubscriptionManagerComponentProps } from './components/SubscriptionManagerComponent.js';
export { TokenRegistrationComponent } from './components/TokenRegistrationComponent.js';
export type { TokenRegistrationComponentProps } from './components/TokenRegistrationComponent.js';
export { AIProxyComponent } from './components/AIProxyComponent.js';
export type { AIProxyComponentProps } from './components/AIProxyComponent.js';
export { ErrorBoundary } from './components/ErrorBoundary.js';
export type { ErrorBoundaryProps } from './components/ErrorBoundary.js';
export { LoadingSpinner } from './components/LoadingSpinner.js';
export type { LoadingSpinnerProps } from './components/LoadingSpinner.js';

// Styles
export { defaultTheme, themes } from './styles/theme.js';
export type { WildwoodTheme } from './styles/theme.js';

// Re-export core types that React Native consumers commonly need
export type {
  WildwoodConfig,
  WildwoodClient,
  AuthenticationResponse,
  LoginRequest,
  RegistrationRequest,
  ThemeName,
  TwoFactorMethodInfo,
  TwoFactorVerifyResponse,
  AuthProvider,
  AuthenticationConfiguration,
  PendingDisclaimerModel,
  ToastNotification,
  NotificationType,
  AppTierModel,
  UserTierSubscriptionModel,
  PendingDisclaimersResponse,
  AIChatRequest,
  AIChatResponse,
  AISession,
  AISessionSummary,
  AIConfiguration,
  MessageThread,
  SecureMessage,
  SubscriptionPlan,
  Subscription,
  SubscriptionResult,
  PlatformInfo,
} from '@wildwood/core';
