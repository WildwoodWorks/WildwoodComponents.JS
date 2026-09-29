import { describe, it, expect, vi, afterEach } from 'vitest';
import { AttributionService } from '../attribution/attributionService.js';
import {
  ATTRIBUTION_SESSION_STORAGE_KEY,
  ATTRIBUTION_STORAGE_KEY,
  type AttributionConsentSource,
  type AttributionEventsRequest,
  type AttributionTouch,
  type PublicAttributionConfig,
} from '../attribution/types.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { ConsentCategory, ConsentState } from '../consent/types.js';
import type { HttpClient } from '../client/httpClient.js';
import { installFakeDom, installSessionStorage } from './fakeDom.js';

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
    funnelTrackingEnabled: false,
    trackScrollDepth: false,
    trackEngagement: false,
    autoTrackCtaClicks: false,
    trackSignupSteps: false,
    customEventNames: [],
    sessionStoragePersistenceBeforeConsent: false,
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
  const resolveUrl = (path: string) => `https://api.example.com/${path}`;
  return { http: { get, post, resolveUrl } as unknown as HttpClient, get, posts };
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
      sessionKey: expect.any(String),
      deviceClass: 'desktop',
      sessionCount: 1,
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

const FUNNEL: Partial<PublicAttributionConfig> = {
  funnelTrackingEnabled: true,
  trackScrollDepth: true,
  trackEngagement: true,
  autoTrackCtaClicks: true,
  trackSignupSteps: true,
};

function eventBodies(posts: Array<{ path: string; body: unknown }>): AttributionEventsRequest[] {
  return posts
    .filter((p) => p.path.startsWith('api/attribution/events'))
    .map((p) => p.body as AttributionEventsRequest);
}

function eventNames(posts: Array<{ path: string; body: unknown }>): string[] {
  return eventBodies(posts).flatMap((b) => b.events.map((e) => e.name));
}

async function seedSession(
  storage: MemoryStorageAdapter,
  session: { sessionKey?: string; lastActivityAt?: number; sessionCount?: number } | null,
) {
  const touch = storedTouch('google', 2);
  await storage.setItem(
    ATTRIBUTION_STORAGE_KEY,
    JSON.stringify({
      v: 1,
      visitorKey: 'stored-visitor-0001',
      first: touch,
      last: touch,
      updatedAt: touch.occurredAt,
      ...(session ?? {}),
    }),
  );
}

