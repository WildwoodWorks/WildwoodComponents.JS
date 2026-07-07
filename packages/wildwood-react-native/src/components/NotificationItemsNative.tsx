// Internal presentational list of inbox notifications for React Native, shared by
// NotificationsBell (modal panel) and NotificationList (standalone). Owns no data —
// the hosting component supplies items + handlers from a single useNotificationInbox
// instance so the unread badge and the list never drift apart. Not exported.

import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppNotification } from '@wildwood/core';

export interface NotificationItemsNativeProps {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  showMarkAllRead: boolean;
  emptyText: string;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  onMarkAllRead: () => void;
  onItemPress: (notification: AppNotification) => void;
  style?: ViewStyle;
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

export function NotificationItemsNative({
  notifications,
  loading,
  unreadCount,
  showMarkAllRead,
  emptyText,
  onMarkRead,
  onRemove,
  onMarkAllRead,
  onItemPress,
  style,
}: NotificationItemsNativeProps) {
  return (
    <View style={[styles.container, style]}>
      {showMarkAllRead && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Pressable
            style={[styles.markAllButton, unreadCount === 0 && styles.disabled]}
            onPress={onMarkAllRead}
            disabled={unreadCount === 0}
            accessibilityRole="button"
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        </View>
      )}

      {loading && notifications.length === 0 ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : notifications.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isUnread = item.status === 'Unread';
            return (
              <View style={[styles.item, isUnread && styles.itemUnread]}>
                <Pressable
                  style={styles.itemMain}
                  onPress={() => onItemPress(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || item.message}
                >
                  {isUnread && <View style={styles.dot} />}
                  <View style={styles.itemBody}>
                    {!!item.title && (
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    )}
                    <Text style={styles.itemMessage} numberOfLines={3}>
                      {item.message}
                    </Text>
                    <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                </Pressable>
                <View style={styles.itemActions}>
                  {isUnread && (
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => onMarkRead(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Mark as read"
                    >
                      <Text style={styles.checkText}>{'✓'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => onRemove(item.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete notification"
                  >
                    <Text style={styles.dismissText}>{'×'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  markAllButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  markAllText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemUnread: {
    backgroundColor: '#eff6ff',
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: '#2563eb',
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  itemMessage: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 3,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 16,
    color: '#16a34a',
    fontWeight: '700',
  },
  dismissText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '300',
    lineHeight: 20,
  },
});
