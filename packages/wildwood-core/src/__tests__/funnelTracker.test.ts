import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FunnelTracker, SESSION_TIMEOUT_MS, type FunnelTrackerHost } from '../attribution/funnelTracker.js';
import { normalizeConfig } from '../attribution/attributionRules.js';
import type {
  AttributionEventsRequest,
  AttributionPlatform,
  AttributionTouch,
  PublicAttributionConfig,
} from '../attribution/types.js';
import { fakeElement, installFakeDom } from './fakeDom.js';

const TOUCH: AttributionTouch = {
  source: 'reddit',
  medium: 'paid',
  campaign: 'govcon',
  term: null,
  content: null,
  clickIdName: null,
  clickIdValue: null,
  referrerHost: null,
  landingHost: 'cairnfed.ai',
  landingPath: '/',
  extraParams: null,
  occurredAt: '2026-09-28T00:00:00.000Z',
};

function funnelConfig(overrides: Record<string, unknown> = {}): PublicAttributionConfig {
  return normalizeConfig(
    {
      appId: 'app-1',
      isEnabled: true,
      funnelTrackingEnabled: true,
      trackScrollDepth: true,
      trackEngagement: true,
      autoTrackCtaClicks: true,
      trackSignupSteps: true,
      customEventNames: ['demo_booked'],
      ...overrides,
    },
    'app-1',
    30,
  )!;
}

function makeHost(touch: AttributionTouch | null = TOUCH) {
  const posts: Array<{ path: string; body: AttributionEventsRequest }> = [];
  const host: FunnelTrackerHost = {
    getAppId: () => 'app-1',
    getVisitorKey: () => 'visitor-0001',
    getLastTouch: () => touch,
    post: vi.fn(async (path: string, body: AttributionEventsRequest) => {
      posts.push({ path, body });
    }),
    resolveUrl: (path) => `https://api.example.com/${path}`,
    captureNavigation: vi.fn(),
    sessionChanged: vi.fn(),
  };
  const events = () => posts.flatMap((p) => p.body.events);
  const names = () => events().map((e) => e.name);
  return { host, posts, events, names };
}

function makeTracker(options: { platform?: AttributionPlatform; touch?: AttributionTouch | null } = {}) {
  const parts = makeHost(options.touch === undefined ? TOUCH : options.touch);
  const tracker = new FunnelTracker(parts.host, options.platform ?? 'web');
  return { tracker, ...parts };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FunnelTracker config gating', () => {
  it('buffers events until the config loads, then replays them', async () => {
    const { tracker, names } = makeTracker();
    tracker.track('cta_click', { label: 'hero' });
    tracker.track('demo_booked');

    tracker.setConfig(funnelConfig());
    await tracker.flush();

    expect(names()).toEqual(['cta_click', 'demo_booked']);
  });

  it('drops the buffer and sends nothing when funnel tracking is off', async () => {
    const { tracker, host } = makeTracker();
    tracker.track('cta_click', { label: 'hero' });

    tracker.setConfig(funnelConfig({ funnelTrackingEnabled: false }));
    tracker.track('cta_click', { label: 'again' });
    await vi.advanceTimersByTimeAsync(10_000);
    await tracker.flush();

    expect(host.post).not.toHaveBeenCalled();
  });

  it('treats a failed config load as disabled', async () => {
    const { tracker, host } = makeTracker();
    tracker.track('page_view');
    tracker.setConfig(null);
    tracker.track('page_view');
    await tracker.flush();

    expect(host.post).not.toHaveBeenCalled();
  });

  it('caps the pre-config buffer at 50', async () => {
    const { tracker, events } = makeTracker();
    for (let i = 0; i < 60; i++) tracker.track('cta_click', { label: `b${i}` });
    tracker.setConfig(funnelConfig());
    await tracker.flush();

    expect(events()).toHaveLength(50);
  });

  it('normalizes the funnel config fields with safe defaults', () => {
    const config = normalizeConfig({ isEnabled: true }, 'app-1', 30)!;
    expect(config).toMatchObject({
      funnelTrackingEnabled: false,
      trackScrollDepth: false,
      trackEngagement: false,
      autoTrackCtaClicks: false,
      trackSignupSteps: false,
      customEventNames: [],
      sessionStoragePersistenceBeforeConsent: false,
    });
    const off = normalizeConfig({ isEnabled: false, funnelTrackingEnabled: true }, 'app-1', 30)!;
    expect(off.funnelTrackingEnabled).toBe(false);
    const custom = normalizeConfig(
      { isEnabled: true, customEventNames: [' Demo_Booked ', 'bad-name', 'purchase', 'page_view', 7] },
      'app-1',
      30,
    )!;
    expect(custom.customEventNames).toEqual(['demo_booked']);
  });
});

