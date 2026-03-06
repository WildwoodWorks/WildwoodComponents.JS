// @wildwood/react - Public API

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
export { AuthenticationComponent } from './components/authentication/AuthenticationComponent.js';
export type { AuthenticationComponentProps } from './components/authentication/AuthenticationComponent.js';
export { NotificationComponent } from './components/notifications/NotificationComponent.js';
export type { NotificationComponentProps } from './components/notifications/NotificationComponent.js';
export { NotificationToastComponent } from './components/notifications/NotificationToastComponent.js';
export type { NotificationToastComponentProps } from './components/notifications/NotificationToastComponent.js';
export { TwoFactorSettingsComponent } from './components/twofactor/TwoFactorSettingsComponent.js';
export type { TwoFactorSettingsComponentProps } from './components/twofactor/TwoFactorSettingsComponent.js';
export { DisclaimerComponent } from './components/disclaimer/DisclaimerComponent.js';
export type { DisclaimerComponentProps } from './components/disclaimer/DisclaimerComponent.js';
export { AppTierComponent } from './components/apptier/AppTierComponent.js';
export type { AppTierComponentProps } from './components/apptier/AppTierComponent.js';
export { AIChatComponent } from './components/ai/AIChatComponent.js';
export type { AIChatComponentProps } from './components/ai/AIChatComponent.js';
export { AIProxyComponent } from './components/ai/AIProxyComponent.js';
export type { AIProxyComponentProps } from './components/ai/AIProxyComponent.js';
export { SecureMessagingComponent } from './components/messaging/SecureMessagingComponent.js';
export type { SecureMessagingComponentProps } from './components/messaging/SecureMessagingComponent.js';
export { PaymentComponent } from './components/payment/PaymentComponent.js';
export type { PaymentComponentProps } from './components/payment/PaymentComponent.js';
export { PaymentFormComponent } from './components/payment/PaymentFormComponent.js';
export type { PaymentFormComponentProps } from './components/payment/PaymentFormComponent.js';
export { SubscriptionComponent } from './components/subscription/SubscriptionComponent.js';
export type { SubscriptionComponentProps } from './components/subscription/SubscriptionComponent.js';
export { SubscriptionManagerComponent } from './components/subscription/SubscriptionManagerComponent.js';
export type { SubscriptionManagerComponentProps } from './components/subscription/SubscriptionManagerComponent.js';
export { TokenRegistrationComponent } from './components/registration/TokenRegistrationComponent.js';
export type { TokenRegistrationComponentProps } from './components/registration/TokenRegistrationComponent.js';

// Common Components
export { LoadingSpinner } from './components/common/LoadingSpinner.js';
export type { LoadingSpinnerProps } from './components/common/LoadingSpinner.js';
export { ErrorBoundary } from './components/common/ErrorBoundary.js';
export type { ErrorBoundaryProps } from './components/common/ErrorBoundary.js';

// Re-export core types that React consumers commonly need
export type {
  WildwoodConfig,
  WildwoodClient,
  AuthenticationResponse,
  LoginRequest,
  RegistrationRequest,
  ThemeName,
} from '@wildwood/core';
