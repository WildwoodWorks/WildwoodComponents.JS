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
  private runSignal?: AbortSignal;
  private dispatcherPromise?: Promise<unknown>;

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

  /**
   * Link a run-level cancellation signal into every request (including task-issued
   * calls through {@link SeederContext.client}). Aborting it cancels in-flight HTTP,
   * so a graceful shutdown does not block on a request until its timeout. The runner
   * sets this at the start of each pass.
   */
  useSignal(signal?: AbortSignal): void {
    this.runSignal = signal;
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
  // The value-returning verbs (get/post/put) throw on an empty body rather than
  // handing back `undefined` cast as T — an empty response where JSON is expected is
  // an error, and a clear message beats a downstream "cannot read properties of
  // undefined". Use getOrDefault / postVoid / putVoid for endpoints that legitimately
  // return no body (404-tolerant reads, 200/204 writes).

  async get<T>(path: string): Promise<T> {
    return this.requireBody(await this.request<T>('GET', path), path);
  }

  /** GET that resolves to undefined on 404 (or an empty body) instead of throwing. */
  getOrDefault<T>(path: string): Promise<T | undefined> {
    return this.request<T>('GET', path, undefined, { allowNotFound: true });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.requireBody(await this.request<T>('POST', path, body ?? null), path);
  }

  /** POST that ignores the (possibly empty) response body. */
  async postVoid(path: string, body?: unknown): Promise<void> {
    await this.request('POST', path, body ?? null);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.requireBody(await this.request<T>('PUT', path, body), path);
  }

  /** PUT that ignores the (possibly empty) response body. */
  async putVoid(path: string, body: unknown): Promise<void> {
    await this.request('PUT', path, body);
  }

  private requireBody<T>(value: T | undefined, path: string): T {
    if (value === undefined) {
      throw new Error(`Empty response body from ${path} (expected JSON).`);
    }
    return value;
  }

  // ---- seeder ledger / history / config ----

  /** Returns undefined when the app has no seeder-configuration row yet (404); the runner then uses option defaults. */
  getSeederConfiguration(appId: string): Promise<SeederConfigurationDto | undefined> {
    return this.getOrDefault<SeederConfigurationDto>(`api/AppComponentConfigurations/${appId}/seeder-configuration`);
  }

  getLedger(appId: string, environment?: string): Promise<SeedTaskLedgerDto[]> {
    let path = `api/AppComponentConfigurations/${appId}/seeder/ledger`;
    if (environment && environment.trim()) {
      path += `?environment=${encodeURIComponent(environment)}`;
    }
    return this.get<SeedTaskLedgerDto[]>(path);
  }

  upsertLedger(appId: string, request: UpsertSeedLedgerRequest): Promise<void> {
    return this.postVoid(`api/AppComponentConfigurations/${appId}/seeder/ledger`, request);
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

    const dispatcher = await this.resolveDispatcher();

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error(`Seeder request timed out after ${this.options.timeoutMs}ms`)),
      this.options.timeoutMs,
    );
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'WildwoodComponents.Seeder/1.0',
      };
      if (this.bearerToken) headers['Authorization'] = `Bearer ${this.bearerToken}`;
      if (this.apiKey) headers['X-API-Key'] = this.apiKey;

      // Combine the per-request timeout with the run-level cancellation signal so a
      // graceful shutdown aborts in-flight HTTP instead of waiting out the timeout.
      const init: RequestInit = { method, headers, signal: combineSignals(controller.signal, this.runSignal) };
      if (body !== undefined || method === 'POST' || method === 'PUT') {
        init.body = body == null ? '{}' : JSON.stringify(body);
      }
      // `dispatcher` is an undici (Node fetch) extension not present on the DOM RequestInit type.
      if (dispatcher) (init as { dispatcher?: unknown }).dispatcher = dispatcher;

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

  /**
   * Lazily build (and memoize) an undici dispatcher that accepts self-signed certs,
   * but only for a loopback HTTPS base URL and only when not explicitly disabled.
   * Returns undefined otherwise (normal cert validation). undici is optional: if it
   * cannot be loaded we warn once and fall back to default validation.
   */
  private resolveDispatcher(): Promise<unknown> {
    if (this.dispatcherPromise) return this.dispatcherPromise;
    this.dispatcherPromise = (async () => {
      if (!this.shouldBypassLoopbackTls()) return undefined;
      try {
        const undici = await import('undici');
        return new undici.Agent({ connect: { rejectUnauthorized: false } });
      } catch (error) {
        this.logger.warn(
          'Loopback dev-cert acceptance needs the optional "undici" package; install it ' +
            'or set NODE_TLS_REJECT_UNAUTHORIZED=0 for local HTTPS seeding.',
          error,
        );
        return undefined;
      }
    })();
    return this.dispatcherPromise;
  }

  /** True only for an https loopback base URL when allowInsecureLoopback is not false. */
  private shouldBypassLoopbackTls(): boolean {
    if (this.options.allowInsecureLoopback === false) return false;
    let url: URL;
    try {
      url = new URL(this.baseUrl);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:') return false;
    const host = url.hostname;
    return host === 'localhost' || host === '::1' || host === '[::1]' || host.startsWith('127.');
  }
}

/**
 * Merge the per-request timeout signal with an optional run-level signal. Prefers
 * AbortSignal.any (Node 20.3+); falls back to whichever is already aborted.
 */
function combineSignals(timeout: AbortSignal, run?: AbortSignal): AbortSignal {
  if (!run) return timeout;
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn([timeout, run]);
  return run.aborted ? run : timeout;
}

/** Build a {@link SeederApiClient} from raw {@link SeederOptions}. */
export function createSeederApiClient(
  options: SeederOptions,
  logger: SeederLogger = consoleSeederLogger,
): SeederApiClient {
  return new SeederApiClient(resolveSeederOptions(options), logger);
}
