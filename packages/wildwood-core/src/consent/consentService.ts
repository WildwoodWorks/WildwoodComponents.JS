// Consent Management core engine - framework-agnostic.
// Owns the whole flow: fetch the merged config + script registry, read/write the first-party
// consent cookie, read GPC, apply the show/suppress decision table, inject scripts BY CATEGORY
// only after consent, expose onConsentChange, and post the consent record.
//
// Block-before-consent is the whole point: no gated script is injected until its category is
// consented to. StrictlyNecessary may load immediately.

import type { HttpClient } from '../client/httpClient.js';
import type {
  PublicConsentConfig,
  ConsentScript,
  ConsentState,
  ConsentCategory,
  ConsentMethod,
  ConsentRecordRequest,
  ConsentInitResult,
  ConsentChangeListener,
  ConsentServiceOptions,
} from './types.js';
import { NON_NECESSARY_CATEGORIES, GPC_FORCED_OFF } from './types.js';

interface ConsentCookie {
  visitorKey: string;
  consentString: string;
  configVersion: number;
}

export class ConsentService {
  private readonly cookieName: string;
  private readonly cookieDays: number;
  private readonly storage?: ConsentServiceOptions['storage'];
  private config: PublicConsentConfig | null = null;
  private state: ConsentState | null = null;
  private readonly injectedIds = new Set<string>();
  private readonly listeners = new Set<ConsentChangeListener>();

  constructor(
    private http: HttpClient,
    private defaultAppId: string,
    options?: ConsentServiceOptions,
  ) {
    this.cookieName = options?.cookieName ?? 'ww_consent';
    this.cookieDays = options?.cookieDays ?? 180;
    this.storage = options?.storage;
  }

  // ---- Public API -----------------------------------------------------------

  /** Fetch the merged consent config + enabled script registry for an app. */
  async fetchConfig(appId?: string): Promise<PublicConsentConfig> {
    const targetAppId = appId ?? this.defaultAppId;
    const { data } = await this.http.get<PublicConsentConfig>(
      `api/consent/config?appId=${encodeURIComponent(targetAppId)}`,
      { skipAuth: true },
    );
    return data;
  }

  /**
   * Initialize consent on page load. Fetches config, reads the cookie + GPC, applies the decision
   * table, injects already-consented scripts, and returns what the UI needs to render.
   */
  async initialize(appId?: string): Promise<ConsentInitResult> {
    const config = await this.fetchConfig(appId);
    this.config = config;
    this.injectedIds.clear();

    const gpcPresent = this.readGpc();
    const cookie = this.readCookie();
    const visitorKey = cookie?.visitorKey ?? this.generateVisitorKey();

    // A stored decision is valid only if it matches the current config version.
    const hasValidCookie = !!cookie && cookie.configVersion === config.version && config.enabled;

    let categories = this.emptyCategories();
    let decided = false;

    if (hasValidCookie) {
      categories = this.decodeConsentString(cookie!.consentString);
      decided = true;
    }

    // GPC forces Advertising + Sensitive off, even outside any geo target.
    if (config.enabled && config.honorGpc && gpcPresent) {
      for (const c of GPC_FORCED_OFF) categories[c] = false;
    }

    this.state = { visitorKey, categories, configVersion: config.version, decided, gpcPresent };

    if (!config.enabled) {
      // Consent experience is off for this app; the SDK stays inactive.
      return { config, state: this.state, shouldShowBanner: false };
    }

    // StrictlyNecessary scripts may load immediately.
    this.injectScriptsForCategory('StrictlyNecessary');

    if (decided) {
      this.injectConsentedScripts();
      return { config, state: this.state, shouldShowBanner: false };
    }

    // No stored decision yet - run the show/suppress decision table.
    const shouldShowBanner = this.shouldShowBanner(config, gpcPresent);

    if (!shouldShowBanner) {
      // Geo-aware + outside target: apply the configured non-target default (GPC still honored).
      await this.applyNonTargetDefault(config, gpcPresent);
      return { config, state: this.state, shouldShowBanner: false };
    }

    // Banner will show. GPC has already been applied to the in-memory state above (Advertising +
    // Sensitive forced off); the decision is recorded when the visitor acts. We deliberately do NOT
    // persist a cookie here - doing so would mark the visitor "decided" and suppress the banner on
    // the next load before they ever chose.
    return { config, state: this.state, shouldShowBanner: true };
  }

  /** Grant every active category (GPC still forces Advertising/Sensitive off). */
  async acceptAll(): Promise<void> {
    this.requireInit();
    const cats = this.emptyCategories();
    for (const c of this.activeCategories()) cats[c] = true;
    await this.applyCategories(cats, 'AcceptAll');
  }

  /** Reject all - only StrictlyNecessary remains. */
  async rejectAll(): Promise<void> {
    this.requireInit();
    await this.applyCategories(this.emptyCategories(), 'RejectAll');
  }

