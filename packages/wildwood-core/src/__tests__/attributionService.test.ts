import { describe, it, expect, vi, afterEach } from 'vitest';
import { AttributionService } from '../attribution/attributionService.js';
import {
  ATTRIBUTION_STORAGE_KEY,
  type AttributionConsentSource,
  type AttributionTouch,
  type PublicAttributionConfig,
} from '../attribution/types.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { ConsentCategory, ConsentState } from '../consent/types.js';
import type { HttpClient } from '../client/httpClient.js';

const LANDING = 'https://cairnfed.ai/?utm_source=Reddit&utm_medium=paid&utm_campaign=govcon-test-sep26&utm_content=ad1';
const DAY_MS = 24 * 60 * 60 * 1000;

function makeConfig(overrides: Partial<PublicAttributionConfig> = {}): PublicAttributionConfig {
  return {
    appId: 'app-1',
    isEnabled: true,
    captureFirstTouch: true,
    captureLastTouch: true,
    attributionWindowDays: 30,
    persistenceConsentCategory: 'Analytics',
    captureClickIds: true,
    captureReferrer: true,
    extraAllowedParamNames: [],
    beaconEnabled: false,
    ...overrides,
  };
}

function makeHttp(config: PublicAttributionConfig | 'fail') {
  const posts: Array<{ path: string; body: unknown }> = [];
  const get = vi.fn(async () => {
    if (config === 'fail') throw new Error('network down');
    return { data: config, status: 200, headers: {} };
  });
  const post = vi.fn(async (path: string, body: unknown) => {
    posts.push({ path, body });
    return { data: undefined, status: 202, headers: {} };
  });
  return { http: { get, post } as unknown as HttpClient, get, posts };
}

function makeConsentState(granted: boolean, decided: boolean): ConsentState {
  return {
    visitorKey: 'consent-visitor',
    categories: {
      StrictlyNecessary: true,
      Functional: false,
      Analytics: granted,
      Advertising: false,
      Sensitive: false,
    },
    configVersion: 1,
    decided,
    gpcPresent: false,
  };
}

function makeConsent(options: { granted?: boolean; decided?: boolean; initialized?: boolean } = {}) {
  let granted = options.granted ?? false;
  let state: ConsentState | null =
    options.initialized === false ? null : makeConsentState(granted, options.decided ?? false);
  const listeners = new Set<(s: ConsentState) => void>();
  const consent: AttributionConsentSource = {
    isGranted: (category: ConsentCategory) => category === 'StrictlyNecessary' || granted,
    getState: () => state,
    onConsentChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    consent,
    decide(grant: boolean) {
      granted = grant;
      state = makeConsentState(grant, true);
      for (const listener of listeners) listener(state);
    },
    listenerCount: () => listeners.size,
  };
}

function makeService(
  options: {
    config?: PublicAttributionConfig | 'fail';
    consent?: ReturnType<typeof makeConsent>;
    storage?: MemoryStorageAdapter;
    events?: WildwoodEventEmitter;
  } = {},
) {
  const httpParts = makeHttp(options.config ?? makeConfig());
  const consent = options.consent ?? makeConsent({ granted: true, decided: true });
  const storage = options.storage ?? new MemoryStorageAdapter();
  const events = options.events ?? new WildwoodEventEmitter();
  const service = new AttributionService(httpParts.http, storage, consent.consent, events, 'app-1', {
    platform: 'web',
  });
  return { service, storage, consent, events, ...httpParts };
}

function stubLanding(href: string, referrer = '') {
  vi.stubGlobal('window', { location: { href } });
  vi.stubGlobal('document', { referrer });
}

function storedTouch(source: string, ageDays: number): AttributionTouch {
  return {
    source,
    medium: 'cpc',
    campaign: 'spring',
    term: null,
    content: null,
    clickIdName: null,
    clickIdValue: null,
    referrerHost: null,
    landingHost: 'cairnfed.ai',
    landingPath: '/',
    extraParams: null,
    occurredAt: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
  };
}

