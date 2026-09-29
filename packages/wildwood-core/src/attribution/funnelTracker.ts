// Campaign Attribution funnel tracker - internal to AttributionService.
// Keeps the funnel session (30-minute inactivity window), validates and queues funnel events, flushes
// them in batches of at most 25 (every 5 s, and by sendBeacon when the page is hidden or unloads), and
// on the web runs the config-gated auto listeners: SPA page_view, scroll depth, visible-time engagement,
// time on page and delegated [data-ww-cta] clicks.
//
// Like the rest of attribution it never throws into the host app, and it touches no DOM at import time.

import type {
  AttributionDeviceClass,
  AttributionEventsRequest,
  AttributionPlatform,
  AttributionTouch,
  FunnelEvent,
  FunnelTrackOptions,
  PublicAttributionConfig,
} from './types.js';
import { FUNNEL_CLIENT_EVENTS, FUNNEL_SERVER_ONLY_EVENTS } from './types.js';
import {
  FUNNEL_EVENT_NAME,
  PATH_MAX_LENGTH,
  generateVisitorKey,
  isValidVisitorKey,
  normalizeToken,
} from './attributionRules.js';

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const FLUSH_INTERVAL_MS = 5000;
export const MAX_EVENTS_PER_REQUEST = 25;
export const MAX_PENDING_BEFORE_CONFIG = 50;
export const MAX_QUEUED_EVENTS = 200;
export const ENGAGED_VISIBLE_MS = 10_000;
export const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
export const MAX_TIME_ON_PAGE_SECONDS = 86_400;
const LABEL_MAX_LENGTH = 100;
/** Keeps a request body well under the server's 32 KB cap. */
const MAX_BODY_CHARS = 30_000;
const SCROLL_THROTTLE_MS = 150;
const EVENTS_PATH = 'api/attribution/events';

const CLIENT_EVENTS: ReadonlySet<string> = new Set(FUNNEL_CLIENT_EVENTS);
const SERVER_ONLY_EVENTS: ReadonlySet<string> = new Set(FUNNEL_SERVER_ONLY_EVENTS);
/** Sent at most once per session per label (the server dedups these too). */
const ONE_SHOT_PER_LABEL: ReadonlySet<string> = new Set([
  'signup_view',
  'signup_start',
  'signup_submit',
  'plan_selected',
  'checkout_start',
]);
const SIGNUP_STEP_EVENTS: ReadonlySet<string> = new Set([
  'signup_view',
  'signup_start',
  'signup_submit',
  'signup_error',
]);

export interface FunnelSession {
  sessionKey: string;
  /** Epoch milliseconds of the last tracked activity. */
  lastActivityAt: number;
  /** Sessions this visitor has started, counting this one. */
  sessionCount: number;
}

/** What the tracker needs from AttributionService. */
export interface FunnelTrackerHost {
  getAppId(): string;
  getVisitorKey(): string;
  /** The visitor's current last touch; null for a direct visit. */
  getLastTouch(): AttributionTouch | null;
  /** Posts a batch through the SDK HTTP client (unauthenticated). */
  post(path: string, body: AttributionEventsRequest): Promise<unknown>;
  /** The absolute URL of `path`, for sendBeacon / keepalive fetch; null when it cannot be resolved. */
  resolveUrl(path: string): string | null;
  /** An SPA navigation seen by the history hooks: apply the URL as a touch (the host skips repeats). */
  captureNavigation(href: string): void;
  /** The session changed (new key, or activity worth persisting). */
  sessionChanged(): void;
}

interface PendingCall {
  name: string;
  options: FunnelTrackOptions | undefined;
  at: number;
  path: string | null;
}

interface QueuedEvent {
  sessionKey: string;
  event: FunnelEvent;
}

type Listener = [EventTarget, string, EventListener, AddEventListenerOptions | boolean];

