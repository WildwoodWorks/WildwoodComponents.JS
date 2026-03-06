import { describe, it, expect } from 'vitest';
import * as WildwoodReact from '../index.js';

describe('@wildwood/react exports', () => {
  // Provider
  it('exports WildwoodProvider', () => { expect(WildwoodReact.WildwoodProvider).toBeDefined(); });

  // Hooks
  it('exports useWildwood', () => { expect(WildwoodReact.useWildwood).toBeDefined(); });
  it('exports useAuth', () => { expect(WildwoodReact.useAuth).toBeDefined(); });
  it('exports useSession', () => { expect(WildwoodReact.useSession).toBeDefined(); });
  it('exports useAI', () => { expect(WildwoodReact.useAI).toBeDefined(); });
  it('exports useAIFlow', () => { expect(WildwoodReact.useAIFlow).toBeDefined(); });
  it('exports useMessaging', () => { expect(WildwoodReact.useMessaging).toBeDefined(); });
  it('exports usePayment', () => { expect(WildwoodReact.usePayment).toBeDefined(); });
  it('exports useSubscription', () => { expect(WildwoodReact.useSubscription).toBeDefined(); });
  it('exports useTwoFactor', () => { expect(WildwoodReact.useTwoFactor).toBeDefined(); });
  it('exports useDisclaimer', () => { expect(WildwoodReact.useDisclaimer).toBeDefined(); });
  it('exports useAppTier', () => { expect(WildwoodReact.useAppTier).toBeDefined(); });
  it('exports useNotifications', () => { expect(WildwoodReact.useNotifications).toBeDefined(); });
  it('exports useTheme', () => { expect(WildwoodReact.useTheme).toBeDefined(); });
  it('exports useCaptcha', () => { expect(WildwoodReact.useCaptcha).toBeDefined(); });
  it('exports useWildwoodComponent', () => { expect(WildwoodReact.useWildwoodComponent).toBeDefined(); });
  it('exports usePlatformDetection', () => { expect(WildwoodReact.usePlatformDetection).toBeDefined(); });

  // Components
  it('exports AuthenticationComponent', () => { expect(WildwoodReact.AuthenticationComponent).toBeDefined(); });
  it('exports AIChatComponent', () => { expect(WildwoodReact.AIChatComponent).toBeDefined(); });
  it('exports AIProxyComponent', () => { expect(WildwoodReact.AIProxyComponent).toBeDefined(); });
  it('exports SecureMessagingComponent', () => { expect(WildwoodReact.SecureMessagingComponent).toBeDefined(); });
  it('exports PaymentComponent', () => { expect(WildwoodReact.PaymentComponent).toBeDefined(); });
  it('exports PaymentFormComponent', () => { expect(WildwoodReact.PaymentFormComponent).toBeDefined(); });
  it('exports SubscriptionComponent', () => { expect(WildwoodReact.SubscriptionComponent).toBeDefined(); });
  it('exports SubscriptionManagerComponent', () => { expect(WildwoodReact.SubscriptionManagerComponent).toBeDefined(); });
  it('exports NotificationComponent', () => { expect(WildwoodReact.NotificationComponent).toBeDefined(); });
  it('exports NotificationToastComponent', () => { expect(WildwoodReact.NotificationToastComponent).toBeDefined(); });
  it('exports TwoFactorSettingsComponent', () => { expect(WildwoodReact.TwoFactorSettingsComponent).toBeDefined(); });
  it('exports DisclaimerComponent', () => { expect(WildwoodReact.DisclaimerComponent).toBeDefined(); });
  it('exports AppTierComponent', () => { expect(WildwoodReact.AppTierComponent).toBeDefined(); });
  it('exports TokenRegistrationComponent', () => { expect(WildwoodReact.TokenRegistrationComponent).toBeDefined(); });
  it('exports LoadingSpinner', () => { expect(WildwoodReact.LoadingSpinner).toBeDefined(); });
  it('exports ErrorBoundary', () => { expect(WildwoodReact.ErrorBoundary).toBeDefined(); });
});
