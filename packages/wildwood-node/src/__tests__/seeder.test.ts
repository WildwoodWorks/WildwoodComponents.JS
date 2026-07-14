import { describe, it, expect, vi } from 'vitest';
import {
  SeederRunner,
  SeederApiClient,
  createSeederApiClient,
  createSeederRunner,
  runSeeder,
  SeederContext,
  SeederTaskResult,
  resolveSeederOptions,
  hasCredentials,
  type SeederTask,
  type SeederConfigurationDto,
  type SeedTaskLedgerDto,
  type SeederLogger,
} from '../seeder/index.js';

const silentLogger: SeederLogger = { info() {}, warn() {}, error() {}, debug() {} };

const baseOptions = {
  baseUrl: 'https://api.example.com',
  appId: 'app-1',
  adminEmail: 'seeder@example.com',
  adminPassword: 'secret',
};

/** Minimal fake client that records seeded task keys and never touches the network. */
function makeFakeClient(overrides: Partial<Record<keyof SeederApiClient, unknown>> = {}) {
  const recordedLedger: string[] = [];
  const config: SeederConfigurationDto = {
    id: 'cfg',
    appId: 'app-1',
    enabled: true,
    stopOnFirstFailure: true,
    maxAttempts: 1,
    retryDelaySeconds: 0,
  };
  const client = {
    ensureAuthenticated: vi.fn(async () => {}),
    getSeederConfiguration: vi.fn(async () => config),
    getLedger: vi.fn(async (): Promise<SeedTaskLedgerDto[]> => []),
    recordRun: vi.fn(async () => ({ id: 'hist-1' })),
    upsertLedger: vi.fn(async (_appId: string, req: { taskKey: string }) => {
      recordedLedger.push(req.taskKey);
    }),
    ...overrides,
  } as unknown as SeederApiClient;
  return { client, recordedLedger, config };
}

function makeTask(
  key: string,
  dependsOn: string[],
  ran: string[],
  opts: { version?: number; run?: (ctx: SeederContext) => Promise<SeederTaskResult> } = {},
): SeederTask {
  return {
    key,
    name: key,
    note: `seeds ${key}`,
    version: opts.version ?? 1,
    dependsOn,
    run:
      opts.run ??
      (async () => {
        ran.push(key);
        return SeederTaskResult.created(`did ${key}`);
      }),
  };
}

describe('SeederTaskResult', () => {
  it('created/updated report wroteChanges; others do not', () => {
    expect(SeederTaskResult.created('c').wroteChanges).toBe(true);
    expect(SeederTaskResult.updated('u').wroteChanges).toBe(true);
    expect(SeederTaskResult.alreadyPresent('a').wroteChanges).toBe(false);
    expect(SeederTaskResult.skipped('s').wroteChanges).toBe(false);
    expect(SeederTaskResult.failed('f').wroteChanges).toBe(false);
  });

  it('carries the correct status strings (match the server contract)', () => {
    expect(SeederTaskResult.created('c').status).toBe('Created');
    expect(SeederTaskResult.alreadyPresent('a').status).toBe('AlreadyPresent');
    expect(SeederTaskResult.failed('f').status).toBe('Failed');
  });
});

describe('resolveSeederOptions', () => {
  it('applies defaults', () => {
    const r = resolveSeederOptions({ baseUrl: 'x', appId: 'a' });
    expect(r.environment).toBe('Default');
    expect(r.runOnStartup).toBe(true);
    expect(r.dryRun).toBe(false);
    expect(r.startupDelayMs).toBe(3000);
    expect(r.maxAttemptsDefault).toBe(5);
    expect(r.retryDelaySecondsDefault).toBe(20);
  });

  it('defaults loginAppId to appId but honors an explicit value', () => {
    expect(resolveSeederOptions({ baseUrl: 'x', appId: 'a' }).loginAppId).toBe('a');
    expect(resolveSeederOptions({ baseUrl: 'x', appId: 'a', loginAppId: 'b' }).loginAppId).toBe('b');
  });

  it('hasCredentials requires both email and password', () => {
    expect(hasCredentials({ adminEmail: 'a@b.c', adminPassword: 'p' })).toBe(true);
    expect(hasCredentials({ adminEmail: 'a@b.c', adminPassword: '' })).toBe(false);
    expect(hasCredentials({ adminEmail: undefined, adminPassword: 'p' })).toBe(false);
  });
});

