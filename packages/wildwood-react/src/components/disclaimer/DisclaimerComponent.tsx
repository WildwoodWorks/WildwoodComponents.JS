'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDisclaimer } from '../../hooks/useDisclaimer.js';

// Sanitize HTML by stripping dangerous tags/attributes while preserving safe content
function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dangerous = doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta');
  dangerous.forEach((el) => el.remove());
  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc' || attr.name === 'formaction') {
        el.removeAttribute(attr.name);
      }
      if (attr.name === 'href' || attr.name === 'src' || attr.name === 'action') {
        const val = attr.value.trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });
  return doc.body.innerHTML;
}

export interface DisclaimerComponentProps {
  autoLoad?: boolean;
  onAllAccepted?: () => void;
  className?: string;
}

export function DisclaimerComponent({ autoLoad = true, onAllAccepted, className }: DisclaimerComponentProps) {
  const { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers } = useDisclaimer();
  const [error, setError] = useState<string | null>(null);

  const pendingList = disclaimers?.disclaimers ?? [];

  useEffect(() => {
    if (autoLoad) {
      getPendingDisclaimers().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load disclaimers');
      });
    }
  }, [autoLoad, getPendingDisclaimers]);

  const handleAccept = useCallback(
    async (disclaimerId: string, versionId: string) => {
      setError(null);
      try {
        await acceptDisclaimer(disclaimerId, versionId);
        if (pendingList.length <= 1) {
          onAllAccepted?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept disclaimer');
      }
    },
    [acceptDisclaimer, pendingList.length, onAllAccepted],
  );

  const handleAcceptAll = useCallback(async () => {
    setError(null);
    try {
      await acceptAllDisclaimers(pendingList.map((d) => ({ disclaimerId: d.disclaimerId, versionId: d.versionId })));
      onAllAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept disclaimers');
    }
  }, [acceptAllDisclaimers, pendingList, onAllAccepted]);

  if (!loading && pendingList.length === 0 && !error) {
    return (
      <div className={`ww-disclaimer-component ${className ?? ''}`}>
        <div className="ww-alert ww-alert-success">No pending disclaimers.</div>
      </div>
    );
  }

  return (
    <div className={`ww-disclaimer-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      {loading ? (
        <div className="ww-loading">Loading disclaimers...</div>
      ) : (
        <>
          {pendingList.map((d) => (
            <div key={d.disclaimerId} className="ww-disclaimer-card">
              <div className="ww-disclaimer-header">
                <h3>{d.title}</h3>
                {d.versionNumber && <span className="ww-badge">v{d.versionNumber}</span>}
              </div>
              <div className="ww-disclaimer-body">
                {d.contentFormat === 'html' ? (
                  <div className="ww-disclaimer-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.content) }} />
                ) : (
                  <div className="ww-disclaimer-text">{d.content}</div>
                )}
              </div>
              <div className="ww-disclaimer-footer">
                <button
                  type="button"
                  className="ww-btn ww-btn-primary"
                  onClick={() => handleAccept(d.disclaimerId, d.versionId)}
                  disabled={loading}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}

          {pendingList.length > 1 && (
            <div className="ww-disclaimer-actions">
              <button
                type="button"
                className="ww-btn ww-btn-primary ww-btn-block"
                onClick={handleAcceptAll}
                disabled={loading}
              >
                Accept All ({pendingList.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