describe('FunnelTracker event validation', () => {
  it('drops server-only names, unknown custom names and malformed names', async () => {
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig());
    for (const name of ['purchase', 'signup_complete', 'trial_started', 'not_configured', 'Bad Name', '']) {
      tracker.track(name);
    }
    tracker.track('demo_booked');
    await tracker.flush();

    expect(names()).toEqual(['demo_booked']);
  });

  it('drops signup steps when the app does not track them', async () => {
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig({ trackSignupSteps: false }));
    tracker.track('signup_view');
    tracker.track('signup_error', { label: 'x' });
    tracker.track('plan_selected', { label: 'pro' });
    await tracker.flush();

    expect(names()).toEqual(['plan_selected']);
  });

  it('shapes labels and values', async () => {
    const { tracker, events } = makeTracker();
    tracker.setConfig(funnelConfig());
    tracker.track('signup_error', { label: 'Email Taken!' });
    tracker.track('signup_error');
    tracker.track('cta_click', { label: '   ' });
    tracker.track('cta_click', { label: 'x'.repeat(150) });
    tracker.track('scroll_depth', { value: 33 });
    tracker.track('time_on_page', { value: 100_000.4 });
    tracker.track('time_on_page', { value: -1 });
    await tracker.flush();

    expect(events().map((e) => [e.name, e.label ?? null, e.value ?? null])).toEqual([
      ['signup_error', 'email_taken', null],
      ['signup_error', 'unknown', null],
      ['cta_click', 'x'.repeat(100), null],
      ['time_on_page', null, 86_400],
    ]);
    expect(events()[0].clientTimestamp).toBe('2026-09-28T12:00:00.000Z');
  });

  it('sends one-shot events once per session per label', async () => {
    const { tracker, names, events } = makeTracker();
    tracker.setConfig(funnelConfig());
    tracker.track('signup_view', { label: 'modal' });
    tracker.track('signup_view', { label: 'modal' });
    tracker.track('signup_view', { label: 'page' });
    tracker.track('checkout_start', { label: 'pro' });
    tracker.track('checkout_start', { label: 'pro' });
    tracker.track('engaged');
    tracker.track('engaged');
    tracker.track('cta_click', { label: 'hero' });
    tracker.track('cta_click', { label: 'hero' });
    await tracker.flush();

    expect(names()).toEqual(['signup_view', 'signup_view', 'checkout_start', 'engaged', 'cta_click', 'cta_click']);
    expect(events()[1].label).toBe('page');
  });
});

describe('FunnelTracker explicit paths', () => {
  it('treats a page_view with a path as a navigation that later events carry', async () => {
    const { tracker, events } = makeTracker({ platform: 'ios' });
    tracker.setConfig(funnelConfig());
    tracker.track('page_view', { path: 'Pricing?plan=pro#top' });
    tracker.track('page_view', { path: '/Pricing' });
    tracker.track('plan_selected', { label: 'pro' });
    tracker.track('page_view', { path: '/signup' });
    tracker.track('cta_click', { label: 'faq', path: '/help' });
    await tracker.flush();

    expect(events().map((e) => [e.name, e.path ?? null])).toEqual([
      ['page_view', '/Pricing'],
      ['plan_selected', '/Pricing'],
      ['page_view', '/signup'],
      ['cta_click', '/help'],
    ]);
  });

  it('ignores an empty path and caps a long one', async () => {
    const { tracker, events } = makeTracker({ platform: 'android' });
    tracker.setConfig(funnelConfig());
    tracker.track('cta_click', { label: 'a', path: '   ' });
    tracker.track('page_view', { path: `/${'x'.repeat(600)}` });
    await tracker.flush();

    expect(events()[0].path).toBeUndefined();
    expect(events()[1].path).toHaveLength(500);
  });

  it('buffers a path-carrying event until the config loads', async () => {
    const { tracker, events } = makeTracker({ platform: 'ios' });
    tracker.track('page_view', { path: '/home' });
    tracker.setConfig(funnelConfig());
    await tracker.flush();

    expect(events().map((e) => [e.name, e.path])).toEqual([['page_view', '/home']]);
  });
});

