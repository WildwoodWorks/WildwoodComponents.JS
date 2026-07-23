// Topo-sorting seed runner + the best-effort startup helper.
// Ports WildwoodComponents.Shared/Seeder/SeederRunner.cs and, as runSeeder(),
// the SeederRunnerService BackgroundService + AddWildwoodSeeder DI wiring — Node
// has no hosted-service concept, so the host calls runSeeder() from its boot code.

import { randomUUID } from 'node:crypto';
import { SeederApiClient } from './seederApiClient.js';
import { SeederContext, type SeederTask } from './seederTask.js';
import {
  SeederTaskResult,
  type SeedTaskLedgerDto,
  type SeedRunHistoryDto,
  type SeederRunSummary,
} from './seederModels.js';
import {
  resolveSeederOptions,
  hasCredentials,
  consoleSeederLogger,
  type SeederOptions,
  type ResolvedSeederOptions,
  type SeederLogger,
} from './seederOptions.js';

/**
 * Runs registered seed tasks against WildwoodAPI. Topologically orders tasks by
 * their `dependsOn` edges, consults the server-side ledger to skip already-seeded
 * tasks, runs the rest with bounded retries, and records ledger + history.
 */
export class SeederRunner {
  constructor(
    private readonly client: SeederApiClient,
    private readonly tasks: readonly SeederTask[],
    private readonly options: ResolvedSeederOptions,
    private readonly logger: SeederLogger = consoleSeederLogger,
  ) {}

  private running = false;

  /**
   * Run all pending tasks (those not yet seeded at their current version, or
   * previously failed). Returns a short human-readable summary. Guarded against
   * overlapping passes on the same runner: a concurrent call is ignored (the .NET
   * hosted service ran exactly once per process).
   */
  async runPending(signal?: AbortSignal): Promise<SeederRunSummary> {
    if (this.running) {
      this.logger.warn('Seeder run already in progress on this runner; ignoring the concurrent call.');
      return { ran: 0, skipped: 0, failed: 0, message: 'Seeder already running.' };
    }
    this.running = true;
    // Route every request (including task-issued ones) through the run signal.
    this.client.useSignal?.(signal);
    try {
      return await this.runPendingInner(signal);
    } finally {
      this.running = false;
      this.client.useSignal?.(undefined);
    }
  }

  private async runPendingInner(signal?: AbortSignal): Promise<SeederRunSummary> {
    const ordered = this.topoSort([...this.tasks]);
    if (ordered.length === 0) {
      return { ran: 0, skipped: 0, failed: 0, message: 'No seed tasks registered.' };
    }

    let stopOnFirstFailure = this.options.stopOnFirstFailureDefault;
    let maxAttempts = Math.max(1, this.options.maxAttemptsDefault);
    let retryDelaySeconds = Math.max(0, this.options.retryDelaySecondsDefault);
    const ledger = new Map<string, SeedTaskLedgerDto>();

    if (this.options.dryRun) {
      // A dry-run touches the server not at all — no login (a real auth side effect: audit
      // rows, LastLoginAt), no config/ledger reads. All tasks are treated as pending; their
      // own dry-run guards keep them from writing.
      this.logger.info('Dry-run: skipping authentication and server reads; treating all tasks as pending.');
    } else {
      await this.client.ensureAuthenticated();

      // Server config (enable kill-switch + run knobs); only a PERSISTED row overrides the
      // app's option defaults.
      try {
        const config = await this.client.getSeederConfiguration(this.options.appId);
        if (config && config.enabled === false) {
          this.logger.info(`Seeder is disabled for app ${this.options.appId} (server config). Skipping.`);
          return { ran: 0, skipped: ordered.length, failed: 0, message: 'Seeder disabled via admin configuration.' };
        }
        // The server returns a TRANSIENT default DTO (empty id) when no row has been persisted
        // yet — its knob values are the server's defaults, not an operator's choice.
        if (config && config.id) {
          stopOnFirstFailure = config.stopOnFirstFailure;
          maxAttempts = Math.max(1, config.maxAttempts);
          retryDelaySeconds = Math.max(0, config.retryDelaySeconds);
        } else {
          this.logger.debug?.(
            `No persisted seeder configuration for app ${this.options.appId}; using option defaults.`,
          );
        }
      } catch (error) {
        // Fail CLOSED: the enabled kill-switch lives in this config, so an unreadable config
        // must not be treated as "enabled". Seeding is idempotent and retried next startup.
        this.logger.warn('Could not load seeder configuration; skipping this run (kill-switch state unknown).', error);
        return {
          ran: 0,
          skipped: ordered.length,
          failed: 0,
          message: 'Seeder configuration unavailable; run skipped.',
        };
      }

      // Ledger keyed by task key for this environment.
      try {
        const rows = await this.client.getLedger(this.options.appId, this.options.environment);
        for (const row of rows ?? []) ledger.set(row.taskKey, row);
      } catch (error) {
        this.logger.warn('Could not load seed ledger; treating all tasks as pending.', error);
      }
    }

    const correlationId = randomUUID().replace(/-/g, '');
    // One run-scoped state bag shared by every task's context.
    const sharedState = new Map<string, unknown>();
    let ran = 0;
    let skipped = 0;
    let failed = 0;

    for (const task of ordered) {
      if (signal?.aborted) throw new Error('Seeding cancelled.');

      if (!this.shouldRun(task, ledger)) {
        skipped++;
        this.logger.debug?.(`Seed task '${task.key}' already seeded (v${task.version}); skipping.`);
        continue;
      }

      const { result } = await this.runWithRetries(
        task,
        maxAttempts,
        retryDelaySeconds,
        correlationId,
        sharedState,
        signal,
      );
      if (result.status === 'Failed') {
        failed++;
        this.logger.error(`Seed task '${task.key}' failed: ${result.message}`);
        if (stopOnFirstFailure) {
          this.logger.error(`Aborting seeding: task '${task.key}' failed and stopOnFirstFailure is set.`);
          break;
        }
      } else if (result.status === 'Skipped') {
        // Ran but declined to do work (dry-run, missing prerequisites) — counting it as "run"
        // would make an entirely-unseeded pass look healthy in the summary.
        skipped++;
        this.logger.info(`Seed task '${task.key}' -> Skipped: ${result.message}`);
      } else {
        ran++;
        this.logger.info(`Seed task '${task.key}' -> ${result.status}: ${result.message}`);
      }
    }

    const message = `Seeding complete: ${ran} run, ${skipped} skipped, ${failed} failed.`;
    this.logger.info(message);
    return { ran, skipped, failed, message };
  }

