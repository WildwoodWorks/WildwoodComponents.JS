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
export { useExternalApi } from './hooks/useExternalApi.js';
export type { ExternalApiClient, ExternalApiClientOptions } from './hooks/useExternalApi.js';
export { useUsageDashboard } from './hooks/useUsageDashboard.js';
export type { UseUsageDashboardReturn, UseUsageDashboardOptions } from './hooks/useUsageDashboard.js';
export { useSubscriptionAdmin } from './hooks/useSubscriptionAdmin.js';
export type { UseSubscriptionAdminReturn } from './hooks/useSubscriptionAdmin.js';

// Routing
export { ProtectedRoute } from './components/routing/ProtectedRoute.js';
export type { ProtectedRouteProps } from './components/routing/ProtectedRoute.js';

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
export { AIFlowComponent } from './components/ai/AIFlowComponent.js';
export type { AIFlowComponentProps } from './components/ai/AIFlowComponent.js';
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
export { SubscriptionAdminComponent } from './components/subscription/admin/SubscriptionAdminComponent.js';
export type {
  SubscriptionAdminComponentProps,
  SubscriptionAdminDisplayMode,
} from './components/subscription/admin/SubscriptionAdminComponent.js';
export { SubscriptionStatusPanel } from './components/subscription/admin/SubscriptionStatusPanel.js';
export type { SubscriptionStatusPanelProps } from './components/subscription/admin/SubscriptionStatusPanel.js';
export { TierPlansPanel } from './components/subscription/admin/TierPlansPanel.js';
export type { TierPlansPanelProps, TierSelectedEventArgs } from './components/subscription/admin/TierPlansPanel.js';
export { FeaturesPanel } from './components/subscription/admin/FeaturesPanel.js';
export type { FeaturesPanelProps } from './components/subscription/admin/FeaturesPanel.js';
export { AddOnsPanel } from './components/subscription/admin/AddOnsPanel.js';
export type { AddOnsPanelProps } from './components/subscription/admin/AddOnsPanel.js';
export { UsageLimitsPanel } from './components/subscription/admin/UsageLimitsPanel.js';
export type { UsageLimitsPanelProps } from './components/subscription/admin/UsageLimitsPanel.js';
export { OverridesPanel } from './components/subscription/admin/OverridesPanel.js';
export type { OverridesPanelProps } from './components/subscription/admin/OverridesPanel.js';
export { TokenRegistrationComponent } from './components/registration/TokenRegistrationComponent.js';
export type { TokenRegistrationComponentProps } from './components/registration/TokenRegistrationComponent.js';
export { SignupWithSubscriptionComponent } from './components/registration/SignupWithSubscriptionComponent.js';
export type { SignupWithSubscriptionComponentProps } from './components/registration/SignupWithSubscriptionComponent.js';
export { UsageDashboardComponent } from './components/usage/UsageDashboardComponent.js';
export type { UsageDashboardComponentProps } from './components/usage/UsageDashboardComponent.js';
export { OverageSummaryComponent } from './components/usage/OverageSummaryComponent.js';
export type { OverageSummaryComponentProps } from './components/usage/OverageSummaryComponent.js';
export { PricingDisplayComponent } from './components/pricing/PricingDisplayComponent.js';
export type { PricingDisplayComponentProps } from './components/pricing/PricingDisplayComponent.js';

// Tier Card (shared sub-components)
export { TierCard } from './components/tier/TierCard.js';
export type { TierCardProps } from './components/tier/TierCard.js';
export { TierCardHeader } from './components/tier/TierCardHeader.js';
export type { TierCardHeaderProps } from './components/tier/TierCardHeader.js';
export { TierCardFeatures } from './components/tier/TierCardFeatures.js';
export type { TierCardFeaturesProps } from './components/tier/TierCardFeatures.js';
export { TierCardLimits } from './components/tier/TierCardLimits.js';
export type { TierCardLimitsProps } from './components/tier/TierCardLimits.js';
export { TierCardFooter } from './components/tier/TierCardFooter.js';
export type { TierCardFooterProps } from './components/tier/TierCardFooter.js';

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
  RegistrationFormData,
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
  AppTierPricingModel,
  AppTierAddOnModel,
  UserAddOnSubscriptionModel,
  AppTierLimitStatusModel,
  AppFeatureDefinitionModel,
  FlowDefinition,
  FlowExecution,
  PaymentCompletionResult,
} from '@wildwood/core';