  /** Apply a custom per-category selection. */
  async setCategories(selection: Partial<Record<ConsentCategory, boolean>>): Promise<void> {
    this.requireInit();
    const cats = this.emptyCategories();
    for (const c of this.activeCategories()) cats[c] = selection[c] === true;
    await this.applyCategories(cats, 'Custom');
  }

  /**
   * Withdraw consent. Records the withdrawal (reject-all), stops future injection, and clears the
   * SDK consent cookie so the visitor is treated as undecided again. Already-executed scripts cannot
   * be unloaded - the caller should prompt a page reload to fully clear in-memory state.
   */
  async withdraw(): Promise<void> {
    this.requireInit();
    // Record the withdrawal as a reject-all decision (evidence), then clear the stored cookie so a
    // reload re-prompts rather than treating the visitor as already-decided.
    this.state!.categories = this.emptyCategories();
    this.state!.decided = false;
    await this.record('RejectAll', this.encodeConsentString(this.state!.categories));
    this.clearCookie();
    this.emitChange();
  }

  /** Current granted state for a category. */
  isGranted(category: ConsentCategory): boolean {
    if (category === 'StrictlyNecessary') return true;
    return this.state?.categories[category] === true;
  }

  getState(): ConsentState | null {
    return this.state;
  }

  getConfig(): PublicConsentConfig | null {
    return this.config;
  }

