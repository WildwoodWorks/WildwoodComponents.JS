// Middleware
export { createAuthMiddleware } from './middleware/authMiddleware.js';
export type { AuthMiddlewareOptions, WildwoodUser } from './middleware/authMiddleware.js';

export { createProxyMiddleware } from './middleware/proxyMiddleware.js';
export type { ProxyMiddlewareOptions } from './middleware/proxyMiddleware.js';

export { createFeedbackProxyMiddleware } from './middleware/feedbackProxyMiddleware.js';
export type { FeedbackProxyMiddlewareOptions } from './middleware/feedbackProxyMiddleware.js';

export { createRateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
export type { RateLimitOptions } from './middleware/rateLimitMiddleware.js';

// Utils
export {
  decodeToken,
  decodeTokenHeader,
  isTokenExpired,
  validateTokenClaims,
  verifyToken,
  extractRoles,
} from './utils/tokenValidator.js';
export type { TokenPayload, TokenValidationOptions, TokenVerificationOptions } from './utils/tokenValidator.js';

// JWKS
export { JwksClient, verifyRS256Signature, createJwksClient } from './utils/jwksClient.js';
export type { JwksKey, JwksResponse, JwksClientOptions } from './utils/jwksClient.js';

// Admin
export { AdminClient, createAdminClient } from './admin/adminClient.js';
export type { TierChangePreviewModel } from '@wildwood/core';
export type {
  AdminClientOptions,
  PagedResult,
  AuditLogQuery,
  AuditLogEntry,
  CreateAuditLogRequest,
  ErrorLogQuery,
  ErrorLogEntry,
  SendSmsToUserRequest,
  SendSmsToPhoneRequest,
  SmsLogQuery,
  SmsLogEntry,
  Role,
  AdminUser,
  AdminApp,
  SmsSendResult,
  SmsStats,
  SmsProviderStats,
  SmsMessageTypeStats,
  SmsCostAnalytics,
  SmsCostByProvider,
  SmsCostByMessageType,
  SmsCostTrend,
  AuditSummary,
  TwoFactorUserSummary,
  TwoFactorUserDetails,
  TwoFactorCredential,
  TwoFactorTrustedDevice,
  TwoFactorRecoveryCodeInfo,
  TwoFactorVerificationAttempt,
  TrackingModeResult,
  EncryptionFieldStatus,
  EncryptionStatus,
  FieldMigrationResult,
  EncryptionMigrationResult,
} from './admin/adminClient.js';

// Seeder (server-side app-data seeding harness — port of WildwoodComponents.Shared/Seeder).
// Server-only: no browser/mobile counterpart, so it lives here rather than in @wildwood/core.
export {
  SeederApiClient,
  createSeederApiClient,
  SeederApiError,
  SeederRunner,
  createSeederRunner,
  runSeeder,
  SeederContext,
  SeederTaskResult,
  resolveSeederOptions,
  hasCredentials,
  consoleSeederLogger,
} from './seeder/index.js';
export type {
  SeederTask,
  SeederContextInit,
  SeederOptions,
  ResolvedSeederOptions,
  SeederLogger,
  SeederTaskStatus,
  SeededArtifact,
  SeederRunSummary,
  SeedTaskLedgerDto,
  UpsertSeedLedgerRequest,
  SeedRunHistoryDto,
  RecordSeedRunRequest,
  SeederConfigurationDto,
  SeederLoginResponse,
} from './seeder/index.js';

// Feedback (re-exported from @wildwood/core for direct server-side use).
// The browser-facing widget should go through createFeedbackProxyMiddleware so
// credentials stay server-side; use FeedbackService directly when a server
// process needs to submit/check/vote feedback itself (with a token provider
// configured on the underlying HttpClient).
export { FeedbackService } from '@wildwood/core';
export type {
  FeedbackWidgetConfig,
  FeedbackAttachment,
  FeedbackConsoleEntry,
  FeedbackBrowserContext,
  SubmitFeedbackInput,
  SystemFeedback,
  FeedbackDuplicateCheck,
  FeedbackVoteResult,
} from '@wildwood/core';
