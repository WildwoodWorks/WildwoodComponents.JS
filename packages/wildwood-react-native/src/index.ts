// @wildwood/react-native - Public API

// Provider
export { WildwoodProvider } from './provider/WildwoodProvider';
export type { WildwoodProviderProps } from './provider/WildwoodProvider';
export { WildwoodContext } from './provider/WildwoodContext';

// Hooks
export { useWildwood } from './hooks/useWildwood';
export { useAuth } from './hooks/useAuth';
export type { UseAuthReturn } from './hooks/useAuth';
export { useSession } from './hooks/useSession';
export type { UseSessionReturn } from './hooks/useSession';
export { useNotifications } from './hooks/useNotifications';
export type { UseNotificationsReturn } from './hooks/useNotifications';
export { useNotificationInbox } from './hooks/useNotificationInbox';
export type { UseNotificationInboxOptions, UseNotificationInboxReturn } from './hooks/useNotificationInbox';
export { useNotificationPreferences } from './hooks/useNotificationPreferences';
export type {
  UseNotificationPreferencesOptions,
  UseNotificationPreferencesReturn,
} from './hooks/useNotificationPreferences';
export { useTheme } from './hooks/useTheme';
export type { UseThemeReturn } from './hooks/useTheme';
export { useAI } from './hooks/useAI';
export type { UseAIReturn } from './hooks/useAI';
export { useAIFlow } from './hooks/useAIFlow';
export type { UseAIFlowOptions, UseAIFlowReturn } from './hooks/useAIFlow';
export { useDocuments } from './hooks/useDocuments';
export type { UseDocumentsOptions, UseDocumentsReturn } from './hooks/useDocuments';
export { useAIFlowSubscriptions } from './hooks/useAIFlowSubscriptions';
export type { UseAIFlowSubscriptionsOptions, UseAIFlowSubscriptionsReturn } from './hooks/useAIFlowSubscriptions';
export { useMessaging } from './hooks/useMessaging';
export type { UseMessagingReturn } from './hooks/useMessaging';
export { usePayment } from './hooks/usePayment';
export type { UsePaymentReturn } from './hooks/usePayment';
export { useTwoFactor } from './hooks/useTwoFactor';
export type { UseTwoFactorReturn } from './hooks/useTwoFactor';
export { useDisclaimer } from './hooks/useDisclaimer';
export type { UseDisclaimerReturn } from './hooks/useDisclaimer';
export { useConsent } from './hooks/useConsent';
export type { UseConsentReturn } from './hooks/useConsent';
export { useAttribution } from './hooks/useAttribution';
export type { UseAttributionReturn } from './hooks/useAttribution';
export { useFeedback } from './hooks/useFeedback';
export type { UseFeedbackReturn } from './hooks/useFeedback';
export { useAppTier } from './hooks/useAppTier';
export type { UseAppTierReturn } from './hooks/useAppTier';
export { useCaptcha } from './hooks/useCaptcha';
export type { UseCaptchaReturn } from './hooks/useCaptcha';
export { useWildwoodComponent } from './hooks/useWildwoodComponent';
export type { UseWildwoodComponentReturn } from './hooks/useWildwoodComponent';
export { usePlatformDetection } from './hooks/usePlatformDetection';
export type { UsePlatformDetectionReturn } from './hooks/usePlatformDetection';
export { useExternalApi } from './hooks/useExternalApi';
export type { ExternalApiClient, ExternalApiClientOptions } from './hooks/useExternalApi';
export { useUsageDashboard } from './hooks/useUsageDashboard';
export type { UseUsageDashboardOptions, UseUsageDashboardReturn } from './hooks/useUsageDashboard';
export { useSubscriptionAdmin } from './hooks/useSubscriptionAdmin';
export type { UseSubscriptionAdminReturn } from './hooks/useSubscriptionAdmin';
export { useFeatures, clearFeatureCache, invalidateFeatures } from './hooks/useFeatures';
export type { UseFeaturesReturn } from './hooks/useFeatures';
export { useExpoProviderSignIn } from './hooks/useExpoProviderSignIn';
export type {
  ExpoProviderSignInConfig,
  ExpoGoogleSignInConfig,
  ExpoMicrosoftSignInConfig,
  ExpoProviderSignInCallback,
} from './hooks/useExpoProviderSignIn';
export { useInAppPurchases } from './hooks/useInAppPurchases';
export type {
  UseInAppPurchasesOptions,
  UseInAppPurchasesReturn,
  IapDisplayProduct,
  IapPurchaseState,
} from './hooks/useInAppPurchases';

