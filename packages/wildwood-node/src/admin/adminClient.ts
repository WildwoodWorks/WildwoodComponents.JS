export interface AdminClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

// Paged result shape matching WildwoodAPI conventions
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// Audit log types
export interface AuditLogQuery {
  companyId?: string;
  appId?: string;
  companyClientId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  searchTerm?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDescending?: boolean;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  oldValues?: string;
  newValues?: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface CreateAuditLogRequest {
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  oldValues?: string;
  newValues?: string;
}

// Error log types
export interface ErrorLogQuery {
  companyId?: string;
  appId?: string;
  userId?: string;
  severity?: string;
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDescending?: boolean;
}

export interface ErrorLogEntry {
  id: string;
  message: string;
  stackTrace?: string;
  severity?: string;
  timestamp: string;
  [key: string]: unknown;
}

// SMS types
export interface SendSmsToUserRequest {
  userId: string;
  phoneNumber?: string;
  message: string;
  messageType?: string;
  appId: string;
}

export interface SendSmsToPhoneRequest {
  phoneNumber: string;
  message: string;
  messageType?: string;
  appId: string;
}

export interface SmsLogQuery {
  companyId?: string;
  appId?: string;
  userId?: string;
  status?: string;
  messageType?: string;
  providerType?: string;
  direction?: string;
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDescending?: boolean;
}

export interface SmsLogEntry {
  id: string;
  phoneNumber: string;
  message: string;
  status: string;
  direction: string;
  timestamp: string;
  [key: string]: unknown;
}

// Role types
export interface Role {
  id: string;
  name: string;
  [key: string]: unknown;
}

// Encryption status
export interface EncryptionStatus {
  [key: string]: unknown;
}

export class AdminClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(options: AdminClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      };

