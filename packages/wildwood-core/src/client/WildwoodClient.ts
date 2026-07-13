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
import { AIFlowSubscriptionService } from '../ai/aiFlowSubscriptionService.js';
import { DocumentService } from '../documents/documentService.js';
import { MessagingService } from '../messaging/messagingService.js';
import { PaymentService } from '../payment/paymentService.js';
import { NotificationService } from '../notifications/notificationService.js';
import { NotificationInboxService } from '../notifications/notificationInboxService.js';
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
  readonly aiFlowSubscription: AIFlowSubscriptionService;
  readonly documents: DocumentService;
  readonly messaging: MessagingService;
  readonly payment: PaymentService;
  readonly notifications: NotificationService;
  /** Backend-connected notification inbox (bell + list + preferences). Distinct from `notifications` (toast queue). */
  readonly notificationInbox: NotificationInboxService;
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
  // Reactive 401 handling (Blazor parity): on 401, refresh token and replay once —
  // same wiring SessionManager applies to the HttpClient.
  aiFlow.setOn401Refresh(() => session.refreshToken());
  // Plain JSON standing-orders surface — raw token, one-shot 401, no SSE/refresh-retry.
  const aiFlowSubscription = new AIFlowSubscriptionService(config, events, () => session.accessToken);
  // Multipart uploads need the raw token too (FormData, not HttpClient JSON)
  const documents = new DocumentService(config, events, () => session.accessToken);
  const messaging = new MessagingService(http, storage);
  const payment = new PaymentService(http);
  const notifications = new NotificationService();
  // Backend-connected inbox needs the raw token (fetch transport, one-shot 401), like DocumentService.
  const notificationInbox = new NotificationInboxService(config, events, () => session.accessToken);
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
    aiFlowSubscription,
    documents,
    messaging,
    payment,
    notifications,
    notificationInbox,
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
