// Campaign Attribution normalization - the client half of the rules WildwoodAPI's AttributionRules
// re-applies on the server. Clients pre-reduce (host only, path only, no query string); the server
// re-normalizes and never trusts these values, so a drift here costs precision, not safety. Keep the
// two in step, and keep the .NET engine (wildwood-attribution.js) and Swift port in step with this file.
//
// Every value is attacker-supplied: anyone can append a query string to a public URL. Anything that
// cannot be trusted is dropped rather than cleaned, and nothing here throws.

import type { ConsentCategory } from '../consent/types.js';
import { CLICK_ID_PARAMS, type AttributionTouch, type PublicAttributionConfig } from './types.js';

export const SOURCE_MEDIUM_MAX_LENGTH = 100;
export const CAMPAIGN_TERM_CONTENT_MAX_LENGTH = 200;
export const HOST_MAX_LENGTH = 253;
export const PATH_MAX_LENGTH = 500;
export const EXTRA_PARAMS_JSON_MAX_LENGTH = 2000;
export const MAX_EXTRA_PARAM_NAMES = 10;
export const MIN_WINDOW_DAYS = 1;
export const MAX_WINDOW_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Control (Cc) or invisible format (Cf: bidi overrides, zero-width) characters. */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const PARAM_NAME = /^[a-z0-9_]{1,32}$/;
const CLICK_ID_VALUE = /^[A-Za-z0-9._~-]{1,200}$/;
const VISITOR_KEY = /^[A-Za-z0-9_-]{8,100}$/;

const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  'StrictlyNecessary',
  'Functional',
  'Analytics',
  'Advertising',
  'Sensitive',
];

export interface TouchCaptureOptions {
  captureClickIds: boolean;
  captureReferrer: boolean;
  extraAllowedParamNames: readonly string[];
}

/**
 * Trims, rejects a value containing control or format characters, optionally lowercases, and caps the
 * length without splitting a surrogate pair. Null for anything empty.
 */
export function normalizeToken(value: string | null | undefined, maxLength: number, lowercase: boolean): string | null {
  if (value == null) return null;
  let token = value.trim();
  if (token.length === 0 || CONTROL_OR_FORMAT.test(token)) return null;
  if (lowercase) token = token.toLowerCase();
  token = truncate(token, maxLength).trimEnd();
  return token.length === 0 ? null : token;
}

export function isValidVisitorKey(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_KEY.test(value);
}

