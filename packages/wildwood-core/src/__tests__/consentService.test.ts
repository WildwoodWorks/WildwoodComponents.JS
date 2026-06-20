import { describe, it, expect, vi } from 'vitest';
import { ConsentService } from '../consent/consentService.js';
import type { PublicConsentConfig } from '../consent/types.js';
import type { HttpClient } from '../client/httpClient.js';

function makeConfig(overrides: Partial<PublicConsentConfig> = {}): PublicConsentConfig {
  return {
    appId: 'app-1',
    enabled: true,
    version: 1,
    geo: { aware: false, inTarget: false, resolvedTags: [] },
    honorGpc: true,
    showDoNotSell: true,
    showLimitSensitive: true,
    nonTargetDefault: 'LoadAll',
    categories: ['Functional', 'Analytics', 'Advertising'],
    categoryDefaults: { Functional: false, Analytics: false, Advertising: false },
    appearance: null,
    bannerText: null,
    privacyPolicyUrl: null,
    accessibilityUrl: null,
    scripts: [],
    ...overrides,
  };
}

function makeHttp(config: PublicConsentConfig) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const http = {
    get: vi.fn(async () => ({ data: config, status: 200, headers: {} })),
    post: vi.fn(async (path: string, body: unknown) => {
      posts.push({ path, body });
      return { data: undefined, status: 202, headers: {} };
    }),
  } as unknown as HttpClient;
  return { http, posts };
}

describe('ConsentService decision table', () => {
  it('shows the banner to everyone when geo-aware is off', async () => {
    const config = makeConfig();
    const { http } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    const result = await svc.initialize();

    expect(result.shouldShowBanner).toBe(true);
    expect(result.state.decided).toBe(false);
  });

  it('suppresses the banner and applies the non-target default outside the target geo', async () => {
    const config = makeConfig({
      geo: { aware: true, inTarget: false, resolvedTags: ['GB'] },
      nonTargetDefault: 'LoadAll',
    });
    const { http, posts } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    const result = await svc.initialize();

    expect(result.shouldShowBanner).toBe(false);
    expect(result.state.decided).toBe(true);
    // LoadAll grants the active categories outside the target.
    expect(result.state.categories.Analytics).toBe(true);
    expect(result.state.categories.Advertising).toBe(true);
    // A record was written with method NonTargetDefault.
    expect(posts.length).toBe(1);
    expect((posts[0].body as { method: string }).method).toBe('NonTargetDefault');
  });

  it('shows the banner inside the target geo', async () => {
    const config = makeConfig({ geo: { aware: true, inTarget: true, resolvedTags: ['US'] } });
    const { http } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    const result = await svc.initialize();

    expect(result.shouldShowBanner).toBe(true);
  });

  it('does nothing when consent is disabled', async () => {
    const config = makeConfig({ enabled: false });
    const { http } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    const result = await svc.initialize();

    expect(result.shouldShowBanner).toBe(false);
  });

  it('acceptAll grants active categories and records the decision', async () => {
    const config = makeConfig();
    const { http, posts } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    await svc.initialize();
    await svc.acceptAll();

    expect(svc.isGranted('Analytics')).toBe(true);
    expect(svc.isGranted('Advertising')).toBe(true);
    expect((posts.at(-1)!.body as { method: string }).method).toBe('AcceptAll');
  });

  it('rejectAll grants nothing beyond StrictlyNecessary', async () => {
    const config = makeConfig();
    const { http } = makeHttp(config);
    const svc = new ConsentService(http, 'app-1');

    await svc.initialize();
    await svc.rejectAll();

    expect(svc.isGranted('StrictlyNecessary')).toBe(true);
    expect(svc.isGranted('Analytics')).toBe(false);
    expect(svc.isGranted('Advertising')).toBe(false);
  });
});
