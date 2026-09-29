// Campaign Attribution core engine - framework-agnostic.
// Captures UTM tags, an ad-platform click id and the external referrer from the landing URL, keeps a
// first and a last touch, persists them only once the app's consent category allows it, beacons the
// landing when the app has the beacon on, and hands the payload to registration. When the app turns funnel
// tracking on, an internal FunnelTracker keeps the session and sends the funnel events.
//
// It never throws into the host app: attribution is measurement, and a failure here must never cost a
// page load or a signup.

import type { HttpClient } from '../client/httpClient.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { StorageAdapter } from '../platform/types.js';
import type { ConsentState } from '../consent/types.js';
import {
  ATTRIBUTION_SCHEMA_VERSION,
  ATTRIBUTION_SESSION_STORAGE_KEY,
  ATTRIBUTION_STORAGE_KEY,
  type AttributionChangeListener,
  type AttributionConsentSource,
  type AttributionPayload,
  type AttributionPlatform,
  type AttributionServiceOptions,
  type AttributionSessionMirror,
  type AttributionState,
  type AttributionTouch,
  type AttributionTouchRequest,
  type FunnelTrackOptions,
  type PublicAttributionConfig,
  type StoredAttribution,
} from './types.js';
import {
  clampWindowDays,
  generateVisitorKey,
  isTouchExpired,
  isValidVisitorKey,
  normalizeConfig,
  parseTouch,
  sanitizeStoredTouch,
} from './attributionRules.js';
import { FunnelTracker } from './funnelTracker.js';

const DEFAULT_WINDOW_DAYS = 30;

interface Landing {
  href: string;
  referrer: string | null;
}

export class AttributionService {
  private readonly enabled: boolean;
  private readonly defaultWindowDays: number;
  private readonly platform: AttributionPlatform;
  private appId: string;
  private config: PublicAttributionConfig | null = null;
  private visitorKey: string = generateVisitorKey();
  private first: AttributionTouch | null = null;
  private last: AttributionTouch | null = null;
  private persisted = false;
  private snapshot: AttributionState;
  private initPromise: Promise<AttributionState> | null = null;
  private consentUnsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<AttributionChangeListener>();
  /** `${visitorKey}|${landingPath}` pairs already beaconed during this page load. */
  private readonly beaconed = new Set<string>();
  /** Serializes storage writes and removals so an older one can never land after a newer one. */
  private storageChain: Promise<void> = Promise.resolve();
  private readonly tracker: FunnelTracker;
  /** The last URL captured, so a history-hook navigation never re-captures what captureUrl just did. */
  private lastCapturedHref: string | null = null;
  /** The persistence category was granted at the last consent check (to spot a withdrawal). */
  private consentWasGranted = false;
  /** Consent was withdrawn during this page load: no sessionStorage mirror until the next load. */
  private mirrorBlocked = false;

  constructor(
    private readonly http: HttpClient,
    private readonly storage: StorageAdapter,
    private readonly consent: AttributionConsentSource,
    private readonly events: WildwoodEventEmitter | null,
    defaultAppId: string,
    options?: AttributionServiceOptions,
  ) {
    this.enabled = options?.enabled !== false;
    this.defaultWindowDays = clampWindowDays(options?.defaultWindowDays, DEFAULT_WINDOW_DAYS);
    this.platform = options?.platform ?? (typeof document !== 'undefined' ? 'web' : 'unknown');
    this.appId = defaultAppId;
    this.tracker = new FunnelTracker(
      {
        getAppId: () => this.appId,
        getVisitorKey: () => this.visitorKey,
        getLastTouch: () => this.last,
        post: (path, body) => this.http.post(path, body, { skipAuth: true }),
        resolveUrl: (path) => (typeof this.http.resolveUrl === 'function' ? this.http.resolveUrl(path) : null),
        captureNavigation: (href) => this.captureNavigation(href),
        sessionChanged: () => {
          if (this.config) void this.schedulePersist();
        },
      },
      this.platform,
      options?.getDeviceClass,
    );
    this.snapshot = this.buildSnapshot();
  }