  /** Subscribe to consent changes. Returns an unsubscribe function. */
  onConsentChange(listener: ConsentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- Decision logic -------------------------------------------------------

  private shouldShowBanner(config: PublicConsentConfig, _gpcPresent: boolean): boolean {
    if (!config.geo.aware) return true; // show to everyone
    return config.geo.inTarget; // geo-aware: show only inside target
  }

  private async applyNonTargetDefault(config: PublicConsentConfig, gpcPresent: boolean): Promise<void> {
    const cats = this.emptyCategories();
    if (config.nonTargetDefault === 'LoadAll') {
      for (const c of this.activeCategories()) cats[c] = true;
    }
    // GPC always overrides toward opt-out.
    if (config.honorGpc && gpcPresent) {
      for (const c of GPC_FORCED_OFF) cats[c] = false;
    }
    this.state!.categories = cats;
    this.state!.decided = true;
    this.injectConsentedScripts();
    await this.persistDecision(gpcPresent ? 'Gpc' : 'NonTargetDefault');
  }

  private async applyCategories(cats: Record<ConsentCategory, boolean>, method: ConsentMethod): Promise<void> {
    // GPC always forces Advertising + Sensitive off.
    if (this.config!.honorGpc && this.state!.gpcPresent) {
      for (const c of GPC_FORCED_OFF) cats[c] = false;
    }
    this.state!.categories = cats;
    this.state!.decided = true;
    this.injectConsentedScripts(); // inject newly-granted on the spot
    await this.persistDecision(method);
    this.emitChange();
  }

  private async persistDecision(method: ConsentMethod): Promise<void> {
    const consentString = this.encodeConsentString(this.state!.categories);
    this.writeCookie({
      visitorKey: this.state!.visitorKey,
      consentString,
      configVersion: this.config!.version,
    });
    await this.record(method, consentString);
  }

  private async record(method: ConsentMethod, consentString: string): Promise<void> {
    const body: ConsentRecordRequest = {
      appId: this.config!.appId,
      visitorKey: this.state!.visitorKey,
      consentString,
      method,
      gpcPresent: this.state!.gpcPresent,
      configVersion: this.config!.version,
    };
    try {
      // appId is also sent as a query param so the server's per-app rate-limit partition (which
      // reads ?appId=) applies to the record path, not just the config GET.
      await this.http.post(`api/consent/record?appId=${encodeURIComponent(body.appId)}`, body, { skipAuth: true });
    } catch (err) {
      // Recording is best-effort; never block the UI on it.
      console.warn('[ConsentService] failed to record consent decision', err);
    }
  }

  // ---- Script injection -----------------------------------------------------

  private injectConsentedScripts(): void {
    for (const c of NON_NECESSARY_CATEGORIES) {
      if (this.isGranted(c)) this.injectScriptsForCategory(c);
    }
  }

  private injectScriptsForCategory(category: ConsentCategory): void {
    if (!this.config) return;
    for (const script of this.config.scripts) {
      if (script.category === category) this.injectScript(script);
    }
  }

  private injectScript(script: ConsentScript): void {
    if (typeof document === 'undefined') return; // no DOM (e.g. SSR / RN)
    if (this.injectedIds.has(script.id)) return;
    this.injectedIds.add(script.id);

    const target = script.loadPosition === 'BodyEnd' ? document.body : document.head;
    if (!target) return;

    if (script.injectionMode === 'ExternalSrc' && script.src) {
      const el = document.createElement('script');
      el.src = script.src;
      if (script.loadStrategy === 'Async') el.async = true;
      else if (script.loadStrategy === 'Defer') el.defer = true;
      el.setAttribute('data-ww-consent', script.category);
      target.appendChild(el);
    } else if (script.injectionMode === 'InlineSnippet' && script.snippet) {
      this.injectSnippet(script.snippet, target, script.category);
    }
  }

  /**
   * Inject an inline snippet. Snippets are often full <script> markup; assigning innerHTML does NOT
   * execute scripts, so we parse and re-create each <script> element. Non-script nodes are appended
   * as-is.
   */
  private injectSnippet(snippet: string, target: HTMLElement, category: string): void {
    const template = document.createElement('template');
    template.innerHTML = snippet.trim();
    const nodes = Array.from(template.content.childNodes);

    if (nodes.length === 0) {
      // Plain JS with no markup - run it as a script body.
      const el = document.createElement('script');
      el.textContent = snippet;
      el.setAttribute('data-ww-consent', category);
      target.appendChild(el);
      return;
    }

    for (const node of nodes) {
      if (node.nodeName === 'SCRIPT') {
        const src = node as HTMLScriptElement;
        const el = document.createElement('script');
        for (const attr of Array.from(src.attributes)) el.setAttribute(attr.name, attr.value);
        el.textContent = src.textContent;
        el.setAttribute('data-ww-consent', category);
        target.appendChild(el);
      } else {
        target.appendChild(node.cloneNode(true));
      }
    }
  }

  // ---- Cookie + GPC + encoding ---------------------------------------------

  private readGpc(): boolean {
    if (typeof navigator === 'undefined') return false;
    // navigator.globalPrivacyControl is the standardized DOM signal.
    return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  }

  private readCookie(): ConsentCookie | null {
    // Prefer the injected storage adapter (e.g. React Native) over the DOM cookie.
    if (this.storage) {
      try {
        const raw = this.storage.get(this.cookieName);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ConsentCookie;
        return parsed && typeof parsed.visitorKey === 'string' ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof document === 'undefined') return null;
    const match = document.cookie.split('; ').find((row) => row.startsWith(`${this.cookieName}=`));
    if (!match) return null;
    try {
      const raw = decodeURIComponent(match.substring(this.cookieName.length + 1));
      const parsed = JSON.parse(raw) as ConsentCookie;
      if (parsed && typeof parsed.visitorKey === 'string') return parsed;
      return null;
    } catch {
      return null;
    }
  }

  private writeCookie(cookie: ConsentCookie): void {
    if (this.storage) {
      try {
        this.storage.set(this.cookieName, JSON.stringify(cookie));
      } catch {
        /* persistence is best-effort */
      }
      return;
    }
    if (typeof document === 'undefined') return;
    const value = encodeURIComponent(JSON.stringify(cookie));
    const maxAge = this.cookieDays * 24 * 60 * 60;
    // First-party, lax, path=/. Secure when served over https.
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${this.cookieName}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  }

  /** Clears the stored consent (storage adapter or first-party cookie). */
  private clearCookie(): void {
    if (this.storage) {
      try {
        this.storage.set(this.cookieName, '');
      } catch {
        /* best-effort */
      }
      return;
    }
    if (typeof document === 'undefined') return;
    document.cookie = `${this.cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  private generateVisitorKey(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    // Vary by index/time without Math.random for environments lacking crypto.
    return `v-${Date.now().toString(36)}-${(typeof performance !== 'undefined' ? performance.now() : 0).toString(36)}`;
  }

  private encodeConsentString(categories: Record<ConsentCategory, boolean>): string {
    const granted = NON_NECESSARY_CATEGORIES.filter((c) => categories[c]);
    return granted.join(',');
  }

  private decodeConsentString(consentString: string): Record<ConsentCategory, boolean> {
    const cats = this.emptyCategories();
    if (!consentString) return cats;
    for (const part of consentString.split(',')) {
      const c = part.trim() as ConsentCategory;
      if (NON_NECESSARY_CATEGORIES.includes(c)) cats[c] = true;
    }
    return cats;
  }

  private emptyCategories(): Record<ConsentCategory, boolean> {
    return {
      StrictlyNecessary: true,
      Functional: false,
      Analytics: false,
      Advertising: false,
      Sensitive: false,
    };
  }

  private activeCategories(): ConsentCategory[] {
    const active = this.config?.categories ?? [];
    // Only offer non-necessary categories that the config marks active.
    return NON_NECESSARY_CATEGORIES.filter((c) => active.includes(c));
  }

  private emitChange(): void {
    if (!this.state) return;
    for (const listener of this.listeners) listener(this.state);
  }

  private requireInit(): void {
    if (!this.config || !this.state) {
      throw new Error('ConsentService.initialize() must be called before applying consent.');
    }
  }
}
