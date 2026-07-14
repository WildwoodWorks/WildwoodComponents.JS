// Seeder configuration + logging seam.
// Port of WildwoodComponents.Shared/Seeder/SeederOptions.cs (and the .NET ILogger
// dependency, replaced here by a minimal injectable logger interface).

/**
 * Where the seeder sends its log lines. Defaults to {@link consoleSeederLogger};
 * a host can pass its own (pino, winston, ...) so seeding narrates into app logs.
 */
export interface SeederLogger {
  info(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
  /** Low-signal per-write / per-skip lines. Optional; omit to stay quiet. */
  debug?(message: string): void;
}

/** Console-backed default logger, prefixing every line with `[seeder]`. */
export const consoleSeederLogger: SeederLogger = {
  info: (message) => console.info(`[seeder] ${message}`),
  warn: (message, error) =>
    error === undefined ? console.warn(`[seeder] ${message}`) : console.warn(`[seeder] ${message}`, error),
  error: (message, error) =>
    error === undefined ? console.error(`[seeder] ${message}`) : console.error(`[seeder] ${message}`, error),
  // debug intentionally omitted — quiet by default.
};

/**
 * Configuration for the seeder runner. Supplied by the consuming server app.
 * The seeder authenticates to WildwoodAPI as a CompanyAdmin service account to
 * seed data and record the ledger/history.
 */
export interface SeederOptions {
  /** WildwoodAPI base URL, e.g. https://api.wildwoodworks.io. Determines which environment's backend is seeded. */
  baseUrl: string;
  /** The app id being seeded. */
  appId: string;
  /** Optional X-API-Key sent with requests (only a few admin routes require it). */
  apiKey?: string;
  /** CompanyAdmin service-account email/username used to log in. */
  adminEmail?: string;
  /** CompanyAdmin service-account password. */
  adminPassword?: string;
  /** AppId used for the login call (defaults to {@link appId}). */
  loginAppId?: string;
  /** Environment label recorded in the ledger/history (e.g. "Dev", "Production"). Defaults to "Default". */
  environment?: string;
  /** Local hard gate: when false, {@link runSeeder} performs no seeding regardless of server config. Default true. */
  runOnStartup?: boolean;
  /** When true, no writes are performed (tasks log intended writes only). Default false. */
  dryRun?: boolean;
  /** Absolute path to a resources directory tasks can read (templates, prompts). Optional. */
  resourcesPath?: string;
  /** Delay (ms) before {@link runSeeder} starts, to let the app finish coming up. Default 3000. */
  startupDelayMs?: number;
  /** Per-request timeout (ms). Default 300000 (5 min — MCP tool generation can fetch remote specs). */
  timeoutMs?: number;
  /**
   * Accept self-signed certs for a loopback HTTPS base URL (e.g. https://localhost:5291)
   * so seeding works against a local dev backend — mirrors the .NET client's loopback
   * dev-cert acceptance. Defaults to true for loopback hosts; set false to enforce
   * certificate validation even on localhost. Never relaxes validation for non-loopback
   * hosts. Uses the optional `undici` package; a warning is logged if it is unavailable.
   */
  allowInsecureLoopback?: boolean;
  /** Fallback for stopOnFirstFailure when no server config row exists yet. Default true. */
  stopOnFirstFailureDefault?: boolean;
  /** Fallback max attempts per task when no server config row exists yet. Default 5. */
  maxAttemptsDefault?: number;
  /** Fallback retry delay (seconds) when no server config row exists yet. Default 20. */
  retryDelaySecondsDefault?: number;
}

/** {@link SeederOptions} with every default applied and {@link SeederOptions.loginAppId} resolved. */
export interface ResolvedSeederOptions {
  baseUrl: string;
  appId: string;
  apiKey?: string;
  adminEmail?: string;
  adminPassword?: string;
  loginAppId: string;
  environment: string;
  runOnStartup: boolean;
  dryRun: boolean;
  resourcesPath: string;
  startupDelayMs: number;
  timeoutMs: number;
  stopOnFirstFailureDefault: boolean;
  maxAttemptsDefault: number;
  retryDelaySecondsDefault: number;
  allowInsecureLoopback?: boolean;
}

/** Apply defaults + resolve the effective login app id. Mirrors the .NET SeederOptions property defaults. */
export function resolveSeederOptions(options: SeederOptions): ResolvedSeederOptions {
  const environment = options.environment?.trim() || 'Default';
  const loginAppId = options.loginAppId?.trim() || options.appId;
  return {
    baseUrl: options.baseUrl,
    appId: options.appId,
    apiKey: options.apiKey,
    // Trim the email so the run-gate (hasCredentials) and the login request agree —
    // a padded email must not pass the gate then 401 at login. The password is sent
    // verbatim (it may legitimately contain surrounding characters; matches .NET).
    adminEmail: options.adminEmail?.trim() || undefined,
    adminPassword: options.adminPassword,
    loginAppId,
    environment,
    runOnStartup: options.runOnStartup ?? true,
    dryRun: options.dryRun ?? false,
    resourcesPath: options.resourcesPath ?? '',
    startupDelayMs: options.startupDelayMs ?? 3000,
    timeoutMs: options.timeoutMs ?? 300000,
    stopOnFirstFailureDefault: options.stopOnFirstFailureDefault ?? true,
    maxAttemptsDefault: options.maxAttemptsDefault ?? 5,
    retryDelaySecondsDefault: options.retryDelaySecondsDefault ?? 20,
    allowInsecureLoopback: options.allowInsecureLoopback,
  };
}

/** True when both admin credentials are present. Mirrors the .NET SeederOptions.HasCredentials. */
export function hasCredentials(options: Pick<ResolvedSeederOptions, 'adminEmail' | 'adminPassword'>): boolean {
  return !!options.adminEmail?.trim() && !!options.adminPassword?.trim();
}