      const options: RequestInit = { method, headers, signal: controller.signal };
      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.baseUrl}${path}`, options);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`API error ${response.status}: ${text || response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return (await response.json()) as T;
      }
      // Non-JSON responses (e.g. 204 No Content) - return void-compatible value
      return undefined as unknown as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildQuery(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  // ── User management ──

  async getUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/users/${encodeURIComponent(userId)}`);
  }

  async getUsers(appId: string, page = 1, pageSize = 20) {
    if (!appId) throw new Error('appId is required');
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/admin/users${this.buildQuery({ appId, page, pageSize })}`,
    );
  }

  async disableUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<void>('POST', `/api/admin/users/${encodeURIComponent(userId)}/disable`);
  }

  async enableUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<void>('POST', `/api/admin/users/${encodeURIComponent(userId)}/enable`);
  }

  // ── App management ──

  async getApp(appId: string) {
    if (!appId) throw new Error('appId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/apps/${encodeURIComponent(appId)}`);
  }

  async getApps() {
    return this.request<Record<string, unknown>[]>('GET', '/api/admin/apps');
  }

  // ── Roles ──

  async getRoles() {
    return this.request<Role[]>('GET', '/api/roles');
  }

  async getRole(roleId: string) {
    if (!roleId) throw new Error('roleId is required');
    return this.request<Role>('GET', `/api/roles/${encodeURIComponent(roleId)}`);
  }

  async getRoleByName(name: string) {
    if (!name) throw new Error('name is required');
    return this.request<Role>('GET', `/api/roles/by-name/${encodeURIComponent(name)}`);
  }

  // ── Audit logs ──

  async queryAuditLogs(query: AuditLogQuery) {
    return this.request<PagedResult<AuditLogEntry>>('POST', '/api/auditlogs/query-paged', query);
  }

  async getAuditLog(id: string) {
    if (!id) throw new Error('id is required');
    return this.request<AuditLogEntry>('GET', `/api/auditlogs/${encodeURIComponent(id)}`);
  }

  async getAuditLogsForUser(userId: string, maxResults = 50) {
    if (!userId) throw new Error('userId is required');
    return this.request<AuditLogEntry[]>(
      'GET',
      `/api/auditlogs/user/${encodeURIComponent(userId)}${this.buildQuery({ maxResults })}`,
    );
  }

  async getAuditLogsForCompany(companyId: string, maxResults = 50) {
    if (!companyId) throw new Error('companyId is required');
    return this.request<AuditLogEntry[]>(
      'GET',
      `/api/auditlogs/company/${encodeURIComponent(companyId)}${this.buildQuery({ maxResults })}`,
    );
  }

  async getAuditSummary(startDate: string, endDate: string, companyId?: string) {
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/auditlogs/summary${this.buildQuery({ startDate, endDate, companyId })}`,
    );
  }

  async getAuditActions() {
    return this.request<string[]>('GET', '/api/auditlogs/actions');
  }

  async createAuditLog(entry: CreateAuditLogRequest) {
    return this.request<void>('POST', '/api/auditlogs', entry);
  }

  // ── Error logs ──

  async queryErrorLogs(query: ErrorLogQuery) {
    return this.request<PagedResult<ErrorLogEntry>>(
      'GET',
      `/api/errorlogs${this.buildQuery(query as Record<string, unknown>)}`,
    );
  }

  async getErrorLog(id: string) {
    if (!id) throw new Error('id is required');
    return this.request<ErrorLogEntry>('GET', `/api/errorlogs/${encodeURIComponent(id)}`);
  }

  // ── SMS ──

  async sendSmsToUser(request: SendSmsToUserRequest) {
    return this.request<Record<string, unknown>>('POST', '/api/admin/sms/send-to-user', request);
  }

  async sendSmsToPhone(request: SendSmsToPhoneRequest) {
    return this.request<Record<string, unknown>>('POST', '/api/admin/sms/send-to-phone', request);
  }

  async resendSms(smsLogId: string) {
    if (!smsLogId) throw new Error('smsLogId is required');
    return this.request<Record<string, unknown>>('POST', `/api/admin/sms/resend/${encodeURIComponent(smsLogId)}`);
  }

  async replySms(smsLogId: string, message: string) {
    if (!smsLogId) throw new Error('smsLogId is required');
    return this.request<Record<string, unknown>>('POST', `/api/admin/sms/reply/${encodeURIComponent(smsLogId)}`, {
      message,
    });
  }

  async getSmsHistory(userId: string, limit = 50) {
    if (!userId) throw new Error('userId is required');
    return this.request<SmsLogEntry[]>(
      'GET',
      `/api/admin/sms/user/${encodeURIComponent(userId)}/history${this.buildQuery({ limit })}`,
    );
  }

  async getSmsConversation(phoneNumber: string, limit = 50) {
    if (!phoneNumber) throw new Error('phoneNumber is required');
    return this.request<SmsLogEntry[]>(
      'GET',
      `/api/admin/sms/conversation/${encodeURIComponent(phoneNumber)}${this.buildQuery({ limit })}`,
    );
  }

  async querySmsLogs(query: SmsLogQuery) {
    return this.request<PagedResult<SmsLogEntry>>(
      'GET',
      `/api/admin/sms-logs${this.buildQuery(query as Record<string, unknown>)}`,
    );
  }

  async getSmsStats(companyId: string, fromDate?: string, toDate?: string) {
    if (!companyId) throw new Error('companyId is required');
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/admin/sms-logs/stats${this.buildQuery({ companyId, fromDate, toDate })}`,
    );
  }

  async getSmsCostAnalytics(
    companyId: string,
    options?: { fromDate?: string; toDate?: string; groupBy?: 'day' | 'week' | 'month' | 'provider' | 'messageType' },
  ) {
    if (!companyId) throw new Error('companyId is required');
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/admin/sms-logs/cost-analytics${this.buildQuery({ companyId, ...options })}`,
    );
  }

  // ── Two-Factor Admin ──

  async getTwoFactorUsers(query?: { pageNumber?: number; pageSize?: number }) {
    return this.request<PagedResult<Record<string, unknown>>>(
      'GET',
      `/api/admin/twofactor/users${this.buildQuery(query ?? {})}`,
    );
  }

  async getTwoFactorUserDetails(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/twofactor/users/${encodeURIComponent(userId)}`);
  }

  // ── App Tier Admin ──

  async getSubscription(appId: string, userId: string) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/app-tiers/${encodeURIComponent(appId)}/subscriptions/${encodeURIComponent(userId)}`,
    );
  }

  async subscribeUserToTier(appId: string, userId: string, tierId: string, pricingId?: string) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    if (!tierId) throw new Error('tierId is required');
    return this.request<Record<string, unknown>>('POST', '/api/app-tiers/subscribe', {
      AppId: appId,
      UserId: userId,
      AppTierId: tierId,
      AppTierPricingId: pricingId,
    });
  }

  async changeUserTier(appId: string, userId: string, newTierId: string, pricingId?: string, immediate = false) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    if (!newTierId) throw new Error('newTierId is required');
    return this.request<Record<string, unknown>>('POST', '/api/app-tiers/change-tier', {
      AppId: appId,
      UserId: userId,
      NewAppTierId: newTierId,
      NewAppTierPricingId: pricingId,
      Immediate: immediate,
    });
  }

  async cancelUserSubscription(appId: string, userId: string) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    return this.request<void>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/cancel/${encodeURIComponent(userId)}`,
    );
  }

  async subscribeCompanyToTier(appId: string, companyId: string, tierId: string, pricingId?: string) {
    if (!appId) throw new Error('appId is required');
    if (!companyId) throw new Error('companyId is required');
    if (!tierId) throw new Error('tierId is required');
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/subscribe/company`,
      { CompanyId: companyId, AppTierId: tierId, AppTierPricingId: pricingId },
    );
  }

  async cancelCompanySubscription(appId: string, companyId: string) {
    if (!appId) throw new Error('appId is required');
    if (!companyId) throw new Error('companyId is required');
    return this.request<void>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/cancel/company/${encodeURIComponent(companyId)}`,
    );
  }

  // ── Add-On Management ──

  async subscribeUserToAddOn(appId: string, userId: string, addOnId: string) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    if (!addOnId) throw new Error('addOnId is required');
    return this.request<void>(
      'POST',
      `/api/app-tier-addons/${encodeURIComponent(appId)}/admin/subscribe-user/${encodeURIComponent(userId)}`,
      { AppTierAddOnId: addOnId },
    );
  }

  async cancelUserAddOn(appId: string, subscriptionId: string) {
    if (!appId) throw new Error('appId is required');
    if (!subscriptionId) throw new Error('subscriptionId is required');
    return this.request<void>(
      'POST',
      `/api/app-tier-addons/${encodeURIComponent(appId)}/admin/cancel-user-addon/${encodeURIComponent(subscriptionId)}`,
    );
  }

  async subscribeCompanyToAddOn(appId: string, companyId: string, addOnId: string) {
    if (!appId) throw new Error('appId is required');
    if (!companyId) throw new Error('companyId is required');
    if (!addOnId) throw new Error('addOnId is required');
    return this.request<void>('POST', `/api/app-tier-addons/${encodeURIComponent(appId)}/subscribe/company`, {
      CompanyId: companyId,
      AppTierAddOnId: addOnId,
    });
  }

  async cancelCompanyAddOn(subscriptionId: string, immediate = false) {
    if (!subscriptionId) throw new Error('subscriptionId is required');
    return this.request<void>(
      'POST',
      `/api/app-tier-addons/subscriptions/${encodeURIComponent(subscriptionId)}/cancel/company${this.buildQuery({ immediate })}`,
    );
  }

  // ── Feature Overrides ──

  async getFeatureOverrides(appId: string, userId?: string) {
    if (!appId) throw new Error('appId is required');
    const query = userId ? this.buildQuery({ userId }) : '';
    return this.request<Record<string, unknown>[]>(
      'GET',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/feature-overrides${query}`,
    );
  }

  async setFeatureOverride(
    appId: string,
    userId: string | null,
    featureCode: string,
    isEnabled: boolean,
    reason?: string,
    expiresAt?: string,
  ) {
    if (!appId) throw new Error('appId is required');
    if (!featureCode) throw new Error('featureCode is required');
    return this.request<void>('POST', `/api/app-tiers/${encodeURIComponent(appId)}/admin/feature-overrides`, {
      UserId: userId,
      FeatureCode: featureCode,
      IsEnabled: isEnabled,
      Reason: reason,
      ExpiresAt: expiresAt,
    });
  }

  async removeFeatureOverride(appId: string, featureCode: string, userId?: string) {
    if (!appId) throw new Error('appId is required');
    if (!featureCode) throw new Error('featureCode is required');
    const query = userId ? this.buildQuery({ userId }) : '';
    return this.request<void>(
      'DELETE',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/feature-overrides/${encodeURIComponent(featureCode)}${query}`,
    );
  }

  // ── Usage Limit Overrides ──

  async updateUsageLimit(appId: string, limitCode: string, newMaxValue: number) {
    if (!appId) throw new Error('appId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'PUT',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/${encodeURIComponent(limitCode)}`,
      { NewMaxValue: newMaxValue },
    );
  }

  async resetUsage(appId: string, limitCode: string) {
    if (!appId) throw new Error('appId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/${encodeURIComponent(limitCode)}/reset`,
    );
  }

  async updateUserUsageLimit(appId: string, userId: string, limitCode: string, newMaxValue: number) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'PUT',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/user/${encodeURIComponent(userId)}/${encodeURIComponent(limitCode)}`,
      { NewMaxValue: newMaxValue },
    );
  }

  async resetUserUsage(appId: string, userId: string, limitCode: string) {
    if (!appId) throw new Error('appId is required');
    if (!userId) throw new Error('userId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/user/${encodeURIComponent(userId)}/${encodeURIComponent(limitCode)}/reset`,
    );
  }

  async updateCompanyUsageLimit(appId: string, companyId: string, limitCode: string, newMaxValue: number) {
    if (!appId) throw new Error('appId is required');
    if (!companyId) throw new Error('companyId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'PUT',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/company/${encodeURIComponent(companyId)}/${encodeURIComponent(limitCode)}`,
      { NewMaxValue: newMaxValue },
    );
  }

  async resetCompanyUsage(appId: string, companyId: string, limitCode: string) {
    if (!appId) throw new Error('appId is required');
    if (!companyId) throw new Error('companyId is required');
    if (!limitCode) throw new Error('limitCode is required');
    return this.request<void>(
      'POST',
      `/api/app-tiers/${encodeURIComponent(appId)}/admin/usage-limits/company/${encodeURIComponent(companyId)}/${encodeURIComponent(limitCode)}/reset`,
    );
  }

  // ── App Tier Tracking ──

  async getTrackingMode(appId: string) {
    if (!appId) throw new Error('appId is required');
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/app-tiers/${encodeURIComponent(appId)}/settings/tracking-mode`,
    );
  }

  // ── Data Encryption ──

  async getEncryptionStatus() {
    return this.request<EncryptionStatus>('GET', '/api/admin/dataencryption/status');
  }

  async migrateAllEncryption(dryRun = true) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/admin/dataencryption/migrate-all${this.buildQuery({ dryRun })}`,
    );
  }

  async migrateTotpSecrets(dryRun = true) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/admin/dataencryption/migrate-totp-secrets${this.buildQuery({ dryRun })}`,
    );
  }

  async migrateAiProviderKeys(dryRun = true) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/admin/dataencryption/migrate-ai-provider-keys${this.buildQuery({ dryRun })}`,
    );
  }

  async migratePaymentProviderSecrets(dryRun = true) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/admin/dataencryption/migrate-payment-provider-secrets${this.buildQuery({ dryRun })}`,
    );
  }
}

export function createAdminClient(options: AdminClientOptions): AdminClient {
  return new AdminClient(options);
}
