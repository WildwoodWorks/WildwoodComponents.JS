import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNotifications } from '../hooks/useNotifications';

export interface NotificationComponentProps {
  /** Optional style override for the outer container */
  style?: object;
}

type NotificationType = 'info' | 'success' | 'warning' | 'error';

const TYPE_OPTIONS: { label: string; value: NotificationType }[] = [
  { label: 'Info', value: 'info' },
  { label: 'Success', value: 'success' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
];

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: '#DCFCE7', text: '#166534' },
  error: { bg: '#FEE2E2', text: '#991B1B' },
  Error: { bg: '#FEE2E2', text: '#991B1B' },
  warning: { bg: '#FFF7ED', text: '#9A3412' },
  info: { bg: '#EFF6FF', text: '#1E40AF' },
};

/**
 * Notification manager component - provides UI to trigger and manage notifications.
 * Complements NotificationToastComponent which renders the actual toasts.
 */
export function NotificationComponent({
  style,
}: NotificationComponentProps) {
  const { toasts, success, error, warning, info, dismiss, clear } = useNotifications();

  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<NotificationType>('info');

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    const titleVal = title.trim() || undefined;
    switch (type) {
      case 'success': success(message, titleVal); break;
      case 'error': error(message, titleVal); break;
      case 'warning': warning(message, titleVal); break;
      default: info(message, titleVal); break;
    }
    setMessage('');
    setTitle('');
  }, [message, title, type, success, error, warning, info]);

  const getBadgeColor = (toastType: string) => {
    const key = toastType === 'Error' ? 'error' : toastType.toLowerCase();
    return BADGE_COLORS[key] ?? BADGE_COLORS.info;
  };

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.contentContainer}>
      {/* Send notification form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send Notification</Text>

        {/* Type selector (segmented control replacing HTML select) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeSelector}>
            {TYPE_OPTIONS.map((opt, index) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.typeOption,
                  type === opt.value && styles.typeOptionSelected,
                  index < TYPE_OPTIONS.length - 1 && styles.typeOptionBorder,
                ]}
                onPress={() => setType(opt.value)}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    type === opt.value && styles.typeOptionTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Title input */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Title (optional)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Notification title"
            placeholderTextColor="#999"
          />
        </View>

        {/* Message input */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Notification message"
            placeholderTextColor="#999"
          />
        </View>

        <Pressable
          style={[styles.primaryButton, !message.trim() && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Text style={styles.primaryButtonText}>Send Notification</Text>
        </Pressable>
      </View>

      {/* Active notifications list */}
      {toasts.length > 0 && (
        <View style={styles.card}>
          <View style={styles.listHeader}>
            <Text style={[styles.cardTitle, styles.listHeaderTitle]}>
              Active Notifications ({toasts.length})
            </Text>
            <Pressable style={styles.clearButton} onPress={clear}>
              <Text style={styles.clearButtonText}>Clear All</Text>
            </Pressable>
          </View>
          {toasts.map((toast) => {
            const badgeColor = getBadgeColor(toast.type);
            return (
              <View key={toast.id} style={styles.notificationItem}>
                <View style={[styles.badge, { backgroundColor: badgeColor.bg }]}>
                  <Text style={[styles.badgeText, { color: badgeColor.text }]}>
                    {toast.type}
                  </Text>
                </View>
                <Text style={styles.notificationMessage} numberOfLines={2}>
                  {toast.title ? `${toast.title}: ` : ''}{toast.message}
                </Text>
                <Pressable
                  style={styles.dismissButton}
                  onPress={() => dismiss(toast.id)}
                  hitSlop={8}
                  accessibilityLabel="Dismiss notification"
                  accessibilityRole="button"
                >
                  <Text style={styles.dismissText}>{'\u00D7'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },

  // Form
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },

  // Type selector (segmented control style)
  typeSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  typeOptionBorder: {
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  typeOptionSelected: {
    backgroundColor: '#007AFF',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  typeOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },

  // Primary button
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // List header
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listHeaderTitle: {
    marginBottom: 0,
    flex: 1,
  },
  clearButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Notification item
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 10,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  notificationMessage: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  dismissButton: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '300',
    lineHeight: 20,
  },
});
