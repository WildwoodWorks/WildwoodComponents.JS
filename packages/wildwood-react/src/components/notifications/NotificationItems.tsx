'use client';

// Internal presentational list of inbox notifications, shared by NotificationsBell
// (dropdown panel) and NotificationList (standalone/full-page). Owns no data — the
// hosting component supplies items + handlers from a single useNotificationInbox
// instance so the unread badge and the list never drift out of sync.
//
// Not exported from the package index.

import type { AppNotification } from '@wildwood/core';

export interface NotificationItemsProps {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  showMarkAllRead: boolean;
  emptyText: string;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  onMarkAllRead: () => void;
  onItemClick: (notification: AppNotification) => void;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diff)) return '';
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function NotificationItems({
  notifications,
  loading,
  unreadCount,
  showMarkAllRead,
  emptyText,
  onMarkRead,
  onRemove,
  onMarkAllRead,
  onItemClick,
}: NotificationItemsProps) {
  return (
    <div className="ww-notification-inbox">
      {showMarkAllRead && (
        <div className="ww-notification-inbox-header">
          <span className="ww-notification-inbox-title">Notifications</span>
          <button
            type="button"
            className="ww-btn ww-btn-sm ww-btn-outline"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="ww-notification-inbox-empty">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="ww-notification-inbox-empty">{emptyText}</div>
      ) : (
        <ul className="ww-notification-inbox-list">
          {notifications.map((n) => {
            const isUnread = n.status === 'Unread';
            const clickable = Boolean(n.link);
            return (
              <li
                key={n.id}
                className={`ww-notification-inbox-item${isUnread ? ' ww-notification-inbox-item-unread' : ''}`}
              >
                <button
                  type="button"
                  className="ww-notification-inbox-item-main"
                  onClick={() => onItemClick(n)}
                  aria-label={n.title || n.message}
                  data-clickable={clickable}
                >
                  {isUnread && <span className="ww-notification-inbox-dot" aria-hidden="true" />}
                  <span className="ww-notification-inbox-item-body">
                    {n.title && <span className="ww-notification-inbox-item-title">{n.title}</span>}
                    <span className="ww-notification-inbox-item-message">{n.message}</span>
                    <span className="ww-notification-inbox-item-time">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
                <div className="ww-notification-inbox-item-actions">
                  {isUnread && (
                    <button
                      type="button"
                      className="ww-btn-icon ww-btn-sm"
                      onClick={() => onMarkRead(n.id)}
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <CheckIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ww-btn-icon ww-btn-sm"
                    onClick={() => onRemove(n.id)}
                    aria-label="Delete notification"
                    title="Delete"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
