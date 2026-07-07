// Standalone notification inbox list for React Native. Self-contained: owns a
// single useNotificationInbox instance (backend-connected, count polled ~45s).
// Per-item mark-read + delete, tap-to-navigate via the item's `link`, and a
// "mark all read" action.

import { useCallback } from 'react';
import { Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppNotification } from '@wildwood/core';
import { useNotificationInbox, type UseNotificationInboxOptions } from '../hooks/useNotificationInbox';
import { NotificationItemsNative } from './NotificationItemsNative';

export interface NotificationListProps {
  /** Options forwarded to the underlying useNotificationInbox hook (API base, poll interval). */
  inboxOptions?: UseNotificationInboxOptions;
  /** Show the header row with the "Mark all read" action. Default true. */
  showMarkAllRead?: boolean;
  /** Text shown when there are no notifications. */
  emptyText?: string;
  /**
   * Custom navigation for a tapped item (e.g. hook into your navigator). Defaults to
   * opening `notification.link` with Linking when it is an http(s) URL. The item is
   * also marked read.
   */
  onNavigate?: (notification: AppNotification) => void;
  style?: ViewStyle;
}

export function NotificationList({
  inboxOptions,
  showMarkAllRead = true,
  emptyText = 'No notifications',
  onNavigate,
  style,
}: NotificationListProps) {
  const { notifications, unreadCount, loading, markRead, markAllRead, remove } = useNotificationInbox(inboxOptions);

  const handleItemPress = useCallback(
    (n: AppNotification) => {
      if (n.status === 'Unread') void markRead(n.id);
      if (onNavigate) {
        onNavigate(n);
        return;
      }
      if (n.link && /^https?:\/\//i.test(n.link)) {
        void Linking.openURL(n.link);
      }
    },
    [markRead, onNavigate],
  );

  return (
    <NotificationItemsNative
      notifications={notifications}
      loading={loading}
      unreadCount={unreadCount}
      showMarkAllRead={showMarkAllRead}
      emptyText={emptyText}
      onMarkRead={(id) => void markRead(id)}
      onRemove={(id) => void remove(id)}
      onMarkAllRead={() => void markAllRead()}
      onItemPress={handleItemPress}
      style={style}
    />
  );
}
