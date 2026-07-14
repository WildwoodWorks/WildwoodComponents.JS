// Typed HTTP client over the WildwoodAPI surface used by seed tasks to
// create/reconcile resources and by the runner to read/write the seed ledger and
// history. Server-side port of WildwoodComponents.Shared/Seeder/SeederApiClient.cs.
// Bearer auth after login, optional X-API-Key, camelCase JSON, and a dry-run
// write guard. Uses global fetch (Node 20+), matching AdminClient.

import {
  resolveSeederOptions,
  consoleSeederLogger,
  type ResolvedSeederOptions,
  type SeederOptions,
  type SeederLogger,
} from './seederOptions.js';
import type {
  SeederConfigurationDto,
  SeedTaskLedgerDto,
  UpsertSeedLedgerRequest,
  SeedRunHistoryDto,
  RecordSeedRunRequest,
  SeederLoginResponse,
} from './seederModels.js';

/** Non-2xx response surfaced with status code and body. */
export class SeederApiError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly responseBody: string;

  constructor(method: string, path: string, status: number, responseBody: string) {
    super(`${method} ${path} failed with ${status}: ${truncate(responseBody)}`);
    this.name = 'SeederApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.responseBody = responseBody;
  }
}

function truncate(s: string): string {
  if (!s || !s.trim()) return '(empty body)';
  return s.length <= 800 ? s : `${s.slice(0, 800)}…`;
}

type HttpMethod = 'GET' | 'POST' | 'PUT';

interface RequestOptions {
  allowNotFound?: boolean;
  isLogin?: boolean;
}

/**
 * Default seeder API client. Generalizes the TrailForecast installer's admin
 * client the same way the .NET SeederApiClient does. Construct via
 * {@link createSeederApiClient}; task code reaches it through
 * `SeederContext.client`.
 */
export class SeederApiClient {
  private readonly baseUrl: string;
  private readonly options: ResolvedSeederOptions;
  private readonly logger: SeederLogger;

  private bearerToken: string | null = null;
  private authenticated = false;
  private loginInFlight: Promise<void> | null = null;

  /** Optional X-API-Key sent with every request. */
  apiKey?: string;

  constructor(options: ResolvedSeederOptions, logger: SeederLogger = consoleSeederLogger) {
    this.options = options;
    this.logger = logger;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  /** The bearer token acquired at login, if any. */
  get token(): string | null {
    return this.bearerToken;
  }

  /** Ensures the client is authenticated (logs in on first call using the configured credentials). */
  async ensureAuthenticated(): Promise<void> {
    if (this.authenticated) return;
    // Coalesce concurrent callers onto a single in-flight login.
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.login();
    try {
      await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  private async login(): Promise<void> {
    if (this.authenticated) return;
    if (!this.options.adminEmail || !this.options.adminPassword) {
      throw new Error(
        'Seeder has no admin credentials. Set adminEmail and adminPassword ' +
          '(a CompanyAdmin service account without 2FA).',
      );
    }

    const body = {
      Username: this.options.adminEmail,
      Email: this.options.adminEmail,
      Password: this.options.adminPassword,
      AppId: this.options.loginAppId,
    };
    const login = await this.request<SeederLoginResponse>('POST', 'api/auth/login', body, { isLogin: true });

    if (login?.requiresTwoFactor) {
      throw new Error(
        'The seeder admin account requires two-factor authentication. Use a CompanyAdmin service account without 2FA.',
      );
    }
    if (!login?.jwtToken) {
      throw new Error('Seeder login succeeded but returned no token.');
    }

    this.bearerToken = login.jwtToken;
    this.authenticated = true;
    this.logger.info(`Seeder authenticated to WildwoodAPI as ${login.email ?? this.options.adminEmail}`);
  }

  // ---- generic verbs (tasks call arbitrary WildwoodAPI endpoints) ----

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path) as Promise<T>;
  }

  /** GET that resolves to undefined on 404 instead of throwing. */
  getOrDefault<T>(path: string): Promise<T | undefined> {
    return this.request<T>('GET', path, undefined, { allowNotFound: true });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? null) as Promise<T>;
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body) as Promise<T>;
  }

  // ---- seeder ledger / history / config ----

  getSeederConfiguration(appId: string): Promise<SeederConfigurationDto> {
    return this.get<SeederConfigurationDto>(`api/AppComponentConfigurations/${appId}/seeder-configuration`);
  }

  getLedger(appId: string, environment?: string): Promise<SeedTaskLedgerDto[]> {
    let path = `api/AppComponentConfigurations/${appId}/seeder/ledger`;
    if (environment && environment.trim()) {
      path += `?environment=${encodeURIComponent(environment)}`;
    }
    return this.get<SeedTaskLedgerDto[]>(path);
  }

  upsertLedger(appId: string, request: UpsertSeedLedgerRequest): Promise<void> {
    return this.post<void>(`api/AppComponentConfigurations/${appId}/seeder/ledger`, request);
  }

  recordRun(appId: string, request: RecordSeedRunRequest): Promise<SeedRunHistoryDto> {
    return this.post<SeedRunHistoryDto>(`api/AppComponentConfigurations/${appId}/seeder/history`, request);
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    { allowNotFound = false, isLogin = false }: RequestOptions = {},
  ): Promise<T | undefined> {
    if (this.options.dryRun && method !== 'GET' && !isLogin) {
      throw new Error(
        `BUG: attempted write (${method} ${path}) during dry-run. ` +
          'Tasks must guard writes with SeederContext.shouldWrite().',
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'WildwoodComponents.Seeder/1.0',
      };
      if (this.bearerToken) headers['Authorization'] = `Bearer ${this.bearerToken}`;
      if (this.apiKey) headers['X-API-Key'] = this.apiKey;

      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined || method === 'POST' || method === 'PUT') {
        init.body = body == null ? '{}' : JSON.stringify(body);
      }

      const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
      const response = await fetch(url, init);
      const text = await response.text().catch(() => '');

      if (allowNotFound && response.status === 404) return undefined;
      if (!response.ok) throw new SeederApiError(method, path, response.status, text);
      if (!text) return undefined;

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Failed to parse response from ${path} as JSON.`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Build a {@link SeederApiClient} from raw {@link SeederOptions}. */
export function createSeederApiClient(
  options: SeederOptions,
  logger: SeederLogger = consoleSeederLogger,
): SeederApiClient {
  return new SeederApiClient(resolveSeederOptions(options), logger);
}
