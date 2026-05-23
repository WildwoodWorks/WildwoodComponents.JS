import { useState, useEffect, useCallback } from 'react';
import { sanitizeHtml, type PendingDisclaimerModel } from '@wildwood/core';
import { useDisclaimer } from '../../hooks/useDisclaimer.js';

export interface DisclaimerComponentProps {
  autoLoad?: boolean;
  onAllAccepted?: () => void;
  className?: string;
}

export function DisclaimerComponent({ autoLoad = true, onAllAccepted, className }: DisclaimerComponentProps) {
  const { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers } = useDisclaimer();
  const [error, setError] = useState<string | null>(null);
  const [expandedDisclaimer, setExpandedDisclaimer] = useState<PendingDisclaimerModel | null>(null);

  const pendingList = disclaimers?.disclaimers ?? [];

  useEffect(() => {
    if (autoLoad) {
      getPendingDisclaimers().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load disclaimers');
      });
    }
  }, [autoLoad, getPendingDisclaimers]);

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
      setError(null);
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
      }
    },
    [acceptDisclaimer, pendingList, onAllAccepted],
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
              <button type="button" className="ww-disclaimer-expand-btn" onClick={() => setExpandedDisclaimer(d)}>
                Read Full Document
              </button>
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
