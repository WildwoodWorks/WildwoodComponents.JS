// Notification bell for React Native: a bell glyph with an unread-count badge that
// opens a modal panel of recent inbox notifications. Self-contained — owns a single
// useNotificationInbox instance (count polled ~45s) so the badge and the panel stay
// in sync. Distinct from the toast surface (NotificationToastComponent).

import { useCallback, useState } from 'react';
import { View, Text, Pressable, Modal, Linking, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppNotification } from '@wildwood/core';
import { useNotificationInbox, type UseNotificationInboxOptions } from '../hooks/useNotificationInbox';
import { NotificationItemsNative } from './NotificationItemsNative';

export interface NotificationsBellProps {
  /** Options forwarded to the underlying useNotificationInbox hook (API base, poll interval). */
  inboxOptions?: UseNotificationInboxOptions;
  /** Cap the displayed badge count (shown as "N+"). Default 99. */
  maxBadgeCount?: number;
  /** Text shown when the panel has no notifications. */
  emptyText?: string;
  /** Custom navigation for a tapped item. Defaults to opening `notification.link` (http/https) with Linking. */
  onNavigate?: (notification: AppNotification) => void;
  style?: ViewStyle;
}

export function NotificationsBell({
  inboxOptions,
  maxBadgeCount = 99,
  emptyText = 'No notifications',
  onNavigate,
  style,
}: NotificationsBellProps) {
  const { notifications, unreadCount, loading, markRead, markAllRead, remove } = useNotificationInbox(inboxOptions);
  const [open, setOpen] = useState(false);

  const handleItemPress = useCallback(
    (n: AppNotification) => {
      if (n.status === 'Unread') void markRead(n.id);
      if (onNavigate) {
        onNavigate(n);
        setOpen(false);
        return;
      }
      if (n.link && /^https?:\/\//i.test(n.link)) {
        void Linking.openURL(n.link);
        setOpen(false);
      }
    },
    [markRead, onNavigate],
  );

  const badgeLabel = unreadCount > maxBadgeCount ? `${maxBadgeCount}+` : String(unreadCount);

  return (
    <View style={style}>
      <Pressable
        style={styles.bellButton}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Text style={styles.bellIcon}>{'🔔'}</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Stop propagation so taps inside the panel don't dismiss it. */}
          <Pressable style={styles.panel} onPress={() => undefined}>
            <NotificationItemsNative
              notifications={notifications}
              loading={loading}
              unreadCount={unreadCount}
              showMarkAllRead={true}
              emptyText={emptyText}
              onMarkRead={(id) => void markRead(id)}
              onRemove={(id) => void remove(id)}
              onMarkAllRead={() => void markAllRead()}
              onItemPress={handleItemPress}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#dc3545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingHorizontal: 12,
  },
  panel: {
    width: '92%',
    maxWidth: 380,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
});