  // ---- Public API -----------------------------------------------------------

  /**
   * Captures the landing URL, loads the app config, restores stored touches and applies the consent
   * gate. Idempotent, and never rejects.
   */
  initialize(appId?: string): Promise<AttributionState> {
    if (this.initPromise) {
      // Re-arm the consent subscription a dispose() may have dropped: React StrictMode re-runs the
      // provider effect against the same client.
      void this.initPromise.then(() => {
        this.tracker.start();
        return this.schedulePersist();
      });
      return this.initPromise;
    }

    // Read the URL synchronously, before anything awaits: the host app may redirect or strip the query
    // string as soon as it renders.
    const landing = readLanding();
    this.initPromise = this.run(appId, landing).catch((err: unknown) => {
      console.warn('[AttributionService] initialize failed', err);
      return this.snapshot;
    });
    return this.initPromise;
  }

  /**
   * Parses a URL (a deep link, an SPA navigation) and applies it as a touch. Returns the touch, or null
   * for a direct visit, which never overwrites stored touches.
   */
  captureUrl(url: string, referrer?: string | null): AttributionTouch | null {
    if (!this.enabled || (this.config !== null && !this.config.isEnabled)) return null;
    const touch = this.captureTouch(url, referrer ?? null);
    this.lastCapturedHref = url;
    // A page_view when the path changed (the SPA / deep-link navigation path; a no-op until enabled).
    this.tracker.notifyNavigation(url);
    if (!touch) return null;
    void this.schedulePersist();
    this.maybeBeacon(touch);
    this.changed();
    return touch;
  }

  getState(): AttributionState {
    return this.snapshot;
  }

  /** The payload for a registration request, or null when capture is off or nothing was captured. */
  getForRegistration(): AttributionPayload | null {
    if (!this.enabled || (this.config !== null && !this.config.isEnabled)) return null;
    if (!this.first && !this.last) return null;
    const session = this.tracker.getSession(Date.now(), true);
    return {
      version: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: this.visitorKey,
      firstTouch: this.first,
      lastTouch: this.last,
      platform: this.platform,
      sdk: 'js',
      sessionKey: session.sessionKey,
      deviceClass: this.tracker.getDeviceClass(),
      sessionCount: session.sessionCount,
    };
  }

  /**
   * Tracks a funnel event (page_view, cta_click, signup_start, a configured custom name...). Buffered
   * until the config loads; dropped when funnel tracking is off, the name is not allowed, or it is a
   * one-shot already sent this session. Never throws.
   */
  track(name: string, options?: FunnelTrackOptions): void {
    if (!this.enabled) return;
    this.tracker.track(name, options);
  }

  /** Tracks a cta_click with this label. */
  trackCta(label: string): void {
    if (!this.enabled) return;
    this.tracker.trackCta(label);
  }

  /** Sends the queued funnel events now. Never rejects. */
  flush(): Promise<void> {
    return this.tracker.flush();
  }

