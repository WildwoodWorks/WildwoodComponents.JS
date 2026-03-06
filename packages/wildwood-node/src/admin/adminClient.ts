export interface AdminClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
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
        return await response.json() as T;
      }
      // Non-JSON responses (e.g. 204 No Content) - return void-compatible value
      return undefined as unknown as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // User management
  async getUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/users/${encodeURIComponent(userId)}`);
  }

  async getUsers(appId: string, page = 1, pageSize = 20) {
    if (!appId) throw new Error('appId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/users?appId=${encodeURIComponent(appId)}&page=${page}&pageSize=${pageSize}`);
  }

  async disableUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<void>('POST', `/api/admin/users/${encodeURIComponent(userId)}/disable`);
  }

  async enableUser(userId: string) {
    if (!userId) throw new Error('userId is required');
    return this.request<void>('POST', `/api/admin/users/${encodeURIComponent(userId)}/enable`);
  }

  // App management
  async getApp(appId: string) {
    if (!appId) throw new Error('appId is required');
    return this.request<Record<string, unknown>>('GET', `/api/admin/apps/${encodeURIComponent(appId)}`);
  }

  async getApps() {
    return this.request<Record<string, unknown>[]>('GET', '/api/admin/apps');
  }
}

export function createAdminClient(options: AdminClientOptions): AdminClient {
  return new AdminClient(options);
}
