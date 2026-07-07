// Backend-connected notification inbox models — mirrors WildwoodAPI NotificationsController DTOs.
//
// Distinct from the client-side toast models in ./types.ts (the in-memory
// NotificationService toast queue). These are persisted, server-owned inbox
// items delivered over the api/notifications surface.

export type AppNotificationStatus = 'Unread' | 'Read' | 'Dismissed';

/** A persisted inbox notification (camelCase from the API). */
export interface AppNotification {
  id: string;
  type: string;
  title?: string;
  message: string;
  /** Optional deep-link the item navigates to when clicked. */
  link?: string;
  appId?: string;
  eventType?: string;
  userId: string;
  status: AppNotificationStatus | string;
  createdAt: string;
}

/** Per-app delivery-channel opt-outs for the authenticated user. */
export interface UserNotificationPreference {
  appId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  /**
   * Web Notifications API channel (opt-in, default false). Browser notifications are
   * client-triggered: the server only creates the in-app row; the web client raises a
   * native Notification when a new unread item arrives, gated by this flag AND
   * Notification.permission === 'granted'.
   */
  browserEnabled?: boolean;
  /** Opaque JSON blob of per-event opt-outs, owned by the server. */
  eventOptOutsJson?: string | null;
}