  private shouldRun(task: SeederTask, ledger: ReadonlyMap<string, SeedTaskLedgerDto>): boolean {
    const row = ledger.get(task.key);
    if (!row) return true; // never seeded
    if (row.installedVersion < task.version) return true; // newer content shipped
    if (row.status?.toLowerCase() !== 'success') return true; // last run failed
    return false; // already seeded at this version
  }

  private async runWithRetries(
    task: SeederTask,
    maxAttempts: number,
    retryDelaySeconds: number,
    correlationId: string,
    sharedState: Map<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ result: SeederTaskResult; error?: unknown }> {
    const startedAt = new Date().toISOString();
    let result = SeederTaskResult.failed('Not run');
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const context = new SeederContext({
        client: this.client,
        appId: this.options.appId,
        environment: this.options.environment,
        resourcesPath: this.options.resourcesPath,
        dryRun: this.options.dryRun,
        sharedState,
        logger: this.logger,
        signal,
      });

      try {
        result = await task.run(context);
        lastError = undefined;
        if (result.status !== 'Failed') break;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        result = SeederTaskResult.failed(errorMessage(error));
      }

      if (attempt < maxAttempts) {
        this.logger.warn(
          `Seed task '${task.key}' attempt ${attempt}/${maxAttempts} failed; retrying in ${retryDelaySeconds}s.`,
        );
        await delay(retryDelaySeconds * 1000, signal);
      }
    }

    const completedAt = new Date().toISOString();
    await this.record(task, result, startedAt, completedAt, correlationId);
    return { result, error: lastError };
  }

  private async record(
    task: SeederTask,
    result: SeederTaskResult,
    startedAt: string,
    completedAt: string,
    correlationId: string,
  ): Promise<void> {
    // Dry-run performs no writes at all, including the ledger/history — attempting
    // them would only trip the client's write guard and log misleading warnings.
    if (this.options.dryRun) {
      this.logger.debug?.(`[dry-run] not recording ledger/history for task '${task.key}'.`);
      return;
    }

    // A Skipped result means the task's work was NOT performed (missing prerequisites, ...).
    // Recording nothing keeps the ledger honest (Success@version would suppress the task
    // forever) AND avoids an append-only history row per startup from a perpetual skip; the
    // task simply runs again next boot once it can do real work.
    if (result.status === 'Skipped') {
      return;
    }

    const artifactsJson =
      result.artifacts && result.artifacts.length > 0 ? JSON.stringify(result.artifacts) : undefined;

    let history: SeedRunHistoryDto | undefined;
    try {
      history = await this.client.recordRun(this.options.appId, {
        environment: this.options.environment,
        taskKey: task.key,
        taskName: task.name,
        note: task.note,
        version: task.version,
        status: result.status,
        message: result.message,
        artifactsJson,
        startedAt,
        completedAt,
        runBy: 'system:auto',
        correlationId,
      });
    } catch (error) {
      this.logger.warn(`Failed to record seed history for task '${task.key}'.`, error);
    }

    try {
      await this.client.upsertLedger(this.options.appId, {
        environment: this.options.environment,
        taskKey: task.key,
        taskName: task.name,
        note: task.note,
        installedVersion: task.version,
        status: result.status === 'Failed' ? 'Failed' : 'Success',
        lastRunBy: 'system:auto',
        currentHistoryId: history?.id,
      });
    } catch (error) {
      this.logger.warn(`Failed to upsert seed ledger for task '${task.key}'.`, error);
    }
  }

  /**
   * Kahn topological sort by `dependsOn`, stable in registration order. Unknown
   * deps are ignored (warned); cycles throw; duplicate keys throw.
   */
  private topoSort(tasks: SeederTask[]): SeederTask[] {
    const byKey = new Map<string, SeederTask>();
    const order = new Map<string, number>();
    tasks.forEach((task, index) => {
      if (byKey.has(task.key)) throw new Error(`Duplicate seed task key '${task.key}'.`);
      byKey.set(task.key, task);
      order.set(task.key, index);
    });

    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const task of tasks) {
      indegree.set(task.key, 0);
      dependents.set(task.key, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (!byKey.has(dep)) {
          this.logger.warn(`Seed task '${task.key}' depends on unknown task '${dep}'; ignoring.`);
          continue;
        }
        indegree.set(task.key, (indegree.get(task.key) ?? 0) + 1);
        dependents.get(dep)!.push(task.key);
      }
    }

    const remaining = tasks.map((t) => t.key);
    const result: SeederTask[] = [];
    while (remaining.length > 0) {
      // Pick the ready (indegree 0) task with the lowest registration order — stable.
      let pick: string | null = null;
      for (const key of remaining) {
        if (indegree.get(key) === 0 && (pick === null || order.get(key)! < order.get(pick)!)) {
          pick = key;
        }
      }
      if (pick === null) throw new Error('Seed tasks contain a dependency cycle.');

      remaining.splice(remaining.indexOf(pick), 1);
      result.push(byKey.get(pick)!);
      for (const dependent of dependents.get(pick)!) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      }
    }

    return result;
  }
}

