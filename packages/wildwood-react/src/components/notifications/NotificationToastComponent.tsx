import { useEffect, useRef, useCallback } from 'react';
import type { NotificationAction } from '@wildwood/core';
import { useNotifications } from '../../hooks/useNotifications.js';

export interface NotificationToastComponentProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
  defaultDuration?: number;
  autoDismiss?: boolean;
  className?: string;
  onAction?: (notificationId: string, action: NotificationAction) => void;
  onNotificationDismissed?: (notificationId: string) => void;
}

function getTimeAgo(timestamp?: string): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationToastComponent({
  position = 'top-right',
  maxToasts = 5,
  defaultDuration = 5000,
  autoDismiss = true,
  className,
  onAction,
  onNotificationDismissed,
}: NotificationToastComponentProps) {
  const { toasts, dismiss } = useNotifications();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevToastIdsRef = useRef<Set<string>>(new Set());

  const visibleToasts = toasts.slice(0, maxToasts);

  // Auto-dismiss toasts
  useEffect(() => {
    if (!autoDismiss) return;
    const timers = timersRef.current;
    for (const toast of visibleToasts) {
      if (timers.has(toast.id)) continue;
      const duration = toast.duration ?? defaultDuration;
      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss(toast.id);
          timers.delete(toast.id);
        }, duration);
        timers.set(toast.id, timer);
      }
    }
    // Clean up timers for removed toasts
    for (const [id, timer] of timers) {
      if (!visibleToasts.find((t) => t.id === id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }
  }, [visibleToasts, dismiss, defaultDuration, autoDismiss]);

  // Track dismissed notifications
  useEffect(() => {
    const currentIds = new Set(toasts.map((t) => t.id));
    const prevIds = prevToastIdsRef.current;

    if (onNotificationDismissed) {
      for (const prevId of prevIds) {
        if (!currentIds.has(prevId)) {
          onNotificationDismissed(prevId);
        }
      }
    }

    prevToastIdsRef.current = currentIds;
  }, [toasts, onNotificationDismissed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const handleDismiss = useCallback(
    (id: string) => {
      dismiss(id);
    },
    [dismiss],
  );

  const handleAction = useCallback(
    (notificationId: string, action: NotificationAction) => {
      onAction?.(notificationId, action);
      if (action.dismissOnClick) {
        handleDismiss(notificationId);
      }
    },
    [onAction, handleDismiss],
  );

  const getTypeClass = (type: string) => {
    const t = type.toLowerCase();
    switch (t) {
      case 'success':
        return 'ww-toast-success';
      case 'error':
        return 'ww-toast-error';
      case 'warning':
        return 'ww-toast-warning';
      case 'info':
        return 'ww-toast-info';
      default:
        return 'ww-toast-info';
    }
  };

  const getTypeIcon = (type: string) => {
    const t = type.toLowerCase();
    switch (t) {
      case 'success':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'error':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  const getActionStyleClass = (style?: string) => {
    const s = (style ?? 'primary').toLowerCase();
    return `ww-btn ww-btn-sm ww-btn-${s === 'danger' ? 'danger' : s === 'success' ? 'success' : s === 'warning' ? 'warning' : s === 'secondary' ? 'outline' : 'primary'}`;
  };

  if (visibleToasts.length === 0) return null;

  return (
    <div className={`ww-toast-container ww-toast-${position} ${className ?? ''}`} aria-live="polite">
      {visibleToasts.map((toast) => (
        <div key={toast.id} className={`ww-toast ${getTypeClass(toast.type)}`} role="alert">
          <div className="ww-toast-icon">{getTypeIcon(toast.type)}</div>
          <div className="ww-toast-body">
            <div className="ww-toast-content">
              {toast.title && <div className="ww-toast-title">{toast.title}</div>}
              <div className="ww-toast-message">{toast.message}</div>
            </div>
            {toast.timestamp && <div className="ww-toast-time">{getTimeAgo(toast.timestamp)}</div>}
            {toast.actions && toast.actions.length > 0 && (
              <div className="ww-toast-actions">
                {toast.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={getActionStyleClass(action.style)}
                    onClick={() => handleAction(toast.id, action)}
                  >
                    {action.text}
                  </button>
                ))}
              </div>
            )}
          </div>
          {toast.isDismissible !== false && (
            <button
              type="button"
              className="ww-toast-close"
              onClick={() => handleDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
