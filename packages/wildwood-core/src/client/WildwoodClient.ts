// WildwoodClient - main entry point, creates all services with shared config
// Mirrors WildwoodComponents.Blazor/Extensions/ServiceCollectionExtensions.cs

import type { WildwoodConfig } from './types.js';
import { HttpClient } from './httpClient.js';
import { createStorageAdapter } from '../platform/storageService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import { AuthService } from '../auth/authService.js';
import { SessionManager } from '../auth/sessionManager.js';
import { AIService } from '../ai/aiService.js';
import { AIFlowService } from '../ai/aiFlowService.js';
import { DocumentService } from '../documents/documentService.js';
import { MessagingService } from '../messaging/messagingService.js';
import { PaymentService } from '../payment/paymentService.js';
import { NotificationService } from '../notifications/notificationService.js';
import { TwoFactorService } from '../security/twoFactorService.js';
import { CaptchaService } from '../security/captchaService.js';
import { DisclaimerService } from '../features/disclaimerService.js';
import { ConsentService } from '../consent/consentService.js';
import { AppTierService } from '../features/appTierService.js';
import { FeedbackService } from '../feedback/feedbackService.js';
import { ThemeService } from '../theme/themeService.js';

export interface WildwoodClient {
  readonly config: WildwoodConfig;
  readonly http: HttpClient;
  readonly auth: AuthService;
  readonly session: SessionManager;
  readonly ai: AIService;
  readonly aiFlow: AIFlowService;
  readonly documents: DocumentService;
  readonly messaging: MessagingService;
  readonly payment: PaymentService;
  readonly notifications: NotificationService;
  readonly twoFactor: TwoFactorService;
  readonly captcha: CaptchaService;
  readonly disclaimer: DisclaimerService;
  readonly consent: ConsentService;
  readonly appTier: AppTierService;
  readonly feedback: FeedbackService;
  readonly theme: ThemeService;
  readonly events: WildwoodEventEmitter;
  dispose(): void;
}

export function createWildwoodClient(config: WildwoodConfig): WildwoodClient {
  const events = new WildwoodEventEmitter();
  const storage = createStorageAdapter(config.storage);
  const http = new HttpClient(config);
  const auth = new AuthService(http, storage, events, config.appVersion);
  const session = new SessionManager(config, auth, storage, events, http);
  const ai = new AIService(http, config.appId);
  // SSE streams need the raw token (fetch-based transport, not HttpClient)
  const aiFlow = new AIFlowService(config, events, () => session.accessToken);
  // Multipart uploads need the raw token too (FormData, not HttpClient JSON)
  const documents = new DocumentService(config, events, () => session.accessToken);
  const messaging = new MessagingService(http, storage);
  const payment = new PaymentService(http);
  const notifications = new NotificationService();
  const twoFactor = new TwoFactorService(http);
  const captcha = new CaptchaService();
  const disclaimer = new DisclaimerService(http, config.appId ?? '');
  const consent = new ConsentService(http, config.appId ?? '', config.consent);
  const appTier = new AppTierService(http);
  const feedback = new FeedbackService(http, config.appId ?? '');
  const theme = new ThemeService(storage, events);

  return {
    config,
    http,
    auth,
    session,
    ai,
    aiFlow,
    documents,
    messaging,
    payment,
    notifications,
    twoFactor,
    captcha,
    disclaimer,
    consent,
    appTier,
    feedback,
    theme,
    events,
    dispose() {
      session.dispose();
      events.removeAllListeners();
    },
  };
}
