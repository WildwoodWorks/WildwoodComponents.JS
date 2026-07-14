// Seed task contract + the per-pass context threaded through tasks.
// Port of WildwoodComponents.Shared/Seeder/ISeederTask.cs + SeederContext.cs.

import type { SeederApiClient } from './seederApiClient.js';
import type { SeederTaskResult } from './seederModels.js';
import type { SeederLogger } from './seederOptions.js';

/**
 * A single unit of seedable app data (an AI flow, a set of tiers, provider
 * wiring, ...). Tasks must be idempotent — running one whose work is already
 * present should reconcile, not duplicate.
 */
export interface SeederTask {
  /** Stable natural key — the ledger row for this task. e.g. "trailforecast.flow.data-gather". */
  readonly key: string;

  /** Human-readable display name. */
  readonly name: string;

  /** Human note describing what this task seeds and why — recorded in history. */
  readonly note: string;

  /** Bump + redeploy to force this task to re-run on the next startup. */
  readonly version: number;

  /** Keys of tasks that must complete before this one (topologically ordered). */
  readonly dependsOn: readonly string[];

  /** Perform the seeding. Must be idempotent. */
  run(context: SeederContext): Promise<SeederTaskResult>;
}

/** Constructor bag for {@link SeederContext} (built by the runner per attempt). */
export interface SeederContextInit {
  client: SeederApiClient;
  appId: string;
  environment: string;
  resourcesPath?: string;
  dryRun?: boolean;
  sharedState: Map<string, unknown>;
  logger: SeederLogger;
  signal?: AbortSignal;
}

/**
 * State threaded through seed tasks for one seeding pass. The runner supplies a
 * single run-scoped {@link sharedState} map so values written by one task
 * (resolved ids, tool names, ...) are visible to later tasks.
 */
export class SeederContext {
  readonly client: SeederApiClient;
  readonly appId: string;
  readonly environment: string;
  /** Absolute path to a resources directory (templates, prompts). May be empty. */
  readonly resourcesPath: string;
  /** When true, no writes are performed. */
  readonly dryRun: boolean;
  /** Loosely-typed cross-task hand-off. */
  readonly sharedState: Map<string, unknown>;
  /** Cancellation for the current pass, if the host supplied one. */
  readonly signal?: AbortSignal;

  private readonly logger: SeederLogger;

  constructor(init: SeederContextInit) {
    this.client = init.client;
    this.appId = init.appId;
    this.environment = init.environment;
    this.resourcesPath = init.resourcesPath ?? '';
    this.dryRun = init.dryRun ?? false;
    this.sharedState = init.sharedState;
    this.logger = init.logger;
    this.signal = init.signal;
  }

  info(message: string): void {
    this.logger.info(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  /** Log an intended write. Returns true when the write should actually run (false during dry-run). */
  shouldWrite(intent: string): boolean {
    if (this.dryRun) {
      this.logger.info(`[dry-run] would ${intent}`);
      return false;
    }
    this.logger.debug?.(intent);
    return true;
  }
}
