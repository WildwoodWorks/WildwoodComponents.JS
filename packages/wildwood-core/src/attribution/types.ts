// Campaign Attribution types - shared by the core engine and all framework wrappers.
// Mirrors the WildwoodAPI attribution DTOs (camelCase JSON; enums as PascalCase string names).

import type { ConsentCategory, ConsentState } from '../consent/types.js';

/**
 * Storage key of the persisted attribution blob. The same literal is used by the .NET and Swift SDKs
 * and is parity-checked across the three.
 */
export const ATTRIBUTION_STORAGE_KEY = 'ww_attribution';

/** Schema version of the persisted blob and of the registration payload. */
export const ATTRIBUTION_SCHEMA_VERSION = 1;

/**
 * sessionStorage key of the pre-consent mirror (the touch, visitor key and session key), written only
 * while the visitor is undecided and the app turns `sessionStoragePersistenceBeforeConsent` on.
 */
export const ATTRIBUTION_SESSION_STORAGE_KEY = 'ww_attribution_session';

/** Funnel events a client may send. Configured custom names are allowed on top of these. */
export const FUNNEL_CLIENT_EVENTS = [
  'page_view',
  'engaged',
  'scroll_depth',
  'time_on_page',
  'cta_click',
  'signup_view',
  'signup_start',
  'signup_submit',
  'signup_error',
  'plan_selected',
  'checkout_start',
] as const;

/** Funnel events only the server records. A client request carrying one is refused, so they are dropped. */
export const FUNNEL_SERVER_ONLY_EVENTS = ['signup_complete', 'trial_started', 'purchase'] as const;

export type FunnelClientEventName = (typeof FUNNEL_CLIENT_EVENTS)[number];

/** The standard UTM parameters, read from the landing URL. */
export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/** Ad-platform click ids in priority order: the first one present with a well-formed value wins. */
export const CLICK_ID_PARAMS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid',
  'rdt_cid',
] as const;

export type AttributionPlatform = 'web' | 'ios' | 'android' | 'unknown';

export type AttributionSdk = 'js' | 'dotnet' | 'swift';

/**
 * One campaign touch. Clients pre-reduce (host only, path only, never a query string); the server
 * re-normalizes every value and never trusts them.
 */
export interface AttributionTouch {
  /** utm_source, or the referrer host for a referral touch. Lowercased. */
  source: string | null;
  /** utm_medium, or "referral". Lowercased. */
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  /** Click-id parameter name, e.g. "gclid" or "rdt_cid". */
  clickIdName: string | null;
  clickIdValue: string | null;
  /** External referrer host with a leading "www." removed. Self-referrals are never recorded. */
  referrerHost: string | null;
  landingHost: string | null;
  landingPath: string | null;
  /** Values of the app's allowlisted extra parameters. */
  extraParams?: Record<string, string> | null;
  /** ISO-8601 capture time. */
  occurredAt: string;
}

/** Returned by GET api/attribution/config?appId=. */
export interface PublicAttributionConfig {
  appId: string;
  isEnabled: boolean;
  captureFirstTouch: boolean;
  captureLastTouch: boolean;
  attributionWindowDays: number;
  /** Touches are persisted in browser storage only once this consent category is granted. */
  persistenceConsentCategory: ConsentCategory;
  captureClickIds: boolean;
  captureReferrer: boolean;
  extraAllowedParamNames: string[];
  beaconEnabled: boolean;
  /** Funnel event tracking. Always false when `isEnabled` is false. */
  funnelTrackingEnabled: boolean;
  /** Auto-track scroll_depth milestones (25/50/75/100) per page. */
  trackScrollDepth: boolean;
  /** Auto-track `engaged` (once per session) and `time_on_page`. */
  trackEngagement: boolean;
  /** Auto-track clicks on elements carrying `data-ww-cta` as cta_click. */
  autoTrackCtaClicks: boolean;
  /** Accept the signup_view / signup_start / signup_submit / signup_error steps. */
  trackSignupSteps: boolean;
  /** Extra event names (^[a-z0-9_]{1,40}$) the app allows on top of the standard client events. */
  customEventNames: string[];
  /**
   * Before consent, mirror the touch, visitor key and session key to sessionStorage so a reload in the
   * same tab keeps them; the mirror moves to localStorage once consent is granted.
   */
  sessionStoragePersistenceBeforeConsent: boolean;
}

/** The persisted blob under {@link ATTRIBUTION_STORAGE_KEY}. */
export interface StoredAttribution {
  v: 1;
  visitorKey: string;
  first: AttributionTouch | null;
  last: AttributionTouch | null;
  updatedAt: string;
  /** Funnel session key; continues while the last tracked activity is under 30 minutes old. */
  sessionKey?: string | null;
  /** Epoch milliseconds of the session's last tracked activity. */
  lastActivityAt?: number | null;
  /** Sessions this visitor has started, counting the current one. */
  sessionCount?: number | null;
}