describe('AttributionService funnel events', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends no events and hooks nothing when funnel tracking is off', async () => {
    vi.useFakeTimers();
    const dom = installFakeDom({ href: LANDING });
    const { service, posts } = makeService();
    await service.initialize();

    service.track('cta_click', { label: 'hero' });
    service.trackCta('hero');
    await service.flush();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(eventBodies(posts)).toHaveLength(0);
    expect(window.history.pushState).toBe(dom.originalPushState);
  });

  it('sends no events when attribution is disabled for the app', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: LANDING });
    const { service, posts } = makeService({ config: makeConfig({ isEnabled: false, ...FUNNEL }) });
    service.track('cta_click', { label: 'early' });
    await service.initialize();
    service.trackCta('hero');
    await service.flush();

    expect(eventBodies(posts)).toHaveLength(0);
  });

  it('posts the landing page_view with the visitor, session and current last touch', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: LANDING });
    const { service, posts } = makeService({ config: makeConfig(FUNNEL) });

    const state = await service.initialize();
    await service.flush();

    const events = posts.filter((p) => p.path.startsWith('api/attribution/events'));
    expect(events).toHaveLength(1);
    expect(events[0].path).toBe('api/attribution/events?appId=app-1');
    expect(events[0].body).toMatchObject({
      appId: 'app-1',
      visitorKey: state.visitorKey,
      isReturning: false,
      deviceClass: 'desktop',
      platform: 'web',
      touch: { source: 'reddit', campaign: 'govcon-test-sep26' },
      events: [{ name: 'page_view', path: '/' }],
    });
    expect((events[0].body as AttributionEventsRequest).sessionKey).toBe(service.getForRegistration()!.sessionKey);
  });

  it('flushes track() calls made before the config loaded', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const { service, posts } = makeService({ config: makeConfig({ ...FUNNEL, customEventNames: ['demo_booked'] }) });

    service.track('demo_booked');
    service.track('purchase');
    await service.initialize();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(eventNames(posts).sort()).toEqual(['demo_booked', 'page_view']);
    expect(eventBodies(posts)[0].touch).toBeNull();
  });

  it('records a page_view from captureUrl, and the history hook does not capture the same URL again', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: LANDING });
    const events = new WildwoodEventEmitter();
    const captured = vi.fn();
    events.on('attributionCaptured', captured);
    const { service, posts } = makeService({ config: makeConfig(FUNNEL), events });
    await service.initialize();
    expect(captured).toHaveBeenCalledTimes(1);

    service.captureUrl('https://cairnfed.ai/pricing?utm_source=linkedin');
    window.history.pushState({}, '', '/pricing?utm_source=linkedin');
    expect(captured).toHaveBeenCalledTimes(2);

    window.history.pushState({}, '', '/docs?utm_source=google');
    expect(captured).toHaveBeenCalledTimes(3);
    expect(service.getState().last?.source).toBe('google');

    await service.flush();
    const pageViews = eventBodies(posts)
      .flatMap((b) => b.events)
      .filter((e) => e.name === 'page_view')
      .map((e) => e.path);
    expect(pageViews).toEqual(['/', '/pricing', '/docs']);
  });

  it('keeps a direct visitor and their session in storage once consent allows it', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const { service, storage } = makeService({ config: makeConfig(FUNNEL) });

    await service.initialize();

    const blob = JSON.parse((await storage.getItem(ATTRIBUTION_STORAGE_KEY))!);
    expect(blob).toMatchObject({ first: null, last: null, sessionCount: 1 });
    expect(typeof blob.sessionKey).toBe('string');
    expect(typeof blob.lastActivityAt).toBe('number');
  });

  it('marks a stored visitor starting a new session as returning', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const storage = new MemoryStorageAdapter();
    await seedSession(storage, {
      sessionKey: 'old-session-0001',
      lastActivityAt: Date.now() - 2 * 60 * 60 * 1000,
      sessionCount: 1,
    });
    const { service, posts } = makeService({ config: makeConfig(FUNNEL), storage });

    await service.initialize();
    await service.flush();

    expect(eventBodies(posts)[0].isReturning).toBe(true);
    const payload = service.getForRegistration()!;
    expect(payload.sessionCount).toBe(2);
    expect(payload.sessionKey).not.toBe('old-session-0001');
    expect(JSON.parse((await storage.getItem(ATTRIBUTION_STORAGE_KEY))!).sessionCount).toBe(2);
  });

  it('continues a stored session inside 30 minutes, which is not a return', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const storage = new MemoryStorageAdapter();
    await seedSession(storage, {
      sessionKey: 'old-session-0001',
      lastActivityAt: Date.now() - 5 * 60 * 1000,
      sessionCount: 1,
    });
    const { service, posts } = makeService({ config: makeConfig(FUNNEL), storage });

    await service.initialize();
    await service.flush();

    expect(eventBodies(posts)[0]).toMatchObject({ isReturning: false, sessionKey: 'old-session-0001' });
    expect(service.getForRegistration()).toMatchObject({ sessionKey: 'old-session-0001', sessionCount: 1 });
  });

  it('treats a stored visitor from before session tracking as returning', async () => {
    vi.useFakeTimers();
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const storage = new MemoryStorageAdapter();
    await seedSession(storage, null);
    const { service, posts } = makeService({ config: makeConfig(FUNNEL), storage });

    await service.initialize();
    await service.flush();

    expect(eventBodies(posts)[0].isReturning).toBe(true);
    expect(service.getForRegistration()!.sessionCount).toBe(2);
  });

  it('dispose() beacons queued events and unhooks history; initialize() re-arms it', async () => {
    vi.useFakeTimers();
    const dom = installFakeDom({ href: LANDING });
    const { service, posts } = makeService({ config: makeConfig(FUNNEL) });
    await service.initialize();
    service.trackCta('hero');

    service.dispose();

    expect(dom.sendBeacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse(await (dom.sendBeacon.mock.calls[0][1] as Blob).text()) as AttributionEventsRequest;
    expect(body.events.map((e) => e.name)).toEqual(['page_view', 'cta_click']);
    expect(window.history.pushState).toBe(dom.originalPushState);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(eventBodies(posts)).toHaveLength(0);

    await service.initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(window.history.pushState).not.toBe(dom.originalPushState);
  });
});

