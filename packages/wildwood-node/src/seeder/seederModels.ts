// Seeder DTOs and result types.
// Server-side port of WildwoodComponents.Shared/Seeder/SeederModels.cs.
// camelCase to match the WildwoodAPI JSON contract; the ledger/history/config
// DTOs mirror WildwoodAPI DTOs.Seeder. Lives in @wildwood/node (the server SDK,
// alongside AdminClient) — the seeder is a server-side provisioning harness with
// no browser/mobile counterpart, so it is not part of @wildwood/core.

/**
 * Outcome of running a single seed task. Serialized verbatim into the run
 * history (the server stores the PascalCase string), so the values must match
 * the .NET SeederTaskStatus enum names.
 */
export type SeederTaskStatus = 'Created' | 'AlreadyPresent' | 'Updated' | 'Skipped' | 'Failed';

/** A concrete thing a task installed — recorded in history for traceability. */
export interface SeededArtifact {
  entityType: string;
  entityId: string;
  description: string;
}

/**
 * Result of a seed task run. Mirrors the .NET SeederTaskResult record + its
 * static factory methods so task authors write `SeederTaskResult.created(...)`.
 */
export class SeederTaskResult {
  private constructor(
    readonly status: SeederTaskStatus,
    readonly message: string,
    readonly artifacts?: readonly SeededArtifact[],
  ) {}

  /** The task created at least one resource. */
  static created(message: string, artifacts?: readonly SeededArtifact[]): SeederTaskResult {
    return new SeederTaskResult('Created', message, artifacts);
  }

  /** Everything was already in the desired state — a pure no-op. */
  static alreadyPresent(message: string): SeederTaskResult {
    return new SeederTaskResult('AlreadyPresent', message);
  }

  /** Existing resources were reconciled/updated (no creations). */
  static updated(message: string, artifacts?: readonly SeededArtifact[]): SeederTaskResult {
    return new SeederTaskResult('Updated', message, artifacts);
  }

  /** The task was skipped (already seeded at this version). */
  static skipped(message: string): SeederTaskResult {
    return new SeederTaskResult('Skipped', message);
  }

  /** The task failed. */
  static failed(message: string): SeederTaskResult {
    return new SeederTaskResult('Failed', message);
  }

  /** True when the task changed something (Created or Updated). */
  get wroteChanges(): boolean {
    return this.status === 'Created' || this.status === 'Updated';
  }
}

/** Outcome of a seeding pass. */
export interface SeederRunSummary {
  ran: number;
  skipped: number;
  failed: number;
  message: string;
}

// ===== Ledger / history / config DTOs (mirror WildwoodAPI DTOs.Seeder) =====

export interface SeedTaskLedgerDto {
  id: string;
  appId: string;
  environment: string;
  taskKey: string;
  taskName: string;
  note: string;
  installedVersion: number;
  status: string;
  lastRunAt: string;
  lastRunBy?: string | null;
  currentHistoryId?: string | null;
}

export interface UpsertSeedLedgerRequest {
  environment: string;
  taskKey: string;
  taskName: string;
  note: string;
  installedVersion: number;
  status: string;
  lastRunBy?: string | null;
  currentHistoryId?: string | null;
}

export interface SeedRunHistoryDto {
  id: string;
  appId: string;
  environment: string;
  taskKey: string;
  taskName: string;
  note: string;
  version: number;
  status: string;
  message: string;
  artifactsJson?: string | null;
  startedAt: string;
  completedAt?: string | null;
  runBy: string;
  correlationId?: string | null;
  createdAt: string;
}

export interface RecordSeedRunRequest {
  environment: string;
  taskKey: string;
  taskName: string;
  note: string;
  version: number;
  status: string;
  message: string;
  artifactsJson?: string | null;
  startedAt: string;
  completedAt?: string | null;
  runBy: string;
  correlationId?: string | null;
}

export interface SeederConfigurationDto {
  id: string;
  appId: string;
  enabled: boolean;
  stopOnFirstFailure: boolean;
  maxAttempts: number;
  retryDelaySeconds: number;
}

/** Subset of the login (POST api/auth/login) response the seeder consumes. */
export interface SeederLoginResponse {
  id?: string;
  email?: string;
  jwtToken?: string;
  requiresTwoFactor?: boolean;
  requiresPasswordReset?: boolean;
}