// ---------------------------------------------------------------------------
// Registration & Subscription — the DOM-free logic layer, shared with the web
// ---------------------------------------------------------------------------

// Reads: the live public catalog, and how the app's settings let a signup screen offer registration.
export {
  usePublicCatalog,
  invalidatePublicCatalog,
  clearPublicCatalogCache,
  seedPublicCatalog,
} from './hooks/usePublicCatalog';
export type { UsePublicCatalogOptions, UsePublicCatalogReturn } from './hooks/usePublicCatalog';
export { useRegistrationMode } from './hooks/useRegistrationMode';
export type { UseRegistrationModeOptions, UseRegistrationModeReturn } from './hooks/useRegistrationMode';
export { useRegistrationSubscription } from './hooks/useRegistrationSubscription';
export type {
  UseRegistrationSubscriptionOptions,
  UseRegistrationSubscriptionReturn,
} from './hooks/useRegistrationSubscription';
export { resolveSignupRegistrationMode } from '@wildwood/react-shared';
export type {
  SignupTokenMode,
  SignupRegistrationMode,
  SignupRegistrationSettings,
  ResolveSignupRegistrationModeOptions,
} from '@wildwood/react-shared';

// The pure state machines behind the signup, pack-checkout and plan-change flows, and the step
// tokens that make a repeated callback a no-op. No React, no client — a host can drive its own UI
// with them.
export { issueStepToken, isCurrentStep } from '@wildwood/react-shared';
export type { StepToken } from '@wildwood/react-shared';
export { signupTransition, initialSignupState, signupPlanNeedsPayment } from '@wildwood/react-shared';
export type {
  SignupStep,
  SignupState,
  SignupEvent,
  SignupSelection,
  SignupTokenGrant,
  SignupPackStatus,
  SignupPackOutcome,
  SignupOutcome,
  SignupOutcomeTier,
  SignupCatalogNames,
  SignupMachineOptions,
  SignupPaymentOrder,
  ResolvedSignupOptions,
} from '@wildwood/react-shared';
export { packCheckoutTransition, initialPackCheckoutState, currentPackCheckoutItem } from '@wildwood/react-shared';
export type {
  PackCheckoutStep,
  PackCheckoutState,
  PackCheckoutEvent,
  PackCheckoutMachineOptions,
} from '@wildwood/react-shared';
export {
  planChangeTransition,
  initialPlanChangeState,
  MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS,
} from '@wildwood/react-shared';
export type {
  PlanChangeStep,
  PlanChangeState,
  PlanChangeEvent,
  PlanChangeMachineOptions,
} from '@wildwood/react-shared';
// The driven plan change itself — preview, confirm, card, change, challenge, complete — as the
// manage view and `SubscriptionAdminComponent` run it. Exported on the web package too, for a host
// that wants the order without the panels.
export { usePlanChangeFlow } from '@wildwood/react-shared';
export type { PlanChangeFlow, PlanChangeFlowOptions } from '@wildwood/react-shared';

// One rule for what "subscribed" means across the panels, and why entitlements changed.
export { grantsAccess, ACCESS_GRANTING_STATUSES } from '@wildwood/react-shared';
export type { EntitlementsChangedReason } from '@wildwood/react-shared';