describe('AttributionService sessionStorage mirror', () => {
  const MIRROR_CONFIG = makeConfig({ sessionStoragePersistenceBeforeConsent: true });

  function readMirror(data: Map<string, string>) {
    const raw = data.get(ATTRIBUTION_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  it('mirrors the touch, visitor key and session key while consent is undecided', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const consent = makeConsent({ granted: false, decided: false });
    const { service, storage } = makeService({ consent, config: MIRROR_CONFIG });

    const state = await service.initialize();

    const mirror = readMirror(data);
    expect(mirror).toMatchObject({ v: 1, visitorKey: state.visitorKey, sessionCount: 1 });
    expect(mirror.last.source).toBe('reddit');
    expect(mirror.sessionKey).toBe(service.getForRegistration()!.sessionKey);
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getState().persisted).toBe(false);
  });

  it('mirrors before the consent engine has initialized too', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const { service } = makeService({ consent: makeConsent({ initialized: false }), config: MIRROR_CONFIG });

    await service.initialize();

    expect(readMirror(data)).not.toBeNull();
  });

  it('restores the mirror on a reload in the same tab, which is not a return', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const first = makeService({ consent: makeConsent({ granted: false, decided: false }), config: MIRROR_CONFIG });
    const firstState = await first.service.initialize();
    const firstSession = first.service.getForRegistration()!.sessionKey;
    expect(data.size).toBe(1);

    vi.unstubAllGlobals();
    installSessionStorage().data.set(ATTRIBUTION_SESSION_STORAGE_KEY, data.get(ATTRIBUTION_SESSION_STORAGE_KEY)!);
    stubLanding('https://cairnfed.ai/pricing');
    const reload = makeService({ consent: makeConsent({ granted: false, decided: false }), config: MIRROR_CONFIG });
    const state = await reload.service.initialize();

    expect(state.visitorKey).toBe(firstState.visitorKey);
    expect(state.first?.source).toBe('reddit');
    expect(state.last?.source).toBe('reddit');
    expect(reload.service.getForRegistration()).toMatchObject({ sessionKey: firstSession, sessionCount: 1 });
  });

  it('moves the mirror into localStorage once consent is granted', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const consent = makeConsent({ granted: false, decided: false });
    const { service, storage } = makeService({ consent, config: MIRROR_CONFIG });
    const state = await service.initialize();
    const sessionKey = readMirror(data).sessionKey;

    consent.decide(true);
    await flush();

    const blob = JSON.parse((await storage.getItem(ATTRIBUTION_STORAGE_KEY))!);
    expect(blob).toMatchObject({ visitorKey: state.visitorKey, sessionKey });
    expect(blob.last.source).toBe('reddit');
    expect(readMirror(data)).toBeNull();
    expect(service.getState().persisted).toBe(true);
  });

  it('removes the mirror when the visitor declines', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const consent = makeConsent({ granted: false, decided: false });
    const { service, storage } = makeService({ consent, config: MIRROR_CONFIG });
    await service.initialize();
    expect(readMirror(data)).not.toBeNull();

    consent.decide(false);
    await flush();

    expect(readMirror(data)).toBeNull();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(service.getForRegistration()?.lastTouch?.source).toBe('reddit');
  });

  it('writes no mirror after a declined decision', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const { service } = makeService({ consent: makeConsent({ granted: false, decided: true }), config: MIRROR_CONFIG });

    await service.initialize();

    expect(data.size).toBe(0);
  });

  it('clears both copies on withdrawal and writes no new mirror afterwards', async () => {
    const { data } = installSessionStorage();
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
      config: MIRROR_CONFIG,
    });
    await service.initialize();
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
    expect(data.size).toBe(0);
    // A stray mirror (another tab's pre-consent copy) must go too.
    data.set(ATTRIBUTION_SESSION_STORAGE_KEY, '{"v":1}');

    // A withdrawal leaves the visitor undecided with nothing granted.
    granted = false;
    state = makeConsentState(false, false);
    for (const listener of listeners) listener(state);
    await flush();

    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(data.size).toBe(0);

    service.captureUrl('https://cairnfed.ai/?utm_source=linkedin');
    await flush();
    expect(data.size).toBe(0);
  });

  it('writes no mirror when the app leaves the option off', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const { service } = makeService({ consent: makeConsent({ granted: false, decided: false }) });

    await service.initialize();

    expect(data.size).toBe(0);
  });

  it('ignores a mirror when localStorage already holds the visitor', async () => {
    const { data } = installSessionStorage();
    data.set(
      ATTRIBUTION_SESSION_STORAGE_KEY,
      JSON.stringify({ v: 1, visitorKey: 'mirror-visitor-0001', first: null, last: null, updatedAt: '' }),
    );
    const storage = new MemoryStorageAdapter();
    await seedStorage(storage, storedTouch('google', 1));
    const { service } = makeService({ storage, config: MIRROR_CONFIG });

    const state = await service.initialize();

    expect(state.visitorKey).toBe('stored-visitor-0001');
    expect(data.size).toBe(0);
  });

  it('clear() and a disabled app remove the mirror', async () => {
    const { data } = installSessionStorage();
    stubLanding(LANDING);
    const { service } = makeService({
      consent: makeConsent({ granted: false, decided: false }),
      config: MIRROR_CONFIG,
    });
    await service.initialize();
    expect(data.size).toBe(1);
    service.clear();
    await flush();
    expect(data.size).toBe(0);

    data.set(ATTRIBUTION_SESSION_STORAGE_KEY, '{}');
    const disabled = makeService({
      config: makeConfig({ isEnabled: false, sessionStoragePersistenceBeforeConsent: true }),
    });
    await disabled.service.initialize();
    expect(data.size).toBe(0);
  });

  it('keeps working when sessionStorage throws', async () => {
    installSessionStorage({ throws: true });
    stubLanding(LANDING);
    const consent = makeConsent({ granted: false, decided: false });
    const { service, storage } = makeService({ consent, config: MIRROR_CONFIG });

    const state = await service.initialize();
    consent.decide(true);
    await flush();

    expect(state.last?.source).toBe('reddit');
    expect(await storage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
  });
});
