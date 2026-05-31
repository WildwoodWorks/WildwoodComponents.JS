'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedbackAttachment, FeedbackDuplicateCheck } from '@wildwood/core';
import { useFeedback } from '../../hooks/useFeedback.js';
import { useAuth } from '../../hooks/useAuth.js';
import { collectBrowserContext, installConsoleCapture } from './feedbackBrowserContext.js';
import { captureArea, captureFullPage } from './feedbackScreenshot.js';

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

/** localStorage key for the dragged launcher position (shared name with the Razor/Blazor widgets). */
const POSITION_KEY = 'ww-feedback-widget-pos';

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
  const [dragOver, setDragOver] = useState(false);
  const [duplicate, setDuplicate] = useState<FeedbackDuplicateCheck | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Install console/error capture while the widget is mounted. Scoped to actual usage so the SDK
  // never patches console globally for consumers that don't render the feedback widget.
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
  const requireScreenshot = config?.requireScreenshot === true;
  // Anonymous users cannot submit when the app forbids anonymous feedback.
  const anonymousBlocked = !isAuthenticated && config?.allowAnonymous === false;

  // Drag-to-reposition the floating launcher (mouse + touch), persisting {right, top} to
  // localStorage and restoring it on load/resize. Mirrors the Razor/vanilla widget so a user's
  // chosen button position is shared behavior across the SDKs.
  useEffect(() => {
    const btn = launcherRef.current;
    if (!btn || typeof window === 'undefined') return;

    let isDragging = false;
    let hasMoved = false;
    const dragOffset = { x: 0, y: 0 };

    const positionBtnAt = (left: number, top: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bw = btn.offsetWidth || 52;
      const bh = btn.offsetHeight || 52;
      btn.style.left = Math.max(0, Math.min(left, vw - bw)) + 'px';
      btn.style.top = Math.max(0, Math.min(top, vh - bh)) + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    };
    const savePosition = () => {
      try {
        const vw = window.innerWidth;
        const rect = btn.getBoundingClientRect();
        localStorage.setItem(POSITION_KEY, JSON.stringify({ right: vw - rect.right, top: rect.top }));
      } catch {
        /* storage unavailable */
      }
    };
    const restorePosition = () => {
      try {
        const raw = localStorage.getItem(POSITION_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s && typeof s.right === 'number' && typeof s.top === 'number') {
          const bw = btn.offsetWidth || 52;
          positionBtnAt(window.innerWidth - s.right - bw, s.top);
        }
      } catch {
        /* ignore */
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      hasMoved = false;
      const r = btn.getBoundingClientRect();
      dragOffset.x = e.clientX - r.left;
      dragOffset.y = e.clientY - r.top;
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      hasMoved = true;
      positionBtnAt(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
      savePosition();
    };
    const onMouseUp = () => {
      if (isDragging && !hasMoved) setOpen(true);
      isDragging = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      isDragging = true;
      hasMoved = false;
      const r = btn.getBoundingClientRect();
      dragOffset.x = t.clientX - r.left;
      dragOffset.y = t.clientY - r.top;
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      hasMoved = true;
      positionBtnAt(t.clientX - dragOffset.x, t.clientY - dragOffset.y);
      savePosition();
      e.preventDefault();
    };
    const onTouchEnd = () => {
      if (isDragging && !hasMoved) setOpen(true);
      isDragging = false;
    };
    const onResize = () => {
      if (!btn.style.left || btn.style.left === 'auto') return;
      restorePosition();
    };

    btn.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    btn.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    window.addEventListener('resize', onResize);

    restorePosition();

    return () => {
      btn.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      btn.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
    };
  }, [showLauncher, panelOpen, anonymousBlocked, setOpen]);

  // Focus the first field when the panel opens and trap Tab within it.
  useEffect(() => {
    if (!panelOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusTimer = setTimeout(() => {
      // Focus the first form field (not the header close button) on open, matching the Razor widget.
      const first = panel.querySelector<HTMLElement>('select, input, textarea');
      first?.focus();
    }, 80);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href]');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      panel.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  // Apply the resolved accent color as a CSS custom property imperatively (rather than an inline
  // style prop) so the only dynamic styling lives on the element without inline-style churn.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (resolvedColor) root.style.setProperty('--ww-feedback-color', resolvedColor);
    else root.style.removeProperty('--ww-feedback-color');
  }, [resolvedColor]);

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

  // Run a screenshot capture, hiding the widget so it never appears in the shot.
  const runCapture = useCallback(async (factory: () => Promise<string | null>) => {
    setStatus(null);
    setCapturing(true);
    try {
      // Let React paint the hidden state (display:none on the root) before the snapshot so the
      // launcher/panel never appear in the captured image — html2canvas can run synchronously
      // once the library is cached, which would otherwise race the re-render.
      await new Promise((resolve) => setTimeout(resolve, 60));
      const data = await factory();
      if (data) setScreenshot(data);
    } catch {
      setStatus({ kind: 'error', text: 'Failed to capture screenshot.' });
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleCaptureArea = useCallback(
    () => runCapture(() => captureArea(config?.screenshotQuality ?? 80, config?.screenshotMaxSizeKb ?? 500)),
    [runCapture, config],
  );
  const handleCaptureFull = useCallback(
    () => runCapture(() => captureFullPage(config?.screenshotQuality ?? 80, config?.screenshotMaxSizeKb ?? 500)),
    [runCapture, config],
  );

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
    if (requireScreenshot && !screenshot) {
      setStatus({ kind: 'error', text: 'Please attach a screenshot before submitting.' });
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
      // Fire a DOM event in addition to the callback so non-React listeners (parity with the
      // Razor/vanilla widget's `ww-feedback-submitted` event) are notified too.
      rootRef.current?.dispatchEvent(new CustomEvent('ww-feedback-submitted', { bubbles: true }));
      onSubmitted?.(created.id);
      resetForm();
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      const errStatus = (err as { status?: number })?.status;
      if (errStatus === 429) {
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
    requireScreenshot,
    submitFeedback,
    onSubmitted,
    resetForm,
    setOpen,
  ]);

  // Don't render anything if the app has explicitly disabled the widget, or if the viewer is
  // anonymous and the app forbids anonymous feedback (parity with the Razor ViewComponent which
  // renders nothing in that case).
  if (config && !config.isEnabled) return null;
  if (anonymousBlocked) return null;

  // `ww-feedback-capturing` hides the launcher + panel (display:none) while a capture is in
  // progress so they never appear in the shot — kept in CSS rather than an inline style.
  return (
    <div ref={rootRef} className={`ww-feedback${capturing ? ' ww-feedback-capturing' : ''} ${className ?? ''}`}>
      {showLauncher && !panelOpen && (
        <button
          ref={launcherRef}
          type="button"
          className={`ww-feedback-launcher ww-feedback-${resolvedPosition}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          aria-label="Open feedback form"
          title="Send Feedback"
        >
          {FEEDBACK_ICON}
        </button>
      )}

      {panelOpen && (
        <div
          ref={panelRef}
          className={`ww-feedback-panel ww-feedback-${resolvedPosition}`}
          role="dialog"
          aria-label="Feedback form"
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
            {status &&
              (status.kind === 'error' ? (
                <div className="ww-feedback-status ww-feedback-status-error" role="alert">
                  {status.text}
                </div>
              ) : (
                <div className="ww-feedback-status ww-feedback-status-success" role="status">
                  {status.text}
                </div>
              ))}

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
              <label>Screenshot {requireScreenshot && <span className="ww-feedback-required">*</span>}</label>
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
                <div className="ww-feedback-screenshot-btns">
                  <button
                    type="button"
                    className="ww-feedback-btn-secondary"
                    onClick={handleCaptureArea}
                    disabled={capturing}
                  >
                    📷 Capture Area
                  </button>
                  <button
                    type="button"
                    className="ww-feedback-btn-secondary"
                    onClick={handleCaptureFull}
                    disabled={capturing}
                  >
                    📸 Full Page
                  </button>
                </div>
              )}
            </div>

            {allowAttachments && (
              <div className="ww-feedback-attachments">
                <label>Attachments</label>
                <div
                  className={`ww-feedback-attachment-drop${dragOver ? ' ww-dragover' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                >
                  <span className="ww-feedback-attachment-label">
                    Drop files here or{' '}
                    <button
                      type="button"
                      className="ww-feedback-attachment-browse"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      browse
                    </button>
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  aria-label="Attach files"
                  className="ww-feedback-file-input"
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