// Copy: every string the registration + subscription surfaces say, plus the two functions that layer
// a host's overrides onto it and fill its `{placeholder}` slots.
export {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS,
  formatRegistrationSubscriptionLabel,
  resolveRegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
export type { RegistrationSubscriptionLabels } from '@wildwood/react-shared';

// The seam a stack with no payment SDK plugs into (React Native has none in the box: a host wires
// its own, e.g. @stripe/stripe-react-native). Wire it once on `WildwoodProvider`
// (`paymentActionHandler`), or per component through the prop of the same name; `usePaymentActionHandler`
// reads whichever is in force, so a host screen follows the same rule the components do.
export type { PaymentActionAdapter, PaymentActionOutcome } from '@wildwood/react-shared';
export { usePaymentActionHandler, PaymentActionContext } from './provider/PaymentActionContext';
export type { RegistrationSubscriptionError, PricingBilling } from '@wildwood/react-shared';

// Components
export { AuthenticationComponent } from './components/AuthenticationComponent';
export type { AuthenticationComponentProps } from './components/AuthenticationComponent';
export { NotificationComponent } from './components/NotificationComponent';
export type { NotificationComponentProps } from './components/NotificationComponent';
export { NotificationToastComponent } from './components/NotificationToastComponent';
export type { NotificationToastComponentProps } from './components/NotificationToastComponent';
// Backend-connected notification inbox (bell + list + preferences)
export { NotificationsBell } from './components/NotificationsBell';
export type { NotificationsBellProps } from './components/NotificationsBell';
export { NotificationList } from './components/NotificationList';
export type { NotificationListProps } from './components/NotificationList';
export { NotificationPreferences } from './components/NotificationPreferences';
export type { NotificationPreferencesProps } from './components/NotificationPreferences';
export { TwoFactorSettingsComponent } from './components/TwoFactorSettingsComponent';
export type { TwoFactorSettingsComponentProps } from './components/TwoFactorSettingsComponent';
export { DisclaimerComponent } from './components/DisclaimerComponent';
export type { DisclaimerComponentProps } from './components/DisclaimerComponent';
export { ConsentComponent } from './components/ConsentComponent';
export type { ConsentComponentProps } from './components/ConsentComponent';
export { FeedbackComponent } from './components/feedback/FeedbackComponent';
export type { FeedbackComponentProps } from './components/feedback/FeedbackComponent';
export { AppTierComponent } from './components/AppTierComponent';
export type { AppTierComponentProps } from './components/AppTierComponent';
// The payment seam shared by AppTierComponent and SubscriptionAdminComponent
export type { PaymentRequiredArgs, OnPaymentRequired } from './components/subscription/paymentSeam';
export { AIChatComponent } from './components/AIChatComponent';
export type { AIChatComponentProps, AIChatSettings, FilePickerResult } from './components/AIChatComponent';
export { SecureMessagingComponent } from './components/SecureMessagingComponent';
export type { SecureMessagingComponentProps } from './components/SecureMessagingComponent';
export { PaymentComponent } from './components/PaymentComponent';
export type { PaymentComponentProps } from './components/PaymentComponent';
export { PaymentFormComponent } from './components/PaymentFormComponent';
export type { PaymentFormComponentProps } from './components/PaymentFormComponent';
export { InAppPurchaseSheet } from './components/InAppPurchaseSheet';
export type { InAppPurchaseSheetProps } from './components/InAppPurchaseSheet';
export { TokenRegistrationComponent } from './components/TokenRegistrationComponent';
export type { TokenRegistrationComponentProps } from './components/TokenRegistrationComponent';
export { AIProxyComponent } from './components/AIProxyComponent';
export type { AIProxyComponentProps } from './components/AIProxyComponent';
export { AIFlowComponent } from './components/AIFlowComponent';
export type { AIFlowComponentProps } from './components/AIFlowComponent';
export { FeatureGate } from './components/FeatureGate';
export type { FeatureGateProps } from './components/FeatureGate';
export { ErrorBoundary } from './components/ErrorBoundary';
export type { ErrorBoundaryProps } from './components/ErrorBoundary';
export { LoadingSpinner } from './components/LoadingSpinner';
export type { LoadingSpinnerProps } from './components/LoadingSpinner';
export { PricingDisplayComponent } from './components/PricingDisplayComponent';
export type { PricingDisplayComponentProps } from './components/PricingDisplayComponent';
export { UsageDashboardComponent } from './components/UsageDashboardComponent';
export type { UsageDashboardComponentProps } from './components/UsageDashboardComponent';
export { OverageSummaryComponent } from './components/OverageSummaryComponent';
export type { OverageSummaryComponentProps } from './components/OverageSummaryComponent';
export { SignupWithSubscriptionComponent } from './components/SignupWithSubscriptionComponent';
export type { SignupWithSubscriptionComponentProps } from './components/SignupWithSubscriptionComponent';
export { SubscriptionAdminComponent } from './components/subscription/SubscriptionAdminComponent';
export type {
  SubscriptionAdminComponentProps,
  SubscriptionAdminDisplayMode,
} from './components/subscription/SubscriptionAdminComponent';
export { SubscriptionStatusPanel } from './components/subscription/SubscriptionStatusPanel';
export type { SubscriptionStatusPanelProps } from './components/subscription/SubscriptionStatusPanel';
export { FeaturesPanel } from './components/subscription/FeaturesPanel';
export type { FeaturesPanelProps } from './components/subscription/FeaturesPanel';
export { AddOnsPanel } from './components/subscription/AddOnsPanel';
export type { AddOnsPanelProps, AddOnsPanelLabels } from './components/subscription/AddOnsPanel';
export { CancelResultNotice } from './components/subscription/CancelResultNotice';
export type { CancelResultNoticeProps } from './components/subscription/CancelResultNotice';
// Says what a plan change is doing, and - the one thing the web does not need - that a card cannot
// be collected on this stack. Reused by the manage view.
export { PlanChangeNotice } from './components/registrationSubscription/parts/PlanChangeNotice';
export type {
  PlanChangeNoticeProps,
  PlanChangeNoticeContent,
  PlanChangeNoticeKind,
  PlanChangeNoticeOptions,
} from './components/registrationSubscription/parts/PlanChangeNotice';

// Registration & Subscription — one component over three views, and each view on its own for a host
// that would rather pick an import than pass a prop.
export { RegistrationAndSubscriptionComponent } from './components/registrationSubscription/RegistrationAndSubscriptionComponent';
// The pricing surface. The same set the web package exports: the view and its props. `PlanGrid`,
// `PackGrid` and `PricingSkeleton` stay internal there too, so a host builds its own grid from the
// exported catalog helpers rather than from a part that may move.
export { RegistrationSubscriptionPricing } from './components/registrationSubscription/views/RegistrationSubscriptionPricing';
// The signup surface. `ClosedNotice` is exported for a host that wants to say "registration is
// closed" on a screen of its own, exactly as the web package exports it; the rest of the parts
// (`PlanSummaryCard`, `TokenPlanSummary`, `OrderSummary`, `PackCheckout`, `PackOutcomeList`,
// `PackPicker`) stay internal there too.
export { RegistrationSubscriptionSignup } from './components/registrationSubscription/views/RegistrationSubscriptionSignup';
// The manage surface, and the built-in card sheet a plan change uses when the host brought no modal
// of its own — exported on the web package too, for a host that wants it on a screen of its own.
export { RegistrationSubscriptionManage } from './components/registrationSubscription/views/RegistrationSubscriptionManage';
export { PaymentModal } from './components/registrationSubscription/parts/PaymentModal';
export type { PaymentModalProps } from './components/registrationSubscription/parts/PaymentModal';
export { ClosedNotice } from './components/registrationSubscription/parts/ClosedNotice';
export type { ClosedNoticeProps } from './components/registrationSubscription/parts/ClosedNotice';
export type {
  RegistrationSubscriptionView,
  RegistrationSubscriptionCommonProps,
  RegistrationSubscriptionPricingProps,
  RegistrationSubscriptionSignupProps,
  RegistrationSubscriptionManageProps,
  RegistrationAndSubscriptionComponentProps,
  RegistrationClosedInfo,
  PricingSelection,
  PricingPackSelection,
  SignupPlanSelection,
  SignupPlanDefault,
  SignupPackSelection,
  ManageLayout,
  ManageSection,
  AddOnGroup,
  AddOnPresentation,
} from './components/registrationSubscription/types';

export { UsageLimitsPanel } from './components/subscription/UsageLimitsPanel';
export type { UsageLimitsPanelProps } from './components/subscription/UsageLimitsPanel';
export { OverridesPanel } from './components/subscription/OverridesPanel';
export type { OverridesPanelProps } from './components/subscription/OverridesPanel';
export { TierPlansPanel } from './components/subscription/TierPlansPanel';
export type { TierPlansPanelProps, TierSelectedEventArgs } from './components/subscription/TierPlansPanel';

// Tier Card (shared sub-components)
export { TierCard } from './components/tier/TierCard';
export type { TierCardProps } from './components/tier/TierCard';
export { TierCardHeader } from './components/tier/TierCardHeader';
export type { TierCardHeaderProps } from './components/tier/TierCardHeader';
export { TierCardFeatures } from './components/tier/TierCardFeatures';
export type { TierCardFeaturesProps } from './components/tier/TierCardFeatures';
export { TierCardLimits } from './components/tier/TierCardLimits';
export type { TierCardLimitsProps } from './components/tier/TierCardLimits';
export { TierCardFooter } from './components/tier/TierCardFooter';
export type { TierCardFooterProps } from './components/tier/TierCardFooter';

// Styles
export { defaultTheme, themes, woodlandWarm, coolBlue, fallColors, resolveTheme } from './styles/theme';
export type { WildwoodTheme } from './styles/theme';
export { useWildwoodTheme } from './styles/ThemeContext';

// Catalog helpers from @wildwood/core. Pure and UI-free, and the only supported way to turn what
// the server quoted into what a screen shows — a native host building its own plan or pack UI needs
// them alongside the hooks above, and `formatMoney` is what every component here now formats with
// (the older `formatPrice` reads a seven-entry symbol table and quotes everything else in dollars).
export {
  MAX_ADDON_SELECTION,
  CATALOG_QUERY_KEYS,
  buildPublicCatalog,
  resolvePriceOption,
  formatMoney,
  trialLabel,
  parseAddOnIdList,
  selectPacks,
  encodeCatalogSelection,
  decodeCatalogSelection,
} from '@wildwood/core';
export type {
  PublicCatalog,
  BuildPublicCatalogInput,
  CatalogPriceOption,
  PriceOptionQuery,
  CatalogSelection,
  DecodedCatalogSelection,
} from '@wildwood/core';

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
  AppNotification,
  AppNotificationStatus,
  UserNotificationPreference,
  AppTierModel,
  UserTierSubscriptionModel,
  PendingDisclaimersResponse,
  AIChatRequest,
  AIChatResponse,
  AISession,
  AISessionSummary,
  AIConfiguration,
  SpeechTranscriptionResult,
  MessageThread,
  SecureMessage,
  PlatformInfo,
  AppTierPricingModel,
  AppTierAddOnModel,
  UserAddOnSubscriptionModel,
  AppTierLimitStatusModel,
  AppFeatureDefinitionModel,
  RegistrationFormData,
  PaymentCompletionResult,
  IapProductMapping,
  StorePurchase,
  StoreProviderType,
  FeedbackWidgetConfig,
  SubmitFeedbackInput,
  SystemFeedback,
  FeedbackDuplicateCheck,
  FeedbackVoteResult,
} from '@wildwood/core';
