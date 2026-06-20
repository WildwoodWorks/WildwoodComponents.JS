// Consent Management types - shared by the core engine and all framework wrappers.
// Mirrors WildwoodAPI Consent DTOs (enums serialize as PascalCase string names).

export type ConsentCategory = 'StrictlyNecessary' | 'Functional' | 'Analytics' | 'Advertising' | 'Sensitive';

export const NON_NECESSARY_CATEGORIES: ConsentCategory[] = ['Functional', 'Analytics', 'Advertising', 'Sensitive'];

/** Categories that GPC forces to opted-out. */
export const GPC_FORCED_OFF: ConsentCategory[] = ['Advertising', 'Sensitive'];

export type ScriptInjectionMode = 'ExternalSrc' | 'InlineSnippet';
export type ScriptLoadPosition = 'Head' | 'BodyEnd';
export type ScriptLoadStrategy = 'Async' | 'Defer' | 'Standard';
export type NonTargetDefault = 'LoadAll' | 'NecessaryOnly';

export type ConsentMethod = 'AcceptAll' | 'RejectAll' | 'Custom' | 'Gpc' | 'NonTargetDefault';

/** A consent-gated script from the registry (feature 2). */
export interface ConsentScript {
  id: string;
  providerType: string;
  category: ConsentCategory;
  injectionMode: ScriptInjectionMode;
  src: string | null;
  snippet: string | null;
  loadPosition: ScriptLoadPosition;
  loadStrategy: ScriptLoadStrategy;
}

export interface GeoDecision {
  aware: boolean;
  inTarget: boolean;
  resolvedTags: string[];
}

/** Merged public config returned by GET /api/consent/config. */
export interface PublicConsentConfig {
  appId: string;
  enabled: boolean;
  version: number;
  geo: GeoDecision;
  honorGpc: boolean;
  showDoNotSell: boolean;
  showLimitSensitive: boolean;
  nonTargetDefault: NonTargetDefault;
  categories: ConsentCategory[];
  categoryDefaults: Partial<Record<ConsentCategory, boolean>> | null;
  appearance: Record<string, unknown> | null;
  bannerText: Record<string, unknown> | null;
  privacyPolicyUrl: string | null;
  accessibilityUrl: string | null;
  scripts: ConsentScript[];
}

/** Posted to POST /api/consent/record. */
export interface ConsentRecordRequest {
  appId: string;
  visitorKey: string;
  consentString: string;
  method: ConsentMethod;
  gpcPresent: boolean;
  configVersion: number;
}

/** The visitor's current consent state. */
export interface ConsentState {
  visitorKey: string;
  /** Per-category granted flags (StrictlyNecessary is always true). */
  categories: Record<ConsentCategory, boolean>;
  configVersion: number;
  /** True once the visitor (or GPC / non-target default) has produced a decision. */
  decided: boolean;
  gpcPresent: boolean;
}

/** Result of initialize(): what the UI needs to render. */
export interface ConsentInitResult {
  config: PublicConsentConfig;
  state: ConsentState;
  /** Whether the banner should be shown to this visitor. */
  shouldShowBanner: boolean;
}

export type ConsentChangeListener = (state: ConsentState) => void;

/**
 * Synchronous key-value persistence seam for the consent blob. Web uses the first-party cookie by
 * default; non-DOM hosts (React Native) can pass an adapter (e.g. a sync MMKV store, or an
 * AsyncStorage value hydrated into memory at startup) so consent survives across launches. Without
 * one, a non-DOM host has no persistence and re-prompts each session.
 */
export interface ConsentStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface ConsentServiceOptions {
  /** First-party cookie name (also the storage key when a storage adapter is supplied). Defaults to "ww_consent". */
  cookieName?: string;
  /** Cookie lifetime in days. Defaults to 180. */
  cookieDays?: number;
  /** Optional persistence adapter. When supplied, used instead of document.cookie. */
  storage?: ConsentStorage;
}
