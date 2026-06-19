// @wildwood/react-shared - Shared hooks for @wildwood/react and @wildwood/react-native

// Provider
export { WildwoodContext } from './provider/WildwoodContext.js';

// Hooks
export { useWildwood } from './hooks/useWildwood.js';
export { useAuth } from './hooks/useAuth.js';
export type { UseAuthReturn } from './hooks/useAuth.js';
export { useSession } from './hooks/useSession.js';
export type { UseSessionReturn } from './hooks/useSession.js';
export { useAI } from './hooks/useAI.js';
export type { UseAIReturn } from './hooks/useAI.js';
// Backend-orchestrated SSE chat transport (WS6C)
export { streamOrchestratedChat, createSseParser, dispatchSseFrame } from './ai/orchestratedChat.js';
export type {
  OrchestratedChatMessage,
  OrchestratedChatRequest,
  OrchestratedChatResult,
  OrchestratedChatHandlers,
  OrchestratedPendingToolCall,
  OrchestratedToolActivity,
  StreamOrchestratedChatOptions,
  SseFrame,
} from './ai/orchestratedChat.js';
export { useAppTier } from './hooks/useAppTier.js';
export type { UseAppTierReturn } from './hooks/useAppTier.js';
export { useMessaging } from './hooks/useMessaging.js';
export type { UseMessagingReturn } from './hooks/useMessaging.js';
export { usePayment } from './hooks/usePayment.js';
export type { UsePaymentReturn } from './hooks/usePayment.js';
export { useSubscriptionAdmin } from './hooks/useSubscriptionAdmin.js';
export type { UseSubscriptionAdminReturn } from './hooks/useSubscriptionAdmin.js';
export { useTwoFactor } from './hooks/useTwoFactor.js';
export type { UseTwoFactorReturn } from './hooks/useTwoFactor.js';
export { useTwoFactorLogic } from './hooks/useTwoFactorLogic.js';
export type {
  UseTwoFactorLogicOptions,
  UseTwoFactorLogicReturn,
  TwoFactorSettingsView,
} from './hooks/useTwoFactorLogic.js';
export { useDisclaimer } from './hooks/useDisclaimer.js';
export type { UseDisclaimerReturn } from './hooks/useDisclaimer.js';
export { useFeedback } from './hooks/useFeedback.js';
export type { UseFeedbackReturn } from './hooks/useFeedback.js';
export { useCaptcha } from './hooks/useCaptcha.js';
export type { UseCaptchaReturn } from './hooks/useCaptcha.js';
export { useNotifications } from './hooks/useNotifications.js';
export type { UseNotificationsReturn } from './hooks/useNotifications.js';
export { useTheme } from './hooks/useTheme.js';
export type { UseThemeReturn } from './hooks/useTheme.js';
export { useExternalApi } from './hooks/useExternalApi.js';
export type { ExternalApiClient, ExternalApiClientOptions } from './hooks/useExternalApi.js';
export { useUsageDashboard } from './hooks/useUsageDashboard.js';
export type { UseUsageDashboardReturn, UseUsageDashboardOptions } from './hooks/useUsageDashboard.js';
export { useWildwoodComponent } from './hooks/useWildwoodComponent.js';
export type { UseWildwoodComponentReturn } from './hooks/useWildwoodComponent.js';
export { usePlatformDetection } from './hooks/usePlatformDetection.js';
export type { UsePlatformDetectionReturn } from './hooks/usePlatformDetection.js';
export { useAuthenticationLogic } from './hooks/useAuthenticationLogic.js';
export type {
  AuthView,
  UseAuthenticationLogicOptions,
  UseAuthenticationLogicReturn,
} from './hooks/useAuthenticationLogic.js';
