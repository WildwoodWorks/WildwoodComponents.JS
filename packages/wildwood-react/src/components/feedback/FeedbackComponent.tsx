'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedbackAttachment, FeedbackDuplicateCheck } from '@wildwood/core';
import { useFeedback } from '../../hooks/useFeedback.js';
import { useAuth } from '../../hooks/useAuth.js';
import { collectBrowserContext, installConsoleCapture } from './feedbackBrowserContext.js';
import { captureViewportScreenshot } from './feedbackScreenshot.js';

export interface FeedbackComponentProps {
  /** App to submit feedback for. Falls back to the WildwoodProvider config appId. */
  appId?: string;
  /** Position of the floating button. Defaults to the config value or 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left';
  /** Accent color override (hex). Defaults to the config value. */
  color?: string;
  /** Render the floating launcher button (default true). Set false to control open state yourself. */
  showLauncher?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Notified when the panel opens/closes. */
  onOpenChange?: (open: boolean) => void;
  /** Notified after a successful submission with the new feedback id. */
  onSubmitted?: (feedbackId: string) => void;
  className?: string;
}

type StatusKind = 'success' | 'error';
interface StatusMessage {
  kind: StatusKind;
  text: string;
}

function humanizeType(t: string): string {
  return t.replace(/([A-Z])/g, ' $1').trim();
}

