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
}

/** The persisted blob under {@link ATTRIBUTION_STORAGE_KEY}. */
export interface StoredAttribution {
  v: 1;
  visitorKey: string;
  first: AttributionTouch | null;
  last: AttributionTouch | null;
  updatedAt: string;
}

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
}

/** Posted to POST api/attribution/touch?appId= (the anonymous landing beacon). */
export interface AttributionTouchRequest {
  appId: string;
  visitorKey: string;
  touch: AttributionTouch;
  platform: AttributionPlatform;
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
}

export type AttributionChangeListener = (state: AttributionState) => void;
