// WildwoodClient - main entry point, creates all services with shared config
// Mirrors WildwoodComponents.Blazor/Extensions/ServiceCollectionExtensions.cs

import type { WildwoodConfig } from './types.js';
import { HttpClient } from './httpClient.js';
import { createStorageAdapter } from '../platform/storageService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import { AuthService } from '../auth/authService.js';
import { SessionManager } from '../auth/sessionManager.js';
import { AIService } from '../ai/aiService.js';
import { MessagingService } from '../messaging/messagingService.js';
import { PaymentService, SubscriptionService } from '../payment/paymentService.js';
import { NotificationService } from '../notifications/notificationService.js';
import { TwoFactorService } from '../security/twoFactorService.js';
import { CaptchaService } from '../security/captchaService.js';
import { DisclaimerService } from '../features/disclaimerService.js';
import { AppTierService } from '../features/appTierService.js';
import { ThemeService } from '../theme/themeService.js';

export interface WildwoodClient {
  readonly config: WildwoodConfig;
  readonly http: HttpClient;
  readonly auth: AuthService;
  readonly session: SessionManager;
  readonly ai: AIService;
  readonly messaging: MessagingService;
  readonly payment: PaymentService;
  readonly subscription: SubscriptionService;
  readonly notifications: NotificationService;
  readonly twoFactor: TwoFactorService;
  readonly captcha: CaptchaService;
  readonly disclaimer: DisclaimerService;
  readonly appTier: AppTierService;
  readonly theme: ThemeService;
  readonly events: WildwoodEventEmitter;
  dispose(): void;
}

export function createWildwoodClient(config: WildwoodConfig): WildwoodClient {
  const events = new WildwoodEventEmitter();
  const storage = createStorageAdapter(config.storage);
  const http = new HttpClient(config);
  const auth = new AuthService(http, storage, events);
  const session = new SessionManager(config, auth, storage, events, http);
  const ai = new AIService(http);
  const messaging = new MessagingService(http, storage);
  const payment = new PaymentService(http);
  const subscription = new SubscriptionService(http);
  const notifications = new NotificationService();
  const twoFactor = new TwoFactorService(http);
  const captcha = new CaptchaService();
  const disclaimer = new DisclaimerService(http);
  const appTier = new AppTierService(http);
  const theme = new ThemeService(storage, events);

  return {
    config,
    http,
    auth,
    session,
    ai,
    messaging,
    payment,
    subscription,
    notifications,
    twoFactor,
    captcha,
    disclaimer,
    appTier,
    theme,
    events,
    dispose() {
      session.dispose();
      events.removeAllListeners();
    },
  };
}
