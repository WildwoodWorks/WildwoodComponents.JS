'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { NON_NECESSARY_CATEGORIES, type ConsentCategory } from '@wildwood/core';
import { useConsent } from '../../hooks/useConsent.js';

const NON_NECESSARY: ConsentCategory[] = NON_NECESSARY_CATEGORIES;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus-trap a dialog while it is open and restore focus to the trigger on close (WCAG 2.2 AA). */
function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);
  return ref;
}

export interface ConsentBannerProps {
  /** Initialize on mount (fetch config, apply decision table, inject consented scripts). Default true. */
  autoInit?: boolean;
  /** Render a "Privacy choices" reopen link once the banner is dismissed. Default true. */
  showReopenLink?: boolean;
  /**
   * Render standalone CCPA opt-out footer links ("Do Not Sell or Share", "Limit Use of Sensitive PI")
   * when the config enables those surfaces - one-click, without opening the preferences modal.
   * Default true.
   */
  showFooterOptOut?: boolean;
  /**
   * While the banner is up, add its height to the page's bottom padding so it does not cover
   * anything the host anchors to the bottom of the viewport. Default true.
   *
   * The banner is `position: fixed; bottom: 0; z-index: 9000`, so without this it silently sits on
   * top of chat composers, sticky action bars and the like — the host has no way to know how much
   * room to leave, because the height depends on the configured copy and on how it wraps. Found
   * covering the send button of a host app's assistant, where the click simply did nothing.
   *
   * Either way the measured height is published as `--ww-consent-height` on the document element,
   * so a host that would rather place the room itself can set `reserveSpace={false}` and use the
   * variable (it is removed again when the banner goes).
   */
  reserveSpace?: boolean;
  className?: string;
}

/**
 * Consent banner + preferences modal. The core engine blocks gated third-party scripts until the
 * visitor consents to the matching category, honors GPC, and exposes the CCPA opt-out surfaces.
 */
