'use client';

// Standalone / full-page notification inbox list. Self-contained: owns a single
// useNotificationInbox instance (backend-connected, count polled ~45s). Renders
// each AppNotification with per-item mark-read + delete, click-to-navigate via the
// item's `link`, and a "mark all read" action.

import { useCallback } from 'react';
import type { AppNotification } from '@wildwood/core';
import { useNotificationInbox, type UseNotificationInboxOptions } from '../../hooks/useNotificationInbox.js';
import { NotificationItems } from './NotificationItems.js';

export interface NotificationListProps {
  /** Options forwarded to the underlying useNotificationInbox hook (API base, poll interval). */
  inboxOptions?: UseNotificationInboxOptions;
  /** Show the header row with the "Mark all read" action. Default true. */
  showMarkAllRead?: boolean;
  /** Text shown when there are no notifications. */
  emptyText?: string;
  /**
   * Custom navigation for a clicked item. Defaults to navigating to `notification.link`
   * (via window.location) when present. Return handled here; the item is also marked read.
   */
  onNavigate?: (notification: AppNotification) => void;
  className?: string;
}

export function NotificationList({
  inboxOptions,
  showMarkAllRead = true,
  emptyText = 'No notifications',
  onNavigate,
  className,
}: NotificationListProps) {
  const { notifications, unreadCount, loading, markRead, markAllRead, remove } = useNotificationInbox(inboxOptions);

  const handleItemClick = useCallback(
    (n: AppNotification) => {
      if (n.status === 'Unread') void markRead(n.id);
      if (onNavigate) {
        onNavigate(n);
        return;
      }
      if (n.link && typeof window !== 'undefined') {
        window.location.assign(n.link);
      }
    },
    [markRead, onNavigate],
  );

  return (
    <div className={`ww-notification-list-container ${className ?? ''}`}>
      <NotificationItems
        notifications={notifications}
        loading={loading}
        unreadCount={unreadCount}
        showMarkAllRead={showMarkAllRead}
        emptyText={emptyText}
        onMarkRead={(id) => void markRead(id)}
        onRemove={(id) => void remove(id)}
        onMarkAllRead={() => void markAllRead()}
        onItemClick={handleItemClick}
      />
    </div>
  );
}
