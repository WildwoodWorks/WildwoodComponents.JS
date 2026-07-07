import { useState, useEffect, useCallback, useRef } from 'react';
import { sanitizeHtml, type PendingDisclaimerModel } from '@wildwood/core';
import { useDisclaimer } from '../../hooks/useDisclaimer.js';

export interface DisclaimerComponentProps {
  autoLoad?: boolean;
  /** App to load/accept disclaimers for. Defaults to the WildwoodProvider config appId.
   *  Pass this when the surrounding flow targets an app other than the provider default. */
  appId?: string;
  onAllAccepted?: () => void;
  /** Fires once after the initial load resolves, with the number of pending disclaimers found.
   *  Lets a gating parent proceed when the fetch comes back empty (which never calls onAllAccepted),
   *  instead of stranding the user on an "empty" screen. */
  onLoaded?: (pendingCount: number) => void;
  className?: string;
}

export function DisclaimerComponent({
  autoLoad = true,
  appId,
  onAllAccepted,
  onLoaded,
  className,
}: DisclaimerComponentProps) {
  const { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers } = useDisclaimer(appId);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [expandedDisclaimer, setExpandedDisclaimer] = useState<PendingDisclaimerModel | null>(null);
  // When auto-loading, treat the pre-fetch window as loading so we never flash the
  // "No pending disclaimers." empty state before the first request resolves.
  const [hasLoaded, setHasLoaded] = useState(!autoLoad);

  const pendingList = disclaimers?.disclaimers ?? [];
  const isLoading = loading || (autoLoad && !hasLoaded);

  // Latest onLoaded without retriggering load(); fire it exactly once, on the first successful load.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const loadedNotifiedRef = useRef(false);

  const load = useCallback(() => {
    setError(null);
    return getPendingDisclaimers()
      .then((res) => {
        if (!loadedNotifiedRef.current) {
          loadedNotifiedRef.current = true;
          onLoadedRef.current?.(res?.disclaimers?.length ?? 0);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load disclaimers');
      })
      .finally(() => setHasLoaded(true));
  }, [getPendingDisclaimers]);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

  useEffect(() => {
    if (!expandedDisclaimer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedDisclaimer(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedDisclaimer]);

  const handleAccept = useCallback(
    async (disclaimerId: string, versionId: string) => {
      if (accepting) return; // guard against double-submit — acceptDisclaimer doesn't toggle `loading`
      setError(null);
      setAccepting(true);
      try {
        // Check count before accepting — after accept completes, the hook's
        // disclaimers state will update asynchronously so we can't rely on it.
        const wasLastPending = pendingList.length <= 1;
        await acceptDisclaimer(disclaimerId, versionId);
        if (wasLastPending) {
          onAllAccepted?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept disclaimer');
      } finally {
        setAccepting(false);
      }
    },
    [accepting, acceptDisclaimer, pendingList, onAllAccepted],
  );

  const handleAcceptAll = useCallback(async () => {
    if (accepting) return;
    setError(null);
    setAccepting(true);
    try {
      await acceptAllDisclaimers(pendingList.map((d) => ({ disclaimerId: d.disclaimerId, versionId: d.versionId })));
      onAllAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept disclaimers');
    } finally {
      setAccepting(false);
    }
  }, [accepting, acceptAllDisclaimers, pendingList, onAllAccepted]);

  if (!isLoading && pendingList.length === 0 && !error) {
    return (
      <div className={`ww-disclaimer-component ${className ?? ''}`}>
        <div className="ww-alert ww-alert-success">No pending disclaimers.</div>
      </div>
    );
  }

  return (
    <div className={`ww-disclaimer-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      {/* Recover from a failed load: without this, an errored fetch leaves the user with an
          error message and no way forward (a dead-end when this gates signup / app access). */}
      {error && !isLoading && pendingList.length === 0 && (
        <div className="ww-disclaimer-actions">
          <button type="button" className="ww-btn ww-btn-primary" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}

      {isLoading ? (
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
              <button type="button" className="ww-disclaimer-expand-btn" onClick={() => setExpandedDisclaimer(d)}>
                Read Full Document
              </button>
              <div className="ww-disclaimer-footer">
                <button
                  type="button"
                  className="ww-btn ww-btn-primary"
                  onClick={() => handleAccept(d.disclaimerId, d.versionId)}
                  disabled={loading || accepting}
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
                disabled={loading || accepting}
              >
                Accept All ({pendingList.length})
              </button>
            </div>
          )}
        </>
      )}

      {expandedDisclaimer && (
        <div className="ww-disclaimer-modal-overlay" onClick={() => setExpandedDisclaimer(null)}>
          <div className="ww-disclaimer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ww-disclaimer-modal-header">
              <h3>{expandedDisclaimer.title}</h3>
              <button type="button" className="ww-disclaimer-modal-close" onClick={() => setExpandedDisclaimer(null)}>
                &times;
              </button>
            </div>
            <div className="ww-disclaimer-modal-body">
              <div className="ww-disclaimer-modal-meta">
                {expandedDisclaimer.versionNumber != null && (
                  <span className="ww-badge">v{expandedDisclaimer.versionNumber}</span>
                )}
                {expandedDisclaimer.disclaimerType && <span>{expandedDisclaimer.disclaimerType}</span>}
                {expandedDisclaimer.previouslyAcceptedVersion != null && (
                  <span>Previously accepted: v{expandedDisclaimer.previouslyAcceptedVersion}</span>
                )}
              </div>
              {expandedDisclaimer.changeNotes && (
                <div className="ww-disclaimer-change-notes ww-disclaimer-modal-change-notes">
                  <strong>What changed:</strong> {expandedDisclaimer.changeNotes}
                </div>
              )}
              <div
                dangerouslySetInnerHTML={
                  expandedDisclaimer.contentFormat === 'html'
                    ? { __html: sanitizeHtml(expandedDisclaimer.content) }
                    : undefined
                }
              >
                {expandedDisclaimer.contentFormat !== 'html' ? expandedDisclaimer.content : undefined}
              </div>
            </div>
            <div className="ww-disclaimer-modal-footer">
              <button type="button" className="ww-btn ww-btn-primary" onClick={() => setExpandedDisclaimer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