describe('SeederContext', () => {
  const resolved = resolveSeederOptions(baseOptions);

  it('shouldWrite returns true when not dry-run', () => {
    const ctx = new SeederContext({
      client: {} as SeederApiClient,
      appId: 'app-1',
      environment: 'Default',
      dryRun: false,
      sharedState: new Map(),
      logger: silentLogger,
    });
    expect(ctx.shouldWrite('create tier')).toBe(true);
  });

  it('shouldWrite returns false during dry-run', () => {
    const ctx = new SeederContext({
      client: {} as SeederApiClient,
      appId: 'app-1',
      environment: 'Default',
      dryRun: true,
      sharedState: new Map(),
      logger: silentLogger,
    });
    expect(ctx.shouldWrite('create tier')).toBe(false);
  });

  it('sharedState is threaded (identity map)', () => {
    const shared = new Map<string, unknown>();
    const ctx = new SeederContext({
      client: {} as SeederApiClient,
      appId: resolved.appId,
      environment: resolved.environment,
      sharedState: shared,
      logger: silentLogger,
    });
    ctx.sharedState.set('k', 'v');
    expect(shared.get('k')).toBe('v');
  });
});

describe('SeederApiClient', () => {
  it('createSeederApiClient returns an instance', () => {
    expect(createSeederApiClient(baseOptions)).toBeInstanceOf(SeederApiClient);
  });

  it('ensureAuthenticated throws without credentials', async () => {
    const client = createSeederApiClient({ baseUrl: 'x', appId: 'a' }, silentLogger);
    await expect(client.ensureAuthenticated()).rejects.toThrow(/no admin credentials/i);
  });

  it('blocks writes during dry-run before hitting the network', async () => {
    const client = createSeederApiClient({ ...baseOptions, dryRun: true }, silentLogger);
    await expect(client.post('api/app-tiers/subscribe', { a: 1 })).rejects.toThrow(/dry-run/i);
    await expect(client.put('api/x', {})).rejects.toThrow(/dry-run/i);
  });
});