/** Build a {@link SeederRunner} from raw {@link SeederOptions} and the registered tasks. */
export function createSeederRunner(
  options: SeederOptions,
  tasks: readonly SeederTask[],
  logger: SeederLogger = consoleSeederLogger,
): SeederRunner {
  const resolved = resolveSeederOptions(options);
  const client = new SeederApiClient(resolved, logger);
  return new SeederRunner(client, tasks, resolved, logger);
}

/**
 * Best-effort startup seeding — the Node analog of the .NET SeederRunnerService
 * BackgroundService. Honors `runOnStartup`, requires baseUrl/appId/credentials,
 * waits `startupDelayMs`, then runs. Never throws: a WildwoodAPI outage or a
 * failing task leaves data unseeded until the next start rather than crashing the
 * host. Returns the run summary, or null when it did not run.
 *
 * Call it (without awaiting, or fire-and-forget) from your server's bootstrap:
 * ```ts
 * void runSeeder({ baseUrl, appId, adminEmail, adminPassword }, [new MyTask()]);
 * ```
 */
export async function runSeeder(
  options: SeederOptions,
  tasks: readonly SeederTask[],
  logger: SeederLogger = consoleSeederLogger,
  signal?: AbortSignal,
): Promise<SeederRunSummary | null> {
  const resolved = resolveSeederOptions(options);

  // Local hard gate — lets an app disable seeding without a server round trip.
  if (!resolved.runOnStartup) {
    logger.info('Seeder runOnStartup is disabled; not seeding.');
    return null;
  }
  if (!resolved.baseUrl || !resolved.appId) {
    logger.warn('Seeder not configured (baseUrl/appId missing); skipping.');
    return null;
  }
  if (!hasCredentials(resolved)) {
    logger.warn('Seeder has no admin credentials; skipping automatic seeding.');
    return null;
  }

  // Guard against a duplicate startup invocation in the same process (two boot paths,
  // a hot reload). The .NET singleton BackgroundService ran exactly once; here nothing
  // else prevents two overlapping passes from racing the ledger and double-seeding.
  const inFlightKey = `${resolved.baseUrl}|${resolved.appId}|${resolved.environment}`;
  if (inFlightSeeds.has(inFlightKey)) {
    logger.warn(
      `Seeder already running for app ${resolved.appId} (environment '${resolved.environment}'); skipping duplicate invocation.`,
    );
    return null;
  }
  inFlightSeeds.add(inFlightKey);

  try {
    try {
      await delay(resolved.startupDelayMs, signal);
    } catch {
      return null; // aborted during the startup delay
    }

    try {
      const client = new SeederApiClient(resolved, logger);
      const runner = new SeederRunner(client, tasks, resolved, logger);
      logger.info(`Seeder starting for app ${resolved.appId} (environment '${resolved.environment}').`);
      const summary = await runner.runPending(signal);
      logger.info(`Seeder finished: ${summary.message}`);
      return summary;
    } catch (error) {
      if (signal?.aborted) return null; // shutting down
      // Best-effort: never crash the app because seeding failed.
      logger.error('Seeder run failed (non-fatal). Data may be unseeded until next startup.', error);
      return null;
    }
  } finally {
    inFlightSeeds.delete(inFlightKey);
  }
}

/** In-process guard so a second runSeeder() for the same app/environment can't overlap the first. */
const inFlightSeeds = new Set<string>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Abortable delay. Rejects if the signal fires before the timer elapses. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
