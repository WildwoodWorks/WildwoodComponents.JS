import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { ToastNotification, NotificationType } from '@wildwood/core';
import { useNotifications } from '../hooks/useNotifications';

export interface NotificationToastComponentProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
  style?: ViewStyle;
}

const TYPE_COLORS: Record<NotificationType, string> = {
  Success: '#22c55e',
  Error: '#ef4444',
  Warning: '#f97316',
  Info: '#3b82f6',
};

const TYPE_BG_COLORS: Record<NotificationType, string> = {
  Success: '#f0fdf4',
  Error: '#fef2f2',
  Warning: '#fff7ed',
  Info: '#eff6ff',
};

function getTypeIcon(type: NotificationType): string {
  switch (type) {
    case 'Success':
      return '\u2713';
    case 'Error':
      return '\u2717';
    case 'Warning':
      return '\u26A0';
    case 'Info':
      return '\u2139';
    default:
      return '\u2139';
  }
}

function getPositionStyle(position: NonNullable<NotificationToastComponentProps['position']>) {
  const base: Record<string, number | string> = { position: 'absolute' as const };

  if (position.startsWith('top')) {
    base.top = 16;
  } else {
    base.bottom = 16;
  }

  if (position.endsWith('left')) {
    base.left = 16;
    base.alignItems = 'flex-start';
  } else if (position.endsWith('right')) {
    base.right = 16;
    base.alignItems = 'flex-end';
  } else {
    // center
    base.left = 0;
    base.right = 0;
    base.alignItems = 'center';
  }

  return base;
}

export function NotificationToastComponent({
  position = 'top-right',
  maxToasts = 5,
  style,
}: NotificationToastComponentProps) {
  const { toasts, dismiss } = useNotifications();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const visibleToasts = toasts.slice(0, maxToasts);

  useEffect(() => {
    // Set up auto-dismiss timers for toasts with a duration
    for (const toast of visibleToasts) {
      if (toast.duration && toast.duration > 0 && !timersRef.current.has(toast.id)) {
        const timer = setTimeout(() => {
          dismiss(toast.id);
          timersRef.current.delete(toast.id);
        }, toast.duration);
        timersRef.current.set(toast.id, timer);
      }
    }

    // Clean up timers for toasts that no longer exist
    const currentIds = new Set(visibleToasts.map((t) => t.id));
    timersRef.current.forEach((timer, id) => {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });
  }, [visibleToasts, dismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const positionStyle = getPositionStyle(position);

  return (
    <View style={[styles.container, positionStyle, style]} pointerEvents="box-none">
      {visibleToasts.map((toast: ToastNotification) => {
        const typeColor = TYPE_COLORS[toast.type] ?? TYPE_COLORS.Info;
        const typeBg = TYPE_BG_COLORS[toast.type] ?? TYPE_BG_COLORS.Info;

        return (
          <View
            key={toast.id}
            style={[styles.toast, { borderLeftColor: typeColor, backgroundColor: typeBg }]}
            accessibilityRole="alert"
          >
            <View style={[styles.iconContainer, { backgroundColor: typeColor }]}>
              <Text style={styles.iconText}>{getTypeIcon(toast.type)}</Text>
            </View>
            <View style={styles.content}>
              {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
              <Text style={styles.message}>{toast.message}</Text>
            </View>
            {toast.isDismissible && (
              <Pressable
                style={styles.closeButton}
                onPress={() => dismiss(toast.id)}
                accessibilityLabel="Dismiss notification"
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.closeText}>{'\u00D7'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '300',
    lineHeight: 20,
  },
});