describe('SeederRunner.runPending', () => {
  it('returns early when no tasks are registered', async () => {
    const { client } = makeFakeClient();
    const runner = new SeederRunner(client, [], resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(summary).toEqual({ ran: 0, skipped: 0, failed: 0, message: 'No seed tasks registered.' });
  });

  it('runs tasks in dependency order (stable Kahn)', async () => {
    const ran: string[] = [];
    const { client } = makeFakeClient();
    // Registration order c, a, b; a depends on b, b depends on c => c, b, a.
    const tasks = [makeTask('c', [], ran), makeTask('a', ['b'], ran), makeTask('b', ['c'], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(ran).toEqual(['c', 'b', 'a']);
    expect(summary.ran).toBe(3);
    expect(summary.failed).toBe(0);
  });

  it('skips tasks already seeded at their version', async () => {
    const ran: string[] = [];
    const ledgerRow: SeedTaskLedgerDto = {
      id: 'l1',
      appId: 'app-1',
      environment: 'Default',
      taskKey: 'seeded',
      taskName: 'seeded',
      note: '',
      installedVersion: 1,
      status: 'Success',
      lastRunAt: '2026-07-13T00:00:00Z',
    };
    const { client } = makeFakeClient({ getLedger: vi.fn(async () => [ledgerRow]) });
    const tasks = [makeTask('seeded', [], ran, { version: 1 }), makeTask('fresh', [], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(ran).toEqual(['fresh']);
    expect(summary.skipped).toBe(1);
    expect(summary.ran).toBe(1);
  });

  it('re-runs a task when a newer version shipped', async () => {
    const ran: string[] = [];
    const ledgerRow: SeedTaskLedgerDto = {
      id: 'l1',
      appId: 'app-1',
      environment: 'Default',
      taskKey: 'bumped',
      taskName: 'bumped',
      note: '',
      installedVersion: 1,
      status: 'Success',
      lastRunAt: '2026-07-13T00:00:00Z',
    };
    const { client } = makeFakeClient({ getLedger: vi.fn(async () => [ledgerRow]) });
    const tasks = [makeTask('bumped', [], ran, { version: 2 })];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(ran).toEqual(['bumped']);
    expect(summary.ran).toBe(1);
  });

  it('stops on the first failure when stopOnFirstFailure is set', async () => {
    const ran: string[] = [];
    const { client } = makeFakeClient();
    const tasks = [
      makeTask('ok', [], ran),
      makeTask('boom', [], ran, {
        run: async () => {
          ran.push('boom');
          return SeederTaskResult.failed('kaboom');
        },
      }),
      makeTask('never', ['boom'], ran),
    ];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(ran).toEqual(['ok', 'boom']);
    expect(summary.failed).toBe(1);
    expect(ran).not.toContain('never');
  });

  it('records ledger + history for each task it runs', async () => {
    const ran: string[] = [];
    const { client, recordedLedger } = makeFakeClient();
    const tasks = [makeTask('one', [], ran), makeTask('two', ['one'], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    await runner.runPending();
    expect(client.recordRun).toHaveBeenCalledTimes(2);
    expect(recordedLedger).toEqual(['one', 'two']);
  });

  it('throws on a dependency cycle', async () => {
    const ran: string[] = [];
    const { client } = makeFakeClient();
    const tasks = [makeTask('x', ['y'], ran), makeTask('y', ['x'], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    await expect(runner.runPending()).rejects.toThrow(/cycle/i);
  });

  it('throws on duplicate task keys', async () => {
    const ran: string[] = [];
    const { client } = makeFakeClient();
    const tasks = [makeTask('dup', [], ran), makeTask('dup', [], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    await expect(runner.runPending()).rejects.toThrow(/duplicate/i);
  });

  it('honors the server enabled=false kill switch', async () => {
    const ran: string[] = [];
    const disabled: SeederConfigurationDto = {
      id: 'cfg',
      appId: 'app-1',
      enabled: false,
      stopOnFirstFailure: true,
      maxAttempts: 1,
      retryDelaySeconds: 0,
    };
    const { client } = makeFakeClient({ getSeederConfiguration: vi.fn(async () => disabled) });
    const tasks = [makeTask('t', [], ran)];
    const runner = new SeederRunner(client, tasks, resolveSeederOptions(baseOptions), silentLogger);
    const summary = await runner.runPending();
    expect(ran).toEqual([]);
    expect(summary.message).toMatch(/disabled/i);
  });
});

describe('createSeederRunner', () => {
  it('returns a SeederRunner', () => {
    expect(createSeederRunner(baseOptions, [], silentLogger)).toBeInstanceOf(SeederRunner);
  });
});

describe('runSeeder (startup helper)', () => {
  it('does not run when runOnStartup is false', async () => {
    const summary = await runSeeder({ ...baseOptions, runOnStartup: false }, [], silentLogger);
    expect(summary).toBeNull();
  });

  it('does not run without credentials', async () => {
    const summary = await runSeeder({ baseUrl: 'x', appId: 'a', startupDelayMs: 0 }, [], silentLogger);
    expect(summary).toBeNull();
  });

  it('does not run when baseUrl is missing', async () => {
    const summary = await runSeeder({ baseUrl: '', appId: 'a', adminEmail: 'e', adminPassword: 'p' }, [], silentLogger);
    expect(summary).toBeNull();
  });
});