/** A random visitor key the server accepts (8-100 of [A-Za-z0-9_-]). */
export function generateVisitorKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  fallbackCounter += 1;
  return `wv-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
let fallbackCounter = 0;

export function clampWindowDays(value: unknown, fallback: number): number {
  const days = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, days));
}

/** True when the touch is older than the window, or its capture time cannot be read. */
export function isTouchExpired(touch: AttributionTouch, windowDays: number, nowMs: number): boolean {
  const at = Date.parse(touch.occurredAt);
  return !Number.isFinite(at) || at < nowMs - windowDays * DAY_MS;
}

/**
 * Parses one campaign touch from a landing URL and the document referrer. Returns null for a direct
 * visit: no UTM tag, no click id, no external referrer and no allowlisted extra parameter.
 */
export function parseTouch(
  href: string,
  referrer: string | null | undefined,
  options: TouchCaptureOptions,
  now: Date = new Date(),
): AttributionTouch | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const params = url.searchParams;
  let source = normalizeToken(params.get('utm_source'), SOURCE_MEDIUM_MAX_LENGTH, true);
  let medium = normalizeToken(params.get('utm_medium'), SOURCE_MEDIUM_MAX_LENGTH, true);
  const campaign = normalizeToken(params.get('utm_campaign'), CAMPAIGN_TERM_CONTENT_MAX_LENGTH, false);
  const term = normalizeToken(params.get('utm_term'), CAMPAIGN_TERM_CONTENT_MAX_LENGTH, false);
  const content = normalizeToken(params.get('utm_content'), CAMPAIGN_TERM_CONTENT_MAX_LENGTH, false);

  let clickIdName: string | null = null;
  let clickIdValue: string | null = null;
  if (options.captureClickIds) {
    for (const name of CLICK_ID_PARAMS) {
      const value = params.get(name)?.trim();
      if (value && CLICK_ID_VALUE.test(value)) {
        clickIdName = name;
        clickIdValue = value;
        break;
      }
    }
  }

  const extraParams = readExtraParams(params, options.extraAllowedParamNames);

  let referrerHost: string | null = null;
  if (options.captureReferrer && referrer) {
    const ref = parseHttpUrl(referrer);
    const host = ref ? hostName(ref, true, false) : null;
    // A self-referral (in-site navigation) is not a campaign.
    if (host !== null && host !== hostName(url, true, false)) referrerHost = host;
  }

  const hasUtm = source !== null || medium !== null || campaign !== null || term !== null || content !== null;
  if (!hasUtm && referrerHost !== null) {
    source = truncate(referrerHost, SOURCE_MEDIUM_MAX_LENGTH);
    medium = 'referral';
  }

  if (!hasUtm && clickIdName === null && referrerHost === null && extraParams === null) return null;

  return {
    source,
    medium,
    campaign,
    term,
    content,
    clickIdName,
    clickIdValue,
    referrerHost,
    landingHost: hostName(url, false, true),
    landingPath: normalizePath(url.pathname),
    extraParams,
    occurredAt: now.toISOString(),
  };
}

/** Normalizes the config response defensively; null when the response is not an object. */
export function normalizeConfig(
  data: unknown,
  fallbackAppId: string,
  defaultWindowDays: number,
): PublicAttributionConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Record<keyof PublicAttributionConfig, unknown>>;
  const isEnabled = d.isEnabled === true;
  const category = d.persistenceConsentCategory;
  return {
    appId: typeof d.appId === 'string' && d.appId.length > 0 ? d.appId : fallbackAppId,
    isEnabled,
    captureFirstTouch: d.captureFirstTouch !== false,
    captureLastTouch: d.captureLastTouch !== false,
    attributionWindowDays: clampWindowDays(d.attributionWindowDays, defaultWindowDays),
    // An unrecognized category falls back to Analytics: persistence then waits for opt-in, never the reverse.
    persistenceConsentCategory: CONSENT_CATEGORIES.includes(category as ConsentCategory)
      ? (category as ConsentCategory)
      : 'Analytics',
    captureClickIds: d.captureClickIds !== false,
    captureReferrer: d.captureReferrer !== false,
    extraAllowedParamNames: Array.isArray(d.extraAllowedParamNames)
      ? d.extraAllowedParamNames
          .filter((n): n is string => typeof n === 'string')
          .map((n) => n.trim().toLowerCase())
          .filter((n) => PARAM_NAME.test(n))
          .slice(0, MAX_EXTRA_PARAM_NAMES)
      : [],
    beaconEnabled: isEnabled && d.beaconEnabled === true,
  };
}

/** A stored touch, rebuilt field by field; null when it is not a touch or its capture time is unreadable. */
export function sanitizeStoredTouch(value: unknown): AttributionTouch | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.occurredAt !== 'string' || !Number.isFinite(Date.parse(v.occurredAt))) return null;
  const str = (key: string): string | null => (typeof v[key] === 'string' ? (v[key] as string) : null);
  return {
    source: str('source'),
    medium: str('medium'),
    campaign: str('campaign'),
    term: str('term'),
    content: str('content'),
    clickIdName: str('clickIdName'),
    clickIdValue: str('clickIdValue'),
    referrerHost: str('referrerHost'),
    landingHost: str('landingHost'),
    landingPath: str('landingPath'),
    extraParams: sanitizeExtras(v.extraParams),
    occurredAt: v.occurredAt,
  };
}

// ---- Helpers --------------------------------------------------------------------------------------

function readExtraParams(params: URLSearchParams, names: readonly string[]): Record<string, string> | null {
  const kept = new Map<string, string>();
  for (const raw of names.slice(0, MAX_EXTRA_PARAM_NAMES)) {
    const name = raw.trim().toLowerCase();
    if (!PARAM_NAME.test(name) || kept.has(name)) continue;
    const value = normalizeToken(params.get(name), CAMPAIGN_TERM_CONTENT_MAX_LENGTH, false);
    if (value !== null) kept.set(name, value);
  }
  if (kept.size === 0) return null;
  const extras = Object.fromEntries(kept);
  return JSON.stringify(extras).length <= EXTRA_PARAMS_JSON_MAX_LENGTH ? extras : null;
}

function sanitizeExtras(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => PARAM_NAME.test(entry[0]) && typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries.slice(0, MAX_EXTRA_PARAM_NAMES)) : null;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function hostName(url: URL, stripWww: boolean, includePort: boolean): string | null {
  let host = (url.hostname || '').toLowerCase().replace(/\.$/, '');
  if (host.length === 0) return null;
  if (stripWww && host.startsWith('www.') && host.length > 4) host = host.slice(4);
  if (includePort && url.port) host = `${host}:${url.port}`;
  return host.length <= HOST_MAX_LENGTH ? host : null;
}

function normalizePath(pathname: string): string {
  let path = pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return truncate(path, PATH_MAX_LENGTH);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  let cut = maxLength;
  const code = value.charCodeAt(cut - 1);
  if (cut > 0 && code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return value.slice(0, cut);
}