describe('FunnelTracker queue and transport', () => {
  it('flushes every 5 s while the queue is non-empty', async () => {
    const { tracker, host, posts } = makeTracker();
    tracker.setConfig(funnelConfig());
    tracker.trackCta('hero');

    await vi.advanceTimersByTimeAsync(4_999);
    expect(host.post).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('api/attribution/events?appId=app-1');
    expect(posts[0].body).toMatchObject({
      appId: 'app-1',
      visitorKey: 'visitor-0001',
      isReturning: false,
      deviceClass: 'desktop',
      platform: 'web',
      touch: TOUCH,
      events: [{ name: 'cta_click', label: 'hero' }],
    });
    expect(posts[0].body.sessionKey).toBe(tracker.peekSession()!.sessionKey);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(posts).toHaveLength(1);
  });

  it('sends a null touch for a direct visitor', async () => {
    const { tracker, posts } = makeTracker({ touch: null });
    tracker.setConfig(funnelConfig());
    tracker.trackCta('hero');
    await tracker.flush();

    expect(posts[0].body.touch).toBeNull();
  });

  it('batches at most 25 events per request', async () => {
    const { tracker, posts } = makeTracker();
    tracker.setConfig(funnelConfig());
    for (let i = 0; i < 60; i++) tracker.trackCta(`b${i}`);
    await vi.advanceTimersByTimeAsync(0);
    expect(posts.map((p) => p.body.events.length)).toEqual([25, 25]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(posts.map((p) => p.body.events.length)).toEqual([25, 25, 10]);
  });

  it('swallows a failed post', async () => {
    const { tracker, host } = makeTracker();
    (host.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    tracker.setConfig(funnelConfig());
    tracker.trackCta('hero');

    await expect(tracker.flush()).resolves.toBeUndefined();
  });

  it('sends a text/plain Blob by sendBeacon on pagehide', async () => {
    const dom = installFakeDom();
    const { tracker, host } = makeTracker();
    tracker.setConfig(funnelConfig());
    tracker.trackCta('hero');

    dom.pagehide();

    expect(host.post).not.toHaveBeenCalled();
    expect(dom.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = dom.sendBeacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('https://api.example.com/api/attribution/events?appId=app-1');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    const body = JSON.parse(await blob.text()) as AttributionEventsRequest;
    expect(body.events.map((e) => e.name)).toEqual(['page_view', 'cta_click']);
  });

  it('beacons when the page is hidden', () => {
    const dom = installFakeDom();
    const { tracker } = makeTracker();
    tracker.setConfig(funnelConfig());

    dom.setVisibility('hidden');

    expect(dom.sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('falls back to fetch keepalive when sendBeacon refuses or is missing', () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const dom = installFakeDom({ sendBeacon: () => false });
    const { tracker } = makeTracker();
    tracker.setConfig(funnelConfig());

    dom.pagehide();

    expect(dom.sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/attribution/events?appId=app-1');
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });

    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
    const dom2 = installFakeDom({ sendBeacon: false });
    const second = makeTracker();
    second.tracker.setConfig(funnelConfig());
    dom2.pagehide();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('FunnelTracker session', () => {
  it('starts a new session after 30 minutes without tracked activity', async () => {
    const { tracker, posts } = makeTracker();
    tracker.setConfig(funnelConfig());
    tracker.track('signup_view', { label: 'modal' });
    const first = tracker.peekSession()!;
    expect(first.sessionCount).toBe(1);

    vi.setSystemTime(Date.now() + SESSION_TIMEOUT_MS - 1000);
    tracker.trackCta('still-same');
    expect(tracker.peekSession()!.sessionKey).toBe(first.sessionKey);

    vi.setSystemTime(Date.now() + SESSION_TIMEOUT_MS + 1);
    tracker.track('signup_view', { label: 'modal' });
    const second = tracker.peekSession()!;
    expect(second.sessionKey).not.toBe(first.sessionKey);
    expect(second.sessionCount).toBe(2);

    await tracker.flush();
    // Events keep the session they happened in: one request per session.
    expect(posts.map((p) => [p.body.sessionKey, p.body.events.length])).toEqual([
      [first.sessionKey, 2],
      [second.sessionKey, 1],
    ]);
  });

  it('continues a restored session inside the window and counts on after it', () => {
    const { tracker } = makeTracker();
    tracker.restoreSession(
      { sessionKey: 'restored-session-1', lastActivityAt: Date.now() - 60_000, sessionCount: 3 },
      true,
    );
    expect(tracker.getSession()).toMatchObject({ sessionKey: 'restored-session-1', sessionCount: 3 });

    const stale = makeTracker().tracker;
    stale.restoreSession(
      { sessionKey: 'restored-session-1', lastActivityAt: Date.now() - SESSION_TIMEOUT_MS - 1, sessionCount: 3 },
      true,
    );
    expect(stale.getSession()).toMatchObject({ sessionCount: 4 });
    expect(stale.getSession().sessionKey).not.toBe('restored-session-1');

    const legacy = makeTracker().tracker;
    legacy.restoreSession({}, true);
    expect(legacy.getSession().sessionCount).toBe(2);
  });

  it('buckets the device class from viewport and pointer', () => {
    const cases: Array<[number, boolean, string]> = [
      [500, false, 'mobile'],
      [800, false, 'tablet'],
      [1100, true, 'tablet'],
      [1100, false, 'desktop'],
      [1400, true, 'desktop'],
    ];
    for (const [width, coarse, expected] of cases) {
      installFakeDom({ width, coarse });
      expect(makeTracker().tracker.getDeviceClass()).toBe(expected);
      vi.unstubAllGlobals();
    }
    expect(makeTracker({ platform: 'ios' }).tracker.getDeviceClass()).toBe('mobile');
    expect(makeTracker().tracker.getDeviceClass()).toBe('desktop');
    const { host } = makeHost();
    expect(new FunnelTracker(host, 'android', () => 'tablet').getDeviceClass()).toBe('tablet');
  });
});

describe('FunnelTracker auto listeners', () => {
  it('records the landing page_view and tracks SPA navigations once per path', async () => {
    const dom = installFakeDom({ href: 'https://cairnfed.ai/' });
    const { tracker, host, events } = makeTracker();
    tracker.setConfig(funnelConfig());

    window.history.pushState({}, '', '/pricing?utm_source=x');
    window.history.replaceState({}, '', '/pricing?tab=2');
    dom.popTo('/about');
    dom.popTo('/about');
    await tracker.flush();

    expect(
      events()
        .filter((e) => e.name === 'page_view')
        .map((e) => e.path),
    ).toEqual(['/', '/pricing', '/about']);
    expect(host.captureNavigation).toHaveBeenCalledWith('https://cairnfed.ai/pricing?utm_source=x');
    expect(dom.originalPushState).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a page_view captureUrl already recorded', async () => {
    installFakeDom({ href: 'https://cairnfed.ai/' });
    const { tracker, names } = makeTracker();
    tracker.notifyNavigation('https://cairnfed.ai/');
    tracker.setConfig(funnelConfig());
    await tracker.flush();

    expect(names()).toEqual(['page_view']);
  });

  it('sends each scroll milestone once per page and resets on navigation', async () => {
    const dom = installFakeDom({ scrollHeight: 4000, height: 1000 });
    const { tracker, events } = makeTracker();
    tracker.setConfig(funnelConfig({ trackEngagement: false }));

    dom.scrollToPercent(60);
    await vi.advanceTimersByTimeAsync(200);
    dom.scrollToPercent(55);
    await vi.advanceTimersByTimeAsync(200);
    dom.scrollToPercent(100);
    await vi.advanceTimersByTimeAsync(200);
    window.history.pushState({}, '', '/next');
    dom.scrollToPercent(30);
    await vi.advanceTimersByTimeAsync(200);
    await tracker.flush();

    const scrolls = events().filter((e) => e.name === 'scroll_depth');
    expect(scrolls.map((e) => [e.path, e.value])).toEqual([
      ['/', 25],
      ['/', 50],
      ['/', 75],
      ['/', 100],
      ['/next', 25],
    ]);
  });

  it('marks engaged after 10 s of visible time with an interaction, not counting hidden time', async () => {
    const dom = installFakeDom();
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig({ trackScrollDepth: false }));

    await vi.advanceTimersByTimeAsync(4_000);
    dom.setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    dom.setVisibility('visible');
    dom.key();
    await vi.advanceTimersByTimeAsync(5_000);
    await tracker.flush();
    expect(names()).not.toContain('engaged');

    await vi.advanceTimersByTimeAsync(1_000);
    dom.key();
    await tracker.flush();
    expect(names().filter((n) => n === 'engaged')).toHaveLength(1);
  });

  it('never marks engaged without an interaction', async () => {
    installFakeDom();
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig());
    await vi.advanceTimersByTimeAsync(60_000);
    await tracker.flush();

    expect(names()).not.toContain('engaged');
  });

  it('marks engaged at 50% scroll, once per session', async () => {
    const dom = installFakeDom();
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig({ trackScrollDepth: false }));

    dom.scrollToPercent(55);
    await vi.advanceTimersByTimeAsync(200);
    window.history.pushState({}, '', '/next');
    dom.scrollToPercent(80);
    await vi.advanceTimersByTimeAsync(200);
    await tracker.flush();

    expect(names().filter((n) => n === 'engaged')).toHaveLength(1);
  });

  it('reports visible time on page, paused while hidden, on navigation and pagehide', async () => {
    const dom = installFakeDom();
    const { tracker, events } = makeTracker();
    tracker.setConfig(funnelConfig());

    await vi.advanceTimersByTimeAsync(3_000);
    dom.setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(120_000);
    dom.setVisibility('visible');
    await vi.advanceTimersByTimeAsync(2_000);
    window.history.pushState({}, '', '/pricing');
    await vi.advanceTimersByTimeAsync(7_000);
    dom.pagehide();

    const beaconed = await Promise.all(
      dom.sendBeacon.mock.calls.map(
        async (call) => JSON.parse(await (call[1] as Blob).text()) as AttributionEventsRequest,
      ),
    );
    const all = [...events(), ...beaconed.flatMap((b) => b.events)];
    expect(all.filter((e) => e.name === 'time_on_page').map((e) => [e.path, e.value])).toEqual([
      ['/', 5],
      ['/pricing', 7],
    ]);
  });

  it('captures delegated [data-ww-cta] clicks, including from a child or text node', async () => {
    const dom = installFakeDom();
    const { tracker, events } = makeTracker();
    tracker.setConfig(funnelConfig());
    const button = fakeElement({ 'data-ww-cta': '  start-trial  ' });
    const icon = fakeElement({}, button);

    dom.click(button);
    dom.click(icon);
    dom.click({ parentElement: icon });
    dom.click(fakeElement({ class: 'plain' }));
    await tracker.flush();

    expect(
      events()
        .filter((e) => e.name === 'cta_click')
        .map((e) => e.label),
    ).toEqual(['start-trial', 'start-trial', 'start-trial']);
  });

  it('leaves CTA clicks alone when auto-capture is off, but trackCta still works', async () => {
    const dom = installFakeDom();
    const { tracker, names } = makeTracker();
    tracker.setConfig(funnelConfig({ autoTrackCtaClicks: false }));

    dom.click(fakeElement({ 'data-ww-cta': 'hero' }));
    tracker.trackCta('manual');
    await tracker.flush();

    expect(names().filter((n) => n === 'cta_click')).toHaveLength(1);
  });

  it('attaches no DOM listeners on React Native', async () => {
    const dom = installFakeDom();
    const { tracker, names } = makeTracker({ platform: 'ios' });
    tracker.setConfig(funnelConfig());
    window.history.pushState({}, '', '/next');
    dom.click(fakeElement({ 'data-ww-cta': 'hero' }));
    await tracker.flush();

    expect(names()).toEqual([]);
    expect(window.history.pushState).toBe(dom.originalPushState);
  });

  it('stop() removes listeners, restores history and beacons the queue', async () => {
    const dom = installFakeDom();
    const { tracker, host } = makeTracker();
    tracker.setConfig(funnelConfig());
    expect(window.history.pushState).not.toBe(dom.originalPushState);

    tracker.stop();

    expect(window.history.pushState).toBe(dom.originalPushState);
    expect(dom.sendBeacon).toHaveBeenCalledTimes(1);
    dom.click(fakeElement({ 'data-ww-cta': 'hero' }));
    dom.scrollToPercent(100);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(host.post).not.toHaveBeenCalled();

    // A restart (StrictMode) re-arms without repeating the landing page_view.
    tracker.start();
    dom.click(fakeElement({ 'data-ww-cta': 'hero' }));
    await tracker.flush();
    expect(
      (host.post as ReturnType<typeof vi.fn>).mock.calls[0][1].events.map((e: { name: string }) => e.name),
    ).toEqual(['cta_click']);
  });
});