export class FunnelTracker {
  private config: PublicAttributionConfig | null = null;
  private configResolved = false;
  private session: FunnelSession | null = null;
  private returning = false;
  private pending: PendingCall[] = [];
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private started = false;
  private listeners: Listener[] = [];
  private restoreHistory: (() => void) | null = null;

  private currentPath: string | null = null;
  private readonly oneShots = new Set<string>();
  private engagedSession: string | null = null;
  private pageMilestones = new Set<number>();
  private pageMaxScroll = 0;
  private interacted = false;
  /** Epoch ms the page last became visible, or null while hidden. */
  private visibleSince: number | null = null;
  private pageVisibleMs = 0;
  private loadVisibleMs = 0;
  private engageTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly host: FunnelTrackerHost,
    private readonly platform: AttributionPlatform,
    private readonly deviceClassOverride?: () => AttributionDeviceClass,
  ) {}

  // ---- Config ---------------------------------------------------------------

  /**
   * Applies the loaded config (null when it could not be fetched). With funnel tracking on, events
   * buffered before now are replayed and the auto listeners start; otherwise the buffer is dropped.
   */
  setConfig(config: PublicAttributionConfig | null): void {
    this.config = config;
    this.configResolved = true;
    const pending = this.pending;
    this.pending = [];
    if (!this.isEnabled()) return;
    for (const call of pending) this.accept(call.name, call.options, call.at, call.path);
    this.start();
  }

  isEnabled(): boolean {
    return this.config?.isEnabled === true && this.config.funnelTrackingEnabled === true;
  }

  // ---- Session --------------------------------------------------------------

  /** Restores a stored session. `priorVisit` marks a stored visitor that predates session tracking. */
  restoreSession(stored: Partial<FunnelSession> | null, priorVisit: boolean): void {
    const count =
      typeof stored?.sessionCount === 'number' && Number.isInteger(stored.sessionCount) && stored.sessionCount > 0
        ? stored.sessionCount
        : priorVisit
          ? 1
          : 0;
    const at = stored?.lastActivityAt;
    if (isValidVisitorKey(stored?.sessionKey) && typeof at === 'number' && Number.isFinite(at)) {
      this.session = { sessionKey: stored.sessionKey, lastActivityAt: at, sessionCount: Math.max(count, 1) };
    } else if (count > 0) {
      // Force a new session on next use, counting on from the stored one.
      this.session = { sessionKey: '', lastActivityAt: Number.NEGATIVE_INFINITY, sessionCount: count };
    }
  }

  /** The current session, starting a new one when there is none or the last activity is 30+ minutes old. */
  getSession(now: number = Date.now(), bump = false): FunnelSession {
    const current = this.session;
    if (!current || !current.sessionKey || now - current.lastActivityAt > SESSION_TIMEOUT_MS) {
      const next: FunnelSession = {
        sessionKey: generateVisitorKey(),
        lastActivityAt: now,
        sessionCount: (current?.sessionCount ?? 0) + 1,
      };
      this.session = next;
      this.oneShots.clear();
      this.engagedSession = null;
      this.host.sessionChanged();
      return next;
    }
    if (bump && now > current.lastActivityAt) current.lastActivityAt = now;
    return current;
  }

  /** The session as held, without starting one. */
  peekSession(): FunnelSession | null {
    return this.session?.sessionKey ? this.session : null;
  }

  setReturning(value: boolean): void {
    this.returning = value;
  }

  isReturning(): boolean {
    return this.returning;
  }

  /** Viewport/pointer bucket: < 768 mobile, < 1024 tablet (a coarse pointer stretches it to 1280). */
  getDeviceClass(): AttributionDeviceClass {
    try {
      if (this.deviceClassOverride) return this.deviceClassOverride();
      if (typeof window !== 'undefined' && !this.isNative()) {
        const width = window.innerWidth;
        if (typeof width === 'number' && width > 0) {
          const coarse =
            typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches === true;
          if (width < 768) return 'mobile';
          if (width < 1024 || (coarse && width < 1280)) return 'tablet';
          return 'desktop';
        }
      }
    } catch {
      /* fall through */
    }
    return this.platform === 'ios' || this.platform === 'android' ? 'mobile' : 'desktop';
  }

  // ---- Tracking -------------------------------------------------------------

  /** Queues a funnel event. Before the config loads it is buffered; invalid or disallowed names are dropped. */
  track(name: string, options?: FunnelTrackOptions): void {
    try {
      const at = Date.now();
      if (!this.configResolved) {
        if (this.pending.length < MAX_PENDING_BEFORE_CONFIG) {
          this.pending.push({ name, options, at, path: this.currentPath });
        }
        return;
      }
      if (!this.isEnabled()) return;
      this.accept(name, options, at, this.currentPath);
    } catch {
      /* never throw into the host app */
    }
  }

  trackCta(label: string): void {
    this.track('cta_click', { label });
  }

  /**
   * A navigation to `href` (from captureUrl or the history hooks): records a page_view when the path
   * changed, closing the previous page's time_on_page and scroll milestones first.
   */
  notifyNavigation(href: string): void {
    const path = pathOf(href);
    if (path === null || path === this.currentPath) return;
    if (this.currentPath !== null) this.emitTimeOnPage();
    this.currentPath = path;
    this.pageMilestones = new Set();
    this.pageMaxScroll = 0;
    this.pageVisibleMs = 0;
    if (this.visibleSince !== null) this.visibleSince = Date.now();
    this.track('page_view');
  }

  // ---- Queue & transport ----------------------------------------------------

  /** Posts every queued event now through the HTTP client. Never rejects. */
  async flush(): Promise<void> {
    this.clearFlushTimer();
    const batches = this.takeBatches();
    if (batches.length === 0) return;
    this.host.sessionChanged();
    await Promise.all(
      batches.map((body) => {
        try {
          return this.host.post(this.eventsPath(body.appId), body).catch(() => undefined);
        } catch {
          return undefined;
        }
      }),
    );
  }

  /** Sends every queued event with sendBeacon (fetch keepalive as fallback), for a page being hidden. */
  flushWithBeacon(): void {
    this.clearFlushTimer();
    const batches = this.takeBatches();
    if (batches.length === 0) return;
    this.host.sessionChanged();
    for (const body of batches) {
      try {
        const path = this.eventsPath(body.appId);
        const url = this.host.resolveUrl(path);
        if (!url) {
          void this.host.post(path, body).catch(() => undefined);
          continue;
        }
        sendUnloadSafe(url, JSON.stringify(body));
      } catch {
        /* analytics: drop */
      }
    }
  }

  // ---- Lifecycle ------------------------------------------------------------

  /** Attaches the auto listeners (web only). Idempotent; a no-op until the config enables tracking. */
  start(): void {
    if (this.started || !this.isEnabled()) return;
    this.started = true;
    if (!this.hasDom()) return;
    try {
      this.attachListeners();
      // The landing page_view (unless captureUrl already recorded this path).
      this.notifyNavigation(window.location.href);
    } catch {
      /* best-effort */
    }
  }

  /** Removes listeners, restores history, clears timers and sends what is queued. */
  stop(): void {
    this.started = false;
    for (const [target, type, listener, options] of this.listeners) {
      try {
        target.removeEventListener(type, listener, options);
      } catch {
        /* best-effort */
      }
    }
    this.listeners = [];
    try {
      this.restoreHistory?.();
    } catch {
      /* best-effort */
    }
    this.restoreHistory = null;
    this.pauseVisible();
    this.clearTimer('engageTimer');
    this.clearTimer('scrollTimer');
    if (this.queue.length > 0) this.flushWithBeacon();
    this.clearFlushTimer();
  }

  // ---- Internals: events ----------------------------------------------------

  private accept(name: string, options: FunnelTrackOptions | undefined, at: number, path: string | null): void {
    const config = this.config;
    if (!config) return;
    if (typeof name !== 'string' || !FUNNEL_EVENT_NAME.test(name) || SERVER_ONLY_EVENTS.has(name)) return;
    if (!CLIENT_EVENTS.has(name) && !config.customEventNames.includes(name)) return;
    if (SIGNUP_STEP_EVENTS.has(name) && !config.trackSignupSteps) return;

    let label = options?.label != null ? normalizeToken(String(options.label), LABEL_MAX_LENGTH, false) : null;
    let value = typeof options?.value === 'number' && Number.isFinite(options.value) ? options.value : null;

    switch (name) {
      case 'cta_click':
        if (label === null) return;
        break;
      case 'signup_error':
        label = errorCategory(label);
        break;
      case 'scroll_depth':
        if (value === null || !(SCROLL_MILESTONES as readonly number[]).includes(value)) return;
        if (this.pageMilestones.has(value)) return;
        this.pageMilestones.add(value);
        break;
      case 'time_on_page':
        if (value === null || value < 0) return;
        value = Math.min(MAX_TIME_ON_PAGE_SECONDS, Math.round(value));
        break;
    }

    // time_on_page closes out time already spent; it never starts or extends a session.
    const session = name === 'time_on_page' ? (this.peekSession() ?? this.getSession(at)) : this.getSession(at, true);

    if (name === 'engaged') {
      if (this.engagedSession === session.sessionKey) return;
      this.engagedSession = session.sessionKey;
    } else if (ONE_SHOT_PER_LABEL.has(name)) {
      const key = `${name}|${label ?? ''}`;
      if (this.oneShots.has(key)) return;
      this.oneShots.add(key);
    }

    const event: FunnelEvent = { name };
    if (label !== null) event.label = label;
    if (value !== null) event.value = value;
    if (path !== null) event.path = path;
    event.clientTimestamp = new Date(at).toISOString();

    if (this.queue.length >= MAX_QUEUED_EVENTS) return;
    this.queue.push({ sessionKey: session.sessionKey, event });
    if (this.queue.length >= MAX_EVENTS_PER_REQUEST) void this.flush();
    else this.ensureFlushTimer();
  }

  private takeBatches(): AttributionEventsRequest[] {
    const queued = this.queue;
    this.queue = [];
    const appId = this.host.getAppId();
    if (queued.length === 0 || !appId) return [];

    const base = {
      appId,
      visitorKey: this.host.getVisitorKey(),
      isReturning: this.returning,
      deviceClass: this.getDeviceClass(),
      platform: this.platform,
      touch: this.host.getLastTouch(),
    };
    const batches: AttributionEventsRequest[] = [];
    let i = 0;
    while (i < queued.length) {
      const sessionKey = queued[i].sessionKey;
      let size = 0;
      while (i + size < queued.length && size < MAX_EVENTS_PER_REQUEST && queued[i + size].sessionKey === sessionKey) {
        size++;
      }
      let body: AttributionEventsRequest;
      for (;;) {
        body = { ...base, sessionKey, events: queued.slice(i, i + size).map((q) => q.event) };
        if (size === 1 || JSON.stringify(body).length <= MAX_BODY_CHARS) break;
        size = Math.ceil(size / 2);
      }
      if (JSON.stringify(body).length <= MAX_BODY_CHARS) batches.push(body);
      i += size;
    }
    return batches;
  }

  private eventsPath(appId: string): string {
    // appId rides in the query too: the server's rate-limit partition reads ?appId=.
    return `${EVENTS_PATH}?appId=${encodeURIComponent(appId)}`;
  }

  private ensureFlushTimer(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    unref(this.flushTimer);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private clearTimer(name: 'engageTimer' | 'scrollTimer'): void {
    const timer = this[name];
    if (timer !== null) clearTimeout(timer);
    this[name] = null;
  }

  // ---- Internals: DOM listeners --------------------------------------------

  private isNative(): boolean {
    if (this.platform === 'ios' || this.platform === 'android') return true;
    try {
      return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
    } catch {
      return false;
    }
  }

  private hasDom(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      typeof document.addEventListener === 'function' &&
      !this.isNative()
    );
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options: AddEventListenerOptions | boolean = { passive: true },
  ): void {
    const safe: EventListener = (event) => {
      try {
        listener(event);
      } catch {
        /* never throw into the host app */
      }
    };
    target.addEventListener(type, safe, options);
    this.listeners.push([target, type, safe, options]);
  }

  private attachListeners(): void {
    const config = this.config!;
    if (document.visibilityState !== 'hidden') this.visibleSince = Date.now();

    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.pauseVisible();
        this.flushWithBeacon();
      } else {
        this.resumeVisible();
      }
    });
    this.listen(window, 'pagehide', () => {
      this.pauseVisible();
      this.emitTimeOnPage();
      this.flushWithBeacon();
    });
    this.listen(window, 'pageshow', () => {
      if (document.visibilityState !== 'hidden') this.resumeVisible();
    });

    if (config.trackScrollDepth || config.trackEngagement) {
      this.listen(window, 'scroll', () => {
        this.markInteraction();
        if (this.scrollTimer !== null) return;
        this.scrollTimer = setTimeout(() => {
          this.scrollTimer = null;
          this.checkScroll();
        }, SCROLL_THROTTLE_MS);
      });
    }
    if (config.trackEngagement) {
      for (const type of ['keydown', 'touchstart']) {
        this.listen(document, type, () => this.markInteraction(), { capture: true, passive: true });
      }
    }
    if (config.trackEngagement || config.autoTrackCtaClicks) {
      this.listen(
        document,
        'click',
        (event) => {
          this.markInteraction();
          if (!this.config?.autoTrackCtaClicks) return;
          const cta = findCta(event.target);
          const label = cta?.getAttribute('data-ww-cta');
          if (label != null) this.trackCta(label);
        },
        { capture: true, passive: true },
      );
    }

    this.hookHistory();
    this.listen(window, 'popstate', () => this.onHistoryNavigation());
  }

  private hookHistory(): void {
    const history = window.history;
    if (!history || typeof history.pushState !== 'function' || typeof history.replaceState !== 'function') return;
    const onNavigate = (): void => this.onHistoryNavigation();
    const originals = { pushState: history.pushState, replaceState: history.replaceState };
    const wrap = (original: History['pushState']): History['pushState'] =>
      function wrapped(this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        try {
          onNavigate();
        } catch {
          /* best-effort */
        }
        return result;
      };
    const pushState = wrap(originals.pushState);
    const replaceState = wrap(originals.replaceState);
    history.pushState = pushState;
    history.replaceState = replaceState;
    this.restoreHistory = () => {
      // Leave a wrapper someone installed after ours in place.
      if (history.pushState === pushState) history.pushState = originals.pushState;
      if (history.replaceState === replaceState) history.replaceState = originals.replaceState;
    };
  }

  private onHistoryNavigation(): void {
    if (!this.started) return;
    const href = window.location?.href;
    if (typeof href !== 'string' || href.length === 0) return;
    this.host.captureNavigation(href);
    this.notifyNavigation(href);
  }

  private markInteraction(): void {
    if (!this.config?.trackEngagement || this.interacted) return;
    this.interacted = true;
    this.checkEngaged();
  }

  private checkScroll(): void {
    const percent = scrollPercent();
    if (percent === null) return;
    this.pageMaxScroll = Math.max(this.pageMaxScroll, percent);
    if (this.config?.trackScrollDepth) {
      for (const milestone of SCROLL_MILESTONES) {
        const reached = milestone === 100 ? percent >= 99 : percent >= milestone;
        if (reached && !this.pageMilestones.has(milestone)) this.track('scroll_depth', { value: milestone });
      }
    }
    this.checkEngaged();
  }

  private checkEngaged(): void {
    this.clearTimer('engageTimer');
    if (!this.config?.trackEngagement || !this.started) return;
    const session = this.peekSession();
    if (
      session &&
      this.engagedSession === session.sessionKey &&
      Date.now() - session.lastActivityAt <= SESSION_TIMEOUT_MS
    ) {
      return;
    }
    const visible = this.loadVisibleMs + (this.visibleSince !== null ? Date.now() - this.visibleSince : 0);
    if (this.pageMaxScroll >= 50 || (this.interacted && visible >= ENGAGED_VISIBLE_MS)) {
      this.track('engaged');
      return;
    }
    if (this.interacted && this.visibleSince !== null) {
      this.engageTimer = setTimeout(() => {
        this.engageTimer = null;
        this.checkEngaged();
      }, ENGAGED_VISIBLE_MS - visible);
      unref(this.engageTimer);
    }
  }

  private pauseVisible(): void {
    if (this.visibleSince === null) return;
    const elapsed = Math.max(0, Date.now() - this.visibleSince);
    this.pageVisibleMs += elapsed;
    this.loadVisibleMs += elapsed;
    this.visibleSince = null;
    this.clearTimer('engageTimer');
  }

  private resumeVisible(): void {
    if (this.visibleSince !== null || !this.started) return;
    this.visibleSince = Date.now();
    this.checkEngaged();
  }

  private emitTimeOnPage(): void {
    if (!this.config?.trackEngagement || !this.started) return;
    let ms = this.pageVisibleMs;
    if (this.visibleSince !== null) {
      const now = Date.now();
      ms += now - this.visibleSince;
      this.loadVisibleMs += now - this.visibleSince;
      this.visibleSince = now;
    }
    this.pageVisibleMs = 0;
    const seconds = Math.round(ms / 1000);
    if (seconds >= 1) this.track('time_on_page', { value: seconds });
  }
}