  /** Drops the touches from memory and storage (after a recorded signup). The visitor key is kept. */
  clear(): void {
    this.first = null;
    this.last = null;
    this.persisted = false;
    this.enqueueStorage(async () => {
      await this.removeStored();
      removeMirror();
      // With funnel tracking on, the visitor and session keys stay stored where consent allows.
      if (this.config?.funnelTrackingEnabled) await this.persistIfAllowed();
    });
    this.changed();
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener: AttributionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Stops listening for consent changes, removes the funnel listeners and sends queued funnel events.
   * State is kept; a later initialize() re-arms both.
   */
  dispose(): void {
    try {
      this.tracker.stop();
    } catch {
      /* best-effort */
    }
    const unsubscribe = this.consentUnsubscribe;
    this.consentUnsubscribe = null;
    try {
      unsubscribe?.();
    } catch {
      /* best-effort */
    }
  }

  // ---- Initialization -------------------------------------------------------

  private async run(appId: string | undefined, landing: Landing | null): Promise<AttributionState> {
    if (appId) this.appId = appId;
    if (!this.enabled) return this.snapshot;

    const configPromise = this.appId ? this.fetchConfig(this.appId) : Promise.resolve(null);
    const stored = await this.readStored();
    this.config = await configPromise;

    if (this.config && !this.config.isEnabled) {
      // Attribution is off for this app: hold nothing, and remove what an earlier visit stored.
      this.first = null;
      this.last = null;
      this.persisted = false;
      this.tracker.setConfig(this.config);
      await this.enqueueStorage(async () => {
        await this.removeStored();
        removeMirror();
      });
      this.changed();
      return this.snapshot;
    }

    // The localStorage blob wins; the sessionStorage mirror stands in before consent (same-tab reload).
    const mirror = !stored && this.config?.sessionStoragePersistenceBeforeConsent ? readMirror() : null;
    const restored = stored ?? mirror;
    if (restored) {
      if (isValidVisitorKey(restored.visitorKey)) this.visitorKey = restored.visitorKey;
      const anchor = restored.first ?? restored.last;
      if (anchor && !isTouchExpired(anchor, this.windowDays(), Date.now())) {
        // A touch captured through captureUrl() while this awaited is newer than anything stored.
        this.first = restored.first ?? this.first;
        this.last = this.last ?? restored.last;
      }
      this.tracker.restoreSession(
        {
          sessionKey: restored.sessionKey ?? undefined,
          lastActivityAt: restored.lastActivityAt ?? undefined,
          sessionCount: restored.sessionCount ?? undefined,
        },
        stored !== null,
      );
    }
    // Returning = a visitor known from localStorage (not the same-tab mirror) starting another session.
    const session = this.tracker.getSession();
    this.tracker.setReturning(stored !== null && session.sessionCount >= 2);

    const touch = landing ? this.captureTouch(landing.href, landing.referrer) : null;
    if (landing) this.lastCapturedHref = landing.href;
    await this.schedulePersist();
    if (touch) this.maybeBeacon(touch);
    this.changed();
    // Starts the funnel listeners (and the landing page_view) when the app has funnel tracking on.
    this.tracker.setConfig(this.config);
    return this.snapshot;
  }

  private async fetchConfig(appId: string): Promise<PublicAttributionConfig | null> {
    try {
      const { data } = await this.http.get<PublicAttributionConfig>(
        `api/attribution/config?appId=${encodeURIComponent(appId)}`,
        { skipAuth: true },
      );
      return normalizeConfig(data, appId, this.defaultWindowDays);
    } catch {
      // Fail open for capture (registration still carries the touch) and closed for persistence.
      return null;
    }
  }

  // ---- Capture --------------------------------------------------------------

  /** A navigation seen by the funnel history hooks; skips the URL captureUrl() already captured. */
  private captureNavigation(href: string): void {
    if (!this.enabled || !this.config?.isEnabled || href === this.lastCapturedHref) return;
    this.lastCapturedHref = href;
    const touch = this.captureTouch(href, null);
    if (!touch) return;
    void this.schedulePersist();
    this.maybeBeacon(touch);
    this.changed();
  }

  private captureTouch(href: string, referrer: string | null): AttributionTouch | null {
    let touch: AttributionTouch | null;
    try {
      touch = parseTouch(href, referrer, {
        captureClickIds: this.config?.captureClickIds ?? true,
        captureReferrer: this.config?.captureReferrer ?? true,
        extraAllowedParamNames: this.config?.extraAllowedParamNames ?? [],
      });
    } catch {
      return null;
    }
    if (!touch) return null;

    if (this.first && isTouchExpired(this.first, this.windowDays(), Date.now())) {
      this.first = null;
      this.last = null;
    }
    this.last = touch;
    this.first = this.first ?? touch;
    this.events?.emit('attributionCaptured', touch);
    return touch;
  }

  private maybeBeacon(touch: AttributionTouch): void {
    const config = this.config;
    if (!config?.isEnabled || !config.beaconEnabled || !this.appId) return;

    const key = `${this.visitorKey}|${touch.landingPath ?? ''}`;
    if (this.beaconed.has(key)) return;
    this.beaconed.add(key);

    const body: AttributionTouchRequest = {
      appId: this.appId,
      visitorKey: this.visitorKey,
      touch,
      platform: this.platform,
    };
    try {
      // appId rides in the query string too: the server's rate-limit partition reads ?appId=, and the
      // server refuses a query value that differs from the body. HttpClient never replays a POST.
      void this.http
        .post(`api/attribution/touch?appId=${encodeURIComponent(this.appId)}`, body, { skipAuth: true })
        .catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  // ---- Consent-gated persistence -------------------------------------------

  private schedulePersist(): Promise<void> {
    return this.enqueueStorage(() => this.persistIfAllowed());
  }

  private enqueueStorage(work: () => Promise<void>): Promise<void> {
    this.storageChain = this.storageChain.then(work).catch(() => undefined);
    return this.storageChain;
  }

  private async persistIfAllowed(): Promise<void> {
    const config = this.config;
    // No config (not loaded, or the request failed) or attribution off: memory only.
    if (!config?.isEnabled) return;

    this.ensureConsentSubscription();

    const category = config.persistenceConsentCategory;
    let allowed: boolean;
    let consentState: ConsentState | null;
    try {
      allowed = category === 'StrictlyNecessary' || this.consent.isGranted(category);
      consentState = this.consent.getState();
    } catch {
      return;
    }
    // With funnel tracking on, a direct visitor's visitor and session keys are worth keeping too.
    const hasData = this.first !== null || this.last !== null || config.funnelTrackingEnabled;

    if (allowed) {
      this.consentWasGranted = true;
      if (hasData) {
        await this.writeStored();
        this.setPersisted(true);
      } else {
        await this.removeStored();
        this.setPersisted(false);
      }
      // Granted: localStorage holds it now, so the pre-consent mirror goes.
      removeMirror();
      return;
    }

    if (this.consentWasGranted) {
      // Withdrawn during this page load: both copies go, and no mirror until the next load.
      this.consentWasGranted = false;
      this.mirrorBlocked = true;
    }

    if (consentState !== null) {
      // Consent state exists and does not grant the category: declined, withdrawn (which leaves the visitor
      // undecided), or not answered since the consent config changed. No localStorage copy.
      await this.removeStored();
      this.setPersisted(false);
    }
    // No consent state yet (the consent engine has not initialized): nothing in localStorage; the consent
    // subscription retries on every change.

    // Undecided (no state, or no decision yet) may keep the same-tab sessionStorage mirror when the app
    // allows it; a declined decision or a withdrawal may not.
    const undecided = consentState === null || !consentState.decided;
    if (config.sessionStoragePersistenceBeforeConsent && undecided && !this.mirrorBlocked && hasData) {
      writeMirror(this.buildMirror());
    } else {
      removeMirror();
    }
  }

  private ensureConsentSubscription(): void {
    if (this.consentUnsubscribe) return;
    try {
      this.consentUnsubscribe = this.consent.onConsentChange(() => {
        void this.schedulePersist();
      });
    } catch {
      /* consent engine unavailable: persistence stays memory-only */
    }
  }

  private setPersisted(value: boolean): void {
    if (this.persisted === value) return;
    this.persisted = value;
    this.changed();
  }

  private async readStored(): Promise<StoredAttribution | null> {
    try {
      const raw = await this.storage.getItem(ATTRIBUTION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredAttribution> | null;
      if (!parsed || parsed.v !== ATTRIBUTION_SCHEMA_VERSION || typeof parsed.visitorKey !== 'string') return null;
      return {
        v: ATTRIBUTION_SCHEMA_VERSION,
        visitorKey: parsed.visitorKey,
        first: sanitizeStoredTouch(parsed.first),
        last: sanitizeStoredTouch(parsed.last),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        ...sanitizeSessionFields(parsed),
      };
    } catch {
      return null;
    }
  }

  private async writeStored(): Promise<void> {
    const session = this.tracker.peekSession();
    const blob: StoredAttribution = {
      v: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: this.visitorKey,
      first: this.first,
      last: this.last,
      updatedAt: new Date().toISOString(),
      sessionKey: session?.sessionKey ?? null,
      lastActivityAt: session?.lastActivityAt ?? null,
      sessionCount: session?.sessionCount ?? null,
    };
    try {
      await this.storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(blob));
    } catch {
      /* persistence is best-effort */
    }
  }

  private async removeStored(): Promise<void> {
    try {
      await this.storage.removeItem(ATTRIBUTION_STORAGE_KEY);
    } catch {
      /* best-effort */
    }
  }

  private buildMirror(): AttributionSessionMirror {
    const session = this.tracker.peekSession();
    return {
      v: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: this.visitorKey,
      sessionKey: session?.sessionKey ?? null,
      lastActivityAt: session?.lastActivityAt ?? null,
      sessionCount: session?.sessionCount ?? null,
      first: this.first,
      last: this.last,
      updatedAt: new Date().toISOString(),
    };
  }

  // ---- State ----------------------------------------------------------------

  private windowDays(): number {
    return this.config?.attributionWindowDays ?? this.defaultWindowDays;
  }

  private buildSnapshot(): AttributionState {
    return {
      visitorKey: this.visitorKey,
      first: this.first,
      last: this.last,
      persisted: this.persisted,
      config: this.config,
    };
  }

  private changed(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (err) {
        console.warn('[AttributionService] change listener threw', err);
      }
    }
  }
}

// ---- sessionStorage mirror ---------------------------------------------------------------------------
// Synchronous and only called from inside the storage chain, so mirror writes stay ordered with the
// localStorage writes and removals. Every access is guarded: sessionStorage throws in some private modes.

function sessionStore(): Storage | null {
  try {
    const store = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return store && typeof store.getItem === 'function' ? store : null;
  } catch {
    return null;
  }
}

function readMirror(): AttributionSessionMirror | null {
  try {
    const raw = sessionStore()?.getItem(ATTRIBUTION_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttributionSessionMirror> | null;
    if (!parsed || parsed.v !== ATTRIBUTION_SCHEMA_VERSION || !isValidVisitorKey(parsed.visitorKey)) return null;
    const session = sanitizeSessionFields(parsed);
    return {
      v: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: parsed.visitorKey,
      sessionKey: session.sessionKey ?? null,
      lastActivityAt: session.lastActivityAt ?? null,
      sessionCount: session.sessionCount ?? null,
      first: sanitizeStoredTouch(parsed.first),
      last: sanitizeStoredTouch(parsed.last),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function writeMirror(mirror: AttributionSessionMirror): void {
  try {
    sessionStore()?.setItem(ATTRIBUTION_SESSION_STORAGE_KEY, JSON.stringify(mirror));
  } catch {
    /* quota or private mode: best-effort */
  }
}

function removeMirror(): void {
  try {
    sessionStore()?.removeItem(ATTRIBUTION_SESSION_STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

function sanitizeSessionFields(value: {
  sessionKey?: unknown;
  lastActivityAt?: unknown;
  sessionCount?: unknown;
}): Pick<StoredAttribution, 'sessionKey' | 'lastActivityAt' | 'sessionCount'> {
  const count = value.sessionCount;
  return {
    sessionKey: isValidVisitorKey(value.sessionKey) ? value.sessionKey : null,
    lastActivityAt:
      typeof value.lastActivityAt === 'number' && Number.isFinite(value.lastActivityAt) ? value.lastActivityAt : null,
    sessionCount: typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : null,
  };
}

function readLanding(): Landing | null {
  try {
    if (typeof window === 'undefined') return null;
    const href = window.location?.href;
    if (typeof href !== 'string' || href.length === 0) return null;
    const referrer = typeof document !== 'undefined' && typeof document.referrer === 'string' ? document.referrer : '';
    return { href, referrer: referrer || null };
  } catch {
    return null;
  }
}
