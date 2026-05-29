// Middleware
export { createAuthMiddleware } from './middleware/authMiddleware.js';
export type { AuthMiddlewareOptions, WildwoodUser } from './middleware/authMiddleware.js';

export { createProxyMiddleware } from './middleware/proxyMiddleware.js';
export type { ProxyMiddlewareOptions } from './middleware/proxyMiddleware.js';

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
