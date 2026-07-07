'use client';

// Notification bell: a bell icon with an unread-count badge that opens a dropdown
// panel of recent inbox notifications. Self-contained — owns a single
// useNotificationInbox instance (count polled ~45s), so the badge and the panel
// stay in sync. Distinct from the toast surface (NotificationToastComponent).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppNotification } from '@wildwood/core';
import { useNotificationInbox, type UseNotificationInboxOptions } from '../../hooks/useNotificationInbox.js';
import { NotificationItems } from './NotificationItems.js';

export interface NotificationsBellProps {
  /** Options forwarded to the underlying useNotificationInbox hook (API base, poll interval). */
  inboxOptions?: UseNotificationInboxOptions;
  /** Cap the displayed badge count (shown as "N+"). Default 99. */
  maxBadgeCount?: number;
  /** Text shown when the panel has no notifications. */
  emptyText?: string;
  /** Custom navigation for a clicked item. Defaults to navigating to `notification.link`. */
  onNavigate?: (notification: AppNotification) => void;
  className?: string;
}

const BellIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export function NotificationsBell({
  inboxOptions,
  maxBadgeCount = 99,
  emptyText = 'No notifications',
  onNavigate,
  className,
}: NotificationsBellProps) {
  const { notifications, unreadCount, loading, markRead, markAllRead, remove } = useNotificationInbox(inboxOptions);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleItemClick = useCallback(
    (n: AppNotification) => {
      if (n.status === 'Unread') void markRead(n.id);
      if (onNavigate) {
        onNavigate(n);
        setOpen(false);
        return;
      }
      if (n.link && typeof window !== 'undefined') {
        window.location.assign(n.link);
        setOpen(false);
      }
    },
    [markRead, onNavigate],
  );

  const badgeLabel = unreadCount > maxBadgeCount ? `${maxBadgeCount}+` : String(unreadCount);

  return (
    <div className={`ww-notification-bell ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className="ww-notification-bell-button ww-btn-icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="ww-notification-bell-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="ww-notification-bell-panel" role="dialog" aria-label="Notifications">
          <NotificationItems
            notifications={notifications}
            loading={loading}
            unreadCount={unreadCount}
            showMarkAllRead={true}
            emptyText={emptyText}
            onMarkRead={(id) => void markRead(id)}
            onRemove={(id) => void remove(id)}
            onMarkAllRead={() => void markAllRead()}
            onItemClick={handleItemClick}
          />
        </div>
      )}
    </div>
  );
}