export function ConsentBanner({
  autoInit = true,
  showReopenLink = true,
  showFooterOptOut = true,
  reserveSpace = true,
  className,
}: ConsentBannerProps) {
  const { config, state, shouldShowBanner, initialize, acceptAll, rejectAll, setCategories } = useConsent();
  const [showBanner, setShowBanner] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [selection, setSelection] = useState<Partial<Record<ConsentCategory, boolean>>>({});
  const modalRef = useFocusTrap(showPrefs);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoInit) {
      initialize().catch(() => {
        /* errors surfaced via hook state */
      });
    }
  }, [autoInit, initialize]);

  // Close the preferences modal on Escape.
  useEffect(() => {
    if (!showPrefs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPrefs(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPrefs]);

  useEffect(() => {
    setShowBanner(shouldShowBanner);
  }, [shouldShowBanner]);

  // Keep the fixed banner from covering the page's own bottom-anchored UI. The height is measured
  // rather than assumed: it depends on the configured copy, and the banner re-wraps on narrow
  // viewports (the stylesheet stacks it into a column), so a constant would be wrong as often as
  // it was right.
  useEffect(() => {
    const node = bannerRef.current;
    if (!showBanner || !node) return;

    const root = document.documentElement;
    const body = document.body;
    const previousInlinePadding = body.style.paddingBottom;
    // Read what the page asks for on its own BEFORE adding ours, so the reservation adds to the
    // host's padding instead of replacing it — and so the cleanup below restores exactly what it
    // found, inline or not.
    const basePadding = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;

    const apply = () => {
      const height = node.offsetHeight;
      root.style.setProperty('--ww-consent-height', `${height}px`);
      if (reserveSpace) body.style.paddingBottom = `${basePadding + height}px`;
    };

    apply();
    // Guarded: jsdom and older runtimes have no ResizeObserver, and a consent banner must never be
    // the reason a host's test suite or browser fails to render.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(node);

    return () => {
      observer?.disconnect();
      root.style.removeProperty('--ww-consent-height');
      if (reserveSpace) body.style.paddingBottom = previousInlinePadding;
    };
  }, [showBanner, reserveSpace]);

  const categoryActive = useCallback((c: ConsentCategory) => (config?.categories ?? []).includes(c), [config]);

  const openPrefs = useCallback(() => {
    const initial: Partial<Record<ConsentCategory, boolean>> = {};
    for (const c of NON_NECESSARY) {
      if (categoryActive(c)) initial[c] = state?.categories[c] === true;
    }
    setSelection(initial);
    setShowPrefs(true);
  }, [categoryActive, state]);

  const onAcceptAll = useCallback(async () => {
    await acceptAll();
    setShowBanner(false);
    setShowPrefs(false);
  }, [acceptAll]);

  const onRejectAll = useCallback(async () => {
    await rejectAll();
    setShowBanner(false);
    setShowPrefs(false);
  }, [rejectAll]);

  // One-click CCPA opt-out: turn the category off against the visitor's current granted state and
  // post the decision immediately (no separate Save click), per the legal requirement.
  const optOut = useCallback(
    async (category: ConsentCategory) => {
      const next: Partial<Record<ConsentCategory, boolean>> = {};
      for (const c of NON_NECESSARY) {
        if (categoryActive(c)) next[c] = c === category ? false : state?.categories[c] === true;
      }
      setSelection(next);
      await setCategories(next);
      setShowBanner(false);
      setShowPrefs(false);
    },
    [categoryActive, state, setCategories],
  );

  const onSave = useCallback(async () => {
    await setCategories(selection);
    setShowBanner(false);
    setShowPrefs(false);
  }, [setCategories, selection]);

  if (!config || !config.enabled) return null;

  const text = (config.bannerText ?? {}) as Record<string, string>;
  const title = text.title ?? 'We value your privacy';
  const body =
    text.body ??
    'We use cookies and similar technologies. Choose which categories to allow. Necessary items are always on.';
  const acceptLabel = text.acceptAll ?? 'Accept all';
  const rejectLabel = text.rejectAll ?? 'Reject all';
  const manageLabel = text.manage ?? 'Manage preferences';

  return (
    <div className={className}>
      {showBanner && (
        <div ref={bannerRef} className="ww-consent-banner" role="region" aria-label="Cookie consent">
          <div className="ww-consent-banner-text">
            <strong className="ww-consent-title">{title}</strong>
            <p className="ww-consent-body">
              {body}{' '}
              {config.privacyPolicyUrl && (
                <a className="ww-consent-link" href={config.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
              )}
            </p>
          </div>
          <div className="ww-consent-actions">
            <button type="button" className="ww-consent-btn ww-consent-btn-secondary" onClick={openPrefs}>
              {manageLabel}
            </button>
            <button type="button" className="ww-consent-btn ww-consent-btn-secondary" onClick={onRejectAll}>
              {rejectLabel}
            </button>
            <button type="button" className="ww-consent-btn ww-consent-btn-primary" onClick={onAcceptAll}>
              {acceptLabel}
            </button>
          </div>
        </div>
      )}

      {showPrefs && (
        <div className="ww-consent-modal-overlay" onClick={() => setShowPrefs(false)}>
          <div
            ref={modalRef}
            className="ww-consent-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Privacy preferences"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ww-consent-modal-header">
              <h2>Privacy preferences</h2>
              <button type="button" className="ww-consent-close" aria-label="Close" onClick={() => setShowPrefs(false)}>
                ×
              </button>
            </div>
            <div className="ww-consent-modal-body">
              <div className="ww-consent-category">
                <strong>Strictly necessary</strong>
                <input type="checkbox" checked disabled aria-label="Strictly necessary (always on)" />
              </div>
              {NON_NECESSARY.filter(categoryActive).map((c) => (
                <div className="ww-consent-category" key={c}>
                  <strong>{c}</strong>
                  <input
                    type="checkbox"
                    checked={selection[c] === true}
                    aria-label={c}
                    onChange={(e) => setSelection((prev) => ({ ...prev, [c]: e.target.checked }))}
                  />
                </div>
              ))}

              {(config.showDoNotSell || config.showLimitSensitive) && (
                <div className="ww-consent-rights">
                  {config.showDoNotSell && (
                    <button
                      type="button"
                      className="ww-consent-btn ww-consent-btn-secondary"
                      onClick={() => optOut('Advertising')}
                    >
                      Do Not Sell or Share My Personal Information
                    </button>
                  )}
                  {config.showLimitSensitive && (
                    <button
                      type="button"
                      className="ww-consent-btn ww-consent-btn-secondary"
                      onClick={() => optOut('Sensitive')}
                    >
                      Limit the Use of My Sensitive Personal Information
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="ww-consent-modal-footer">
              <button type="button" className="ww-consent-btn ww-consent-btn-secondary" onClick={onRejectAll}>
                {rejectLabel}
              </button>
              <button type="button" className="ww-consent-btn ww-consent-btn-primary" onClick={onSave}>
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {!showBanner && (showReopenLink || showFooterOptOut) && (
        <div className="ww-consent-footer-links">
          {showReopenLink && (
            <button type="button" className="ww-consent-reopen" aria-label="Privacy choices" onClick={openPrefs}>
              Privacy choices
            </button>
          )}
          {showFooterOptOut && config.showDoNotSell && (
            <button type="button" className="ww-consent-reopen" onClick={() => optOut('Advertising')}>
              Do Not Sell or Share
            </button>
          )}
          {showFooterOptOut && config.showLimitSensitive && (
            <button type="button" className="ww-consent-reopen" onClick={() => optOut('Sensitive')}>
              Limit Use of Sensitive PI
            </button>
          )}
        </div>
      )}
    </div>
  );
}