async function seedStorage(storage: MemoryStorageAdapter, touch: AttributionTouch) {
  await storage.setItem(
    ATTRIBUTION_STORAGE_KEY,
    JSON.stringify({ v: 1, visitorKey: 'stored-visitor-0001', first: touch, last: touch, updatedAt: touch.occurredAt }),
  );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AttributionService capture', () => {
  it('reads the UTM tags from the landing URL on initialize', async () => {
    stubLanding(LANDING);
    const { service } = makeService();

    const state = await service.initialize();

    expect(state.last).toMatchObject({
      source: 'reddit',
      medium: 'paid',
      campaign: 'govcon-test-sep26',
      content: 'ad1',
      landingHost: 'cairnfed.ai',
      landingPath: '/',
    });
    expect(state.first).toEqual(state.last);
  });

  it('caps long values and drops a value carrying a control character', async () => {
    const { service } = makeService();
    await service.initialize();

    const touch = service.captureUrl(
      `https://cairnfed.ai/?utm_source=reddit&utm_campaign=${'c'.repeat(250)}&utm_term=bad%01term`,
    );

    expect(touch?.campaign).toHaveLength(200);
    expect(touch?.term).toBeNull();
    expect(touch?.source).toBe('reddit');
  });

  it('takes the first well-formed click id in priority order', async () => {
    const { service } = makeService();
    await service.initialize();

    const touch = service.captureUrl('https://cairnfed.ai/?gclid=&fbclid=bad%20value!&rdt_cid=abc_123');

    expect(touch?.clickIdName).toBe('rdt_cid');
    expect(touch?.clickIdValue).toBe('abc_123');
  });

  it('ignores click ids when the app turns them off', async () => {
    const { service } = makeService({ config: makeConfig({ captureClickIds: false }) });
    await service.initialize();

    const touch = service.captureUrl('https://cairnfed.ai/?utm_source=reddit&gclid=abc123');

    expect(touch?.clickIdName).toBeNull();
    expect(touch?.clickIdValue).toBeNull();
  });

  it('turns an external referrer without UTM tags into a referral touch', async () => {
    const { service } = makeService();
    await service.initialize();

    const touch = service.captureUrl('https://cairnfed.ai/pricing', 'https://www.reddit.com/r/govcon/');

    expect(touch).toMatchObject({
      source: 'reddit.com',
      medium: 'referral',
      referrerHost: 'reddit.com',
      landingPath: '/pricing',
    });
  });

  it('ignores a self-referral', async () => {
    const { service } = makeService();
    await service.initialize();

    expect(service.captureUrl('https://cairnfed.ai/signup', 'https://www.cairnfed.ai/')).toBeNull();
  });

  it('never overwrites the last touch with a direct visit', async () => {
    const { service } = makeService();
    await service.initialize();
    service.captureUrl(LANDING);

    expect(service.captureUrl('https://cairnfed.ai/dashboard')).toBeNull();
    expect(service.getState().last?.source).toBe('reddit');
  });

  it('keeps the first touch and moves the last touch', async () => {
    const { service } = makeService();
    await service.initialize();

    service.captureUrl(LANDING);
    service.captureUrl('https://cairnfed.ai/?utm_source=linkedin&utm_medium=paid');

    expect(service.getState().first?.source).toBe('reddit');
    expect(service.getState().last?.source).toBe('linkedin');
  });

  it('captures only the allowlisted extra parameters', async () => {
    const { service } = makeService({ config: makeConfig({ extraAllowedParamNames: ['sub_id'] }) });
    await service.initialize();

    const touch = service.captureUrl('https://cairnfed.ai/?utm_source=reddit&sub_id=42&other=x');

    expect(touch?.extraParams).toEqual({ sub_id: '42' });
  });

  it('emits attributionCaptured with the touch', async () => {
    const events = new WildwoodEventEmitter();
    const handler = vi.fn();
    events.on('attributionCaptured', handler);
    stubLanding(LANDING);
    const { service } = makeService({ events });

    await service.initialize();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].campaign).toBe('govcon-test-sep26');
  });
});

