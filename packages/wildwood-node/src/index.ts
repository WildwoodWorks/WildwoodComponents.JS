// Middleware
export { createAuthMiddleware } from './middleware/authMiddleware.js';
export type { AuthMiddlewareOptions, WildwoodUser } from './middleware/authMiddleware.js';

export { createProxyMiddleware } from './middleware/proxyMiddleware.js';
export type { ProxyMiddlewareOptions } from './middleware/proxyMiddleware.js';

export { createRateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
export type { RateLimitOptions } from './middleware/rateLimitMiddleware.js';

// Utils
export { decodeToken, isTokenExpired, validateTokenClaims, extractRoles } from './utils/tokenValidator.js';
export type { TokenPayload, TokenValidationOptions } from './utils/tokenValidator.js';

// Admin
export { AdminClient, createAdminClient } from './admin/adminClient.js';
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
  EncryptionStatus,
} from './admin/adminClient.js';