const FEEDBACK_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export function FeedbackComponent({
  appId,
  position,
  color,
  showLauncher = true,
  open,
  onOpenChange,
  onSubmitted,
  className,
}: FeedbackComponentProps) {
  const { config, submitting, loadConfig, submitFeedback, checkDuplicate, voteFeedback } = useFeedback();
  const { isAuthenticated } = useAuth();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const panelOpen = isControlled ? open : internalOpen;

  const [feedbackType, setFeedbackType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([]);
  const [duplicate, setDuplicate] = useState<FeedbackDuplicateCheck | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture console/errors as early as the component mounts.
  useEffect(() => {
    installConsoleCapture();
  }, []);

  // Load the widget config once.
  useEffect(() => {
    loadConfig().catch(() => {
      /* error surfaced via hook; widget still renders with no config */
    });
  }, [loadConfig]);

  // Default the selected type to the first configured type.
  useEffect(() => {
    if (config?.feedbackTypes?.length && !feedbackType) {
      setFeedbackType(config.feedbackTypes[0]);
    }
  }, [config, feedbackType]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  // Close on Escape while open.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, setOpen]);

  const resolvedPosition = position ?? (config?.widgetPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right');
  const resolvedColor = color ?? config?.widgetColor;
  const enableDuplicate = config?.enableDuplicateDetection !== false;
  const allowAttachments = config?.allowAttachments === true;

  const feedbackTypes = useMemo(
    () => (config?.feedbackTypes?.length ? config.feedbackTypes : ['Bug', 'FeatureRequest', 'Improvement', 'Other']),
    [config],
  );

  // Debounced duplicate detection on the title.
  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!enableDuplicate) return;
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
      if (value.trim().length < 5) {
        setDuplicate(null);
        return;
      }
      dupTimerRef.current = setTimeout(() => {
        checkDuplicate(value.trim())
          .then((result) => setDuplicate(result.hasPotentialDuplicate ? result : null))
          .catch(() => setDuplicate(null));
      }, 600);
    },
    [enableDuplicate, checkDuplicate],
  );

  useEffect(() => {
    return () => {
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    };
  }, []);

  const handleCaptureScreenshot = useCallback(async () => {
    setStatus(null);
    setCapturing(true);
    try {
      const data = await captureViewportScreenshot(config?.screenshotQuality ?? 80, config?.screenshotMaxSizeKb ?? 500);
      if (data) setScreenshot(data);
      else setStatus({ kind: 'error', text: 'Could not capture a screenshot. You can still submit without one.' });
    } finally {
      setCapturing(false);
    }
  }, [config]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const maxSize = (config?.maxAttachmentSizeKb ?? 2048) * 1024;
      const allowed = (config?.allowedAttachmentTypes ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      Array.from(files).forEach((file) => {
        const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
        if (allowed.length > 0 && !allowed.includes(ext)) {
          setStatus({ kind: 'error', text: `File type ${ext} is not allowed.` });
          return;
        }
        if (file.size > maxSize) {
          setStatus({
            kind: 'error',
            text: `${file.name} exceeds the ${config?.maxAttachmentSizeKb ?? 2048}KB limit.`,
          });
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result;
          if (typeof data === 'string') {
            setAttachments((prev) => [...prev, { name: file.name, contentType: file.type, size: file.size, data }]);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [config],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setEmail('');
    setName('');
    setScreenshot(null);
    setAttachments([]);
    setDuplicate(null);
    setFeedbackType(feedbackTypes[0] ?? '');
  }, [feedbackTypes]);

  const handleVote = useCallback(
    async (id: string) => {
      try {
        const result = await voteFeedback(id);
        setStatus({ kind: 'success', text: `Vote recorded! (${result.voteCount} total)` });
        setDuplicate(null);
        setTimeout(() => setOpen(false), 1200);
      } catch {
        setStatus({ kind: 'error', text: 'Could not record your vote.' });
      }
    },
    [voteFeedback, setOpen],
  );

  const handleSubmit = useCallback(async () => {
    setStatus(null);
    if (!title.trim()) {
      setStatus({ kind: 'error', text: 'Please enter a title.' });
      return;
    }
    if (!description.trim()) {
      setStatus({ kind: 'error', text: 'Please enter a description.' });
      return;
    }

    try {
      const created = await submitFeedback({
        appId,
        title: title.trim(),
        description: description.trim(),
        feedbackType: feedbackType || feedbackTypes[0],
        pageUrl: typeof window !== 'undefined' ? window.location.href : null,
        screenshotData: screenshot,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
        browserContext: collectBrowserContext(),
        submitterEmail: !isAuthenticated && email.trim() ? email.trim() : null,
        submitterName: !isAuthenticated && name.trim() ? name.trim() : null,
      });
      setStatus({ kind: 'success', text: 'Thank you! Your feedback has been submitted.' });
      onSubmitted?.(created.id);
      resetForm();
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        setStatus({ kind: 'error', text: 'Too many submissions. Please try again later.' });
      } else {
        const message = err instanceof Error ? err.message : 'Failed to submit feedback.';
        setStatus({ kind: 'error', text: message });
      }
    }
  }, [
    title,
    description,
    feedbackType,
    feedbackTypes,
    appId,
    screenshot,
    attachments,
    isAuthenticated,
    email,
    name,
    submitFeedback,
    onSubmitted,
    resetForm,
    setOpen,
  ]);

  // Don't render anything if the app has explicitly disabled the widget.
  if (config && !config.isEnabled) return null;

  const cssVars = resolvedColor
    ? ({ ['--ww-feedback-color' as string]: resolvedColor } as React.CSSProperties)
    : undefined;

  return (
    <div className={`ww-feedback ${className ?? ''}`} style={cssVars}>
      {showLauncher && !panelOpen && (
        <button
          type="button"
          className={`ww-feedback-launcher ww-feedback-${resolvedPosition}`}
          onClick={() => setOpen(true)}
          aria-label="Open feedback form"
          title="Send Feedback"
        >
          {FEEDBACK_ICON}
        </button>
      )}

      {panelOpen && (
        <div
          className={`ww-feedback-panel ww-feedback-${resolvedPosition}`}
          role="dialog"
          aria-label="Feedback form"
          aria-modal="false"
        >
          <div className="ww-feedback-header">
            <span>Send Feedback</span>
            <button
              type="button"
              className="ww-feedback-close"
              onClick={() => setOpen(false)}
              aria-label="Close feedback form"
            >
              &times;
            </button>
          </div>

          <div className="ww-feedback-body">
            {status && (
              <div
                className={`ww-feedback-status ww-feedback-status-${status.kind}`}
                role={status.kind === 'error' ? 'alert' : 'status'}
              >
                {status.text}
              </div>
            )}

            <label htmlFor="ww-feedback-type">Type</label>
            <select
              id="ww-feedback-type"
              className="ww-feedback-select"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
            >
              {feedbackTypes.map((t) => (
                <option key={t} value={t}>
                  {humanizeType(t)}
                </option>
              ))}
            </select>

            <label htmlFor="ww-feedback-title">
              Title <span className="ww-feedback-required">*</span>
            </label>
            <input
              id="ww-feedback-title"
              className="ww-feedback-input"
              type="text"
              placeholder="Brief summary"
              maxLength={200}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />

            {duplicate && (
              <div className="ww-feedback-duplicate" role="status">
                <span>
                  ⚠ Similar feedback exists: <strong>{duplicate.duplicateTitle}</strong>
                  {duplicate.duplicateVoteCount > 0 ? ` (${duplicate.duplicateVoteCount} votes)` : ''}
                </span>
                {duplicate.duplicateId && (
                  <button
                    type="button"
                    className="ww-feedback-vote-btn"
                    onClick={() => handleVote(duplicate.duplicateId as string)}
                  >
                    👍 Me too! Upvote instead
                  </button>
                )}
              </div>
            )}

            <label htmlFor="ww-feedback-desc">
              Description <span className="ww-feedback-required">*</span>
            </label>
            <textarea
              id="ww-feedback-desc"
              className="ww-feedback-textarea"
              placeholder="Tell us more..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {!isAuthenticated && (
              <>
                <label htmlFor="ww-feedback-email">Email</label>
                <input
                  id="ww-feedback-email"
                  className="ww-feedback-input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="ww-feedback-name">Name (optional)</label>
                <input
                  id="ww-feedback-name"
                  className="ww-feedback-input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            )}

            <div className="ww-feedback-screenshot">
              <label>Screenshot</label>
              {screenshot ? (
                <div className="ww-feedback-screenshot-preview">
                  <img src={screenshot} alt="Screenshot preview" />
                  <button
                    type="button"
                    className="ww-feedback-screenshot-remove"
                    onClick={() => setScreenshot(null)}
                    aria-label="Remove screenshot"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="ww-feedback-btn-secondary"
                  onClick={handleCaptureScreenshot}
                  disabled={capturing}
                >
                  {capturing ? 'Capturing…' : '📷 Capture screenshot'}
                </button>
              )}
            </div>

            {allowAttachments && (
              <div className="ww-feedback-attachments">
                <label>Attachments</label>
                <button
                  type="button"
                  className="ww-feedback-btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  accept={config?.allowedAttachmentTypes ?? ''}
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                {attachments.length > 0 && (
                  <ul className="ww-feedback-attachment-list">
                    {attachments.map((att, idx) => (
                      <li key={`${att.name}-${idx}`} className="ww-feedback-attachment-item">
                        <span>
                          {att.name}{' '}
                          <small>({att.size < 1024 ? `${att.size}B` : `${Math.round(att.size / 1024)}KB`})</small>
                        </span>
                        <button
                          type="button"
                          className="ww-feedback-attachment-remove"
                          onClick={() => removeAttachment(idx)}
                          aria-label={`Remove ${att.name}`}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              type="button"
              className="ww-feedback-submit"
              onClick={handleSubmit}
              disabled={submitting || capturing}
            >
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