describe('AttributionService consent-gated persistence', () => {
  it('persists the blob when the consent category is granted', async () => {
    stubLanding(LANDING);
    const { service, storage } = makeService();

    const state = await service.initialize();

    const blob = JSON.parse((await storage.getItem(ATTRIBUTION_STORAGE_KEY))!);
    expect(blob.v).toBe(1);
    expect(blob.visitorKey).toBe(state.visitorKey);
    expect(blob.last.source).toBe('reddit');
    expect(service.getState().persisted).toBe(true);
  });

  it('holds the touch in memory until consent is decided, then flushes it', async () => {
    stubLanding(LANDING);
    const consent = makeConsent({ initialized: false });
    const { service, storage } = makeService({ consent });

    await service.initialize();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getState().persisted).toBe(false);
    expect(service.getForRegistration()?.lastTouch?.source).toBe('reddit');

    consent.decide(true);
    await flush();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
    expect(service.getState().persisted).toBe(true);
  });

  it('removes a stored blob and stays memory-only when the visitor declines', async () => {
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 2));
    stubLanding(LANDING);
    const consent = makeConsent({ granted: false, decided: true });
    const { service } = makeService({ consent, storage });

    await service.initialize();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getState().persisted).toBe(false);
    expect(service.getState().last?.source).toBe('reddit');
  });

  it('removes the blob when consent is withdrawn later', async () => {
    stubLanding(LANDING);
    const consent = makeConsent({ granted: true, decided: true });
    const { service, storage } = makeService({ consent });
    await service.initialize();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();

    consent.decide(false);
    await flush();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getState().persisted).toBe(false);
  });

  it('persists without opt-in when the category is StrictlyNecessary', async () => {
    stubLanding(LANDING);
    const consent = makeConsent({ initialized: false });
    const { service, storage } = makeService({
      consent,
      config: makeConfig({ persistenceConsentCategory: 'StrictlyNecessary' }),
    });

    await service.initialize();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
  });

  it('restores a stored touch inside the window', async () => {
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 5));
    const { service } = makeService({ storage });

    const state = await service.initialize();

    expect(state.first?.source).toBe('google');
    expect(state.visitorKey).toBe('stored-visitor-0001');
  });

  it('discards stored touches older than the window', async () => {
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 40));
    const { service } = makeService({ storage });

    const state = await service.initialize();

    expect(state.first).toBeNull();
    expect(state.last).toBeNull();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it('a new campaign keeps the restored first touch', async () => {
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 5));
    stubLanding(LANDING);
    const { service } = makeService({ storage });

    const state = await service.initialize();

    expect(state.first?.source).toBe('google');
    expect(state.last?.source).toBe('reddit');
  });

  it('captures and stores nothing when the app has attribution disabled', async () => {
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 2));
    stubLanding(LANDING);
    const { service } = makeService({ storage, config: makeConfig({ isEnabled: false }) });

    const state = await service.initialize();

    expect(state.last).toBeNull();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getForRegistration()).toBeNull();
    expect(service.captureUrl(LANDING)).toBeNull();
  });
});

