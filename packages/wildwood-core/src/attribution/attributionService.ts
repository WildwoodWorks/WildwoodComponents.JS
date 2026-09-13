// Campaign Attribution core engine - framework-agnostic.
// Captures UTM tags, an ad-platform click id and the external referrer from the landing URL, keeps a
// first and a last touch, persists them only once the app's consent category allows it, beacons the
// landing when the app has the beacon on, and hands the payload to registration.
//
// It never throws into the host app: attribution is measurement, and a failure here must never cost a
// page load or a signup.

import type { HttpClient } from '../client/httpClient.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { StorageAdapter } from '../platform/types.js';
import {
  ATTRIBUTION_SCHEMA_VERSION,
  ATTRIBUTION_STORAGE_KEY,
  type AttributionChangeListener,
  type AttributionConsentSource,
  type AttributionPayload,
  type AttributionPlatform,
  type AttributionServiceOptions,
  type AttributionState,
  type AttributionTouch,
  type AttributionTouchRequest,
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
      void this.initPromise.then(() => this.schedulePersist());
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
    return {
      version: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: this.visitorKey,
      firstTouch: this.first,
      lastTouch: this.last,
      platform: this.platform,
      sdk: 'js',
    };
  }

  /** Drops the touches from memory and storage (after a recorded signup). The visitor key is kept. */
  clear(): void {
    this.first = null;
    this.last = null;
    this.persisted = false;
    this.enqueueStorage(() => this.removeStored());
    this.changed();
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener: AttributionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops listening for consent changes. State is kept; a later initialize() re-arms the listener. */
  dispose(): void {
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
      await this.enqueueStorage(() => this.removeStored());
      this.changed();
      return this.snapshot;
    }

    if (stored) {
      if (isValidVisitorKey(stored.visitorKey)) this.visitorKey = stored.visitorKey;
      const anchor = stored.first ?? stored.last;
      if (anchor && !isTouchExpired(anchor, this.windowDays(), Date.now())) {
        // A touch captured through captureUrl() while this awaited is newer than anything stored.
        this.first = stored.first ?? this.first;
        this.last = this.last ?? stored.last;
      }
    }

    const touch = landing ? this.captureTouch(landing.href, landing.referrer) : null;
    await this.schedulePersist();
    if (touch) this.maybeBeacon(touch);
    this.changed();
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
    let decided: boolean;
    try {
      allowed = category === 'StrictlyNecessary' || this.consent.isGranted(category);
      decided = this.consent.getState()?.decided === true;
    } catch {
      return;
    }

    if (allowed) {
      if (this.first || this.last) {
        await this.writeStored();
        this.setPersisted(true);
      } else {
        await this.removeStored();
        this.setPersisted(false);
      }
      return;
    }

    if (decided) {
      // Declined (or GPC opted the visitor out of the category): memory only, and nothing left behind.
      await this.removeStored();
      this.setPersisted(false);
    }
    // Undecided (no banner answer yet, or the consent engine has not initialized): stay memory-only;
    // the consent subscription retries on every change.
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
      };
    } catch {
      return null;
    }
  }

  private async writeStored(): Promise<void> {
    const blob: StoredAttribution = {
      v: ATTRIBUTION_SCHEMA_VERSION,
      visitorKey: this.visitorKey,
      first: this.first,
      last: this.last,
      updatedAt: new Date().toISOString(),
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