/** The pre-consent sessionStorage mirror under {@link ATTRIBUTION_SESSION_STORAGE_KEY}. */
export interface AttributionSessionMirror {
  v: 1;
  visitorKey: string;
  sessionKey: string | null;
  lastActivityAt: number | null;
  sessionCount: number | null;
  first: AttributionTouch | null;
  last: AttributionTouch | null;
  updatedAt: string;
}

export type AttributionDeviceClass = 'mobile' | 'tablet' | 'desktop';

/** The service's current state. A new object is produced on every change, so it is safe as a snapshot. */
export interface AttributionState {
  readonly visitorKey: string;
  readonly first: AttributionTouch | null;
  readonly last: AttributionTouch | null;
  /** True while the touches are held in browser storage (the consent category allowed it). */
  readonly persisted: boolean;
  /** The app's attribution config, or null before it loads or when it could not be fetched. */
  readonly config: PublicAttributionConfig | null;
}

/** Attached to a registration request (and posted to the claim endpoint for provider signups). */
export interface AttributionPayload {
  version: 1;
  visitorKey: string;
  firstTouch: AttributionTouch | null;
  lastTouch: AttributionTouch | null;
  platform: AttributionPlatform;
  sdk: AttributionSdk;
  /** The funnel session the registration happened in, joining it to the session's funnel events. */
  sessionKey?: string | null;
  deviceClass?: AttributionDeviceClass | null;
  sessionCount?: number | null;
}

/** Posted to POST api/attribution/touch?appId= (the anonymous landing beacon). */
export interface AttributionTouchRequest {
  appId: string;
  visitorKey: string;
  touch: AttributionTouch;
  platform: AttributionPlatform;
}

/** Options for a funnel event. */
export interface FunnelTrackOptions {
  /** CTA name, plan, error category... Trimmed and capped at 100 characters. */
  label?: string | null;
  value?: number | null;
}

/** One funnel event inside {@link AttributionEventsRequest}. */
export interface FunnelEvent {
  name: string;
  label?: string;
  value?: number;
  path?: string;
  /** ISO-8601 time the event happened on the client. */
  clientTimestamp?: string;
}

/**
 * Posted to POST api/attribution/events?appId= (anonymous; text/plain or JSON; at most 25 events).
 * `touch` is the visitor's current last touch, or null for a direct visit.
 */
export interface AttributionEventsRequest {
  appId: string;
  visitorKey: string;
  sessionKey: string;
  isReturning: boolean;
  deviceClass: AttributionDeviceClass;
  platform: AttributionPlatform;
  touch: AttributionTouch | null;
  events: FunnelEvent[];
}

/** Posted to POST api/attribution/claim?appId= (authenticated) after a provider signup. */
export interface AttributionClaimRequest extends AttributionPayload {
  appId: string;
}

export type AttributionClaimReason = 'Disabled' | 'WindowExpired' | 'AlreadyRecorded' | 'Empty' | 'NotAppUser';

/** Result of a claim. `reason` is null when the attribution was recorded. */
export interface AttributionClaimResponse {
  recorded: boolean;
  reason: AttributionClaimReason | null;
}

/** The slice of AttributionService that registration needs; AuthService depends on nothing else. */
export interface AttributionRegistrationSource {
  getForRegistration(): AttributionPayload | null;
  clear(): void;
}

/**
 * The slice of the consent engine attribution depends on. ConsentService satisfies it; a narrow
 * interface keeps the dependency one-way and lets tests fake it.
 */
export interface AttributionConsentSource {
  isGranted(category: ConsentCategory): boolean;
  getState(): ConsentState | null;
  onConsentChange(listener: (state: ConsentState) => void): () => void;
}

export interface AttributionServiceOptions {
  /** Set false to turn capture off on this client entirely. Defaults to true. */
  enabled?: boolean;
  /** Attribution window used until the app config loads, or when it cannot. Defaults to 30 days. */
  defaultWindowDays?: number;
  /** Platform reported with payloads and beacons. Defaults to "web" when a DOM exists, else "unknown". */
  platform?: AttributionPlatform;
  /**
   * Device class reported with funnel events and registration. Defaults to a viewport/pointer reading
   * on the web; a native host (React Native) supplies its own from the screen dimensions.
   */
  getDeviceClass?: () => AttributionDeviceClass;
}

export type AttributionChangeListener = (state: AttributionState) => void;