describe('AttributionService registration payload', () => {
  it('is null when nothing was captured', async () => {
    const { service } = makeService();
    await service.initialize();

    expect(service.getForRegistration()).toBeNull();
  });

  it('carries both touches, the visitor key, platform and sdk', async () => {
    stubLanding(LANDING);
    const { service } = makeService();
    const state = await service.initialize();

    expect(service.getForRegistration()).toEqual({
      version: 1,
      visitorKey: state.visitorKey,
      firstTouch: state.first,
      lastTouch: state.last,
      platform: 'web',
      sdk: 'js',
    });
  });

  it('clear() drops the touches and the stored blob', async () => {
    stubLanding(LANDING);
    const { service, storage } = makeService();
    await service.initialize();

    service.clear();
    await flush();

    expect(service.getForRegistration()).toBeNull();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it('still captures in memory when the config request fails', async () => {
    stubLanding(LANDING);
    const { service, storage } = makeService({ config: 'fail' });

    await expect(service.initialize()).resolves.toBeDefined();

    expect(service.getForRegistration()?.lastTouch?.campaign).toBe('govcon-test-sep26');
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });
});

describe('AttributionService landing beacon', () => {
  it('posts one beacon per landing path when the beacon is on', async () => {
    stubLanding(LANDING);
    const { service, posts } = makeService({ config: makeConfig({ beaconEnabled: true }) });

    const state = await service.initialize();
    service.captureUrl(LANDING);

    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('api/attribution/touch?appId=app-1');
    expect(posts[0].body).toMatchObject({
      appId: 'app-1',
      visitorKey: state.visitorKey,
      platform: 'web',
      touch: { source: 'reddit', campaign: 'govcon-test-sep26' },
    });

    service.captureUrl('https://cairnfed.ai/pricing?utm_source=reddit');
    expect(posts).toHaveLength(2);
  });

  it('does not beacon when the beacon is off', async () => {
    stubLanding(LANDING);
    const { service, posts } = makeService();

    await service.initialize();

    expect(posts).toHaveLength(0);
  });
});

describe('AttributionService lifecycle', () => {
  it('initialize is idempotent', async () => {
    const { service, get } = makeService();

    await Promise.all([service.initialize(), service.initialize()]);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('initialize resolves without a DOM and captures nothing', async () => {
    const { service } = makeService();

    const state = await service.initialize();

    expect(state.last).toBeNull();
  });

  it('dispose() unsubscribes from consent and a later initialize() re-arms it', async () => {
    stubLanding(LANDING);
    const consent = makeConsent({ initialized: false });
    const { service } = makeService({ consent });
    await service.initialize();
    expect(consent.listenerCount()).toBe(1);

    service.dispose();
    expect(consent.listenerCount()).toBe(0);

    await service.initialize();
    await flush();
    expect(consent.listenerCount()).toBe(1);
  });

  it('notifies change listeners', async () => {
    const { service } = makeService();
    await service.initialize();
    const listener = vi.fn();
    service.onChange(listener);

    service.captureUrl(LANDING);

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)![0].last.source).toBe('reddit');
  });
});

describe('createWildwoodClient attribution wiring', () => {
  it('exposes the attribution service and disposes it with the client', async () => {
    const { createWildwoodClient } = await import('../client/WildwoodClient.js');
    const client = createWildwoodClient({
      baseUrl: 'https://api.example.com',
      appId: 'app-1',
      storage: 'memory',
      attribution: { enabled: false },
    });
    expect(client.attribution).toBeInstanceOf(AttributionService);
    const dispose = vi.spyOn(client.attribution, 'dispose');

    client.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('AttributionService consent withdrawal', () => {
  it('removes the stored blob once consent state exists but no longer grants the category', async () => {
    let granted = true;
    let state: ConsentState | null = makeConsentState(true, true);
    const listeners = new Set<(s: ConsentState) => void>();
    const consent: AttributionConsentSource = {
      isGranted: (category: ConsentCategory) => category === 'StrictlyNecessary' || granted,
      getState: () => state,
      onConsentChange: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    stubLanding(LANDING);
    const { service, storage } = makeService({
      consent: { consent, decide: () => {}, listenerCount: () => listeners.size },
    });
    await service.initialize();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();

    // A withdrawal leaves the visitor undecided with nothing granted.
    granted = false;
    state = makeConsentState(false, false);
    for (const listener of listeners) listener(state);
    await flush();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getState().persisted).toBe(false);
    expect(service.getForRegistration()?.lastTouch?.source).toBe('reddit');
  });
});