// ---- Helpers --------------------------------------------------------------------------------------

function pathOf(href: string): string | null {
  try {
    const path = new URL(href).pathname || '/';
    return path.length <= PATH_MAX_LENGTH ? path : path.slice(0, PATH_MAX_LENGTH);
  } catch {
    return null;
  }
}

/** A signup_error label reduced to the server's category shape (^[a-z0-9_]{1,40}$). */
function errorCategory(label: string | null): string {
  const category = (label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  return category.length > 0 ? category : 'unknown';
}

function findCta(target: EventTarget | null): Element | null {
  let node = target as (Partial<Element> & { parentElement?: Element | null }) | null;
  if (node && typeof node.closest !== 'function') node = node.parentElement ?? null;
  if (!node || typeof node.closest !== 'function') return null;
  return node.closest('[data-ww-cta]');
}

function scrollPercent(): number | null {
  const root = document.documentElement;
  const height = Math.max(root?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0);
  const viewport = window.innerHeight;
  if (!(height > 0) || typeof viewport !== 'number') return null;
  const top = typeof window.scrollY === 'number' ? window.scrollY : (root?.scrollTop ?? 0);
  return Math.min(100, ((top + viewport) / height) * 100);
}

function sendUnloadSafe(url: string, json: string): void {
  const type = 'text/plain;charset=UTF-8';
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.sendBeacon === 'function' && typeof Blob !== 'undefined') {
      if (nav.sendBeacon(url, new Blob([json], { type }))) return;
    }
  } catch {
    /* fall back to fetch */
  }
  try {
    if (typeof fetch !== 'function') return;
    void fetch(url, {
      method: 'POST',
      body: json,
      headers: { 'Content-Type': type },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    /* analytics: drop */
  }
}

function unref(timer: unknown): void {
  const t = timer as { unref?: () => void } | null;
  if (t && typeof t.unref === 'function') t.unref();
}
