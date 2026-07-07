// Web Notifications API helpers for the inbox "browser" channel.
//
// All functions are safe to call in any environment (SSR, React Native, Node): they
// no-op / report 'unsupported' when the Web Notifications API is unavailable. Browser
// notifications are client-triggered — the caller (useNotificationInbox) raises one
// when a NEW unread inbox item arrives, gated by the user's browserEnabled pref AND
// Notification.permission === 'granted'.

/** True only when the Web Notifications API is present (browser main thread). */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current permission, or 'unsupported' when the API is unavailable. */
export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Prompts the user for permission. Resolves to the resulting permission, or
 * 'unsupported' when the API is unavailable. Tolerates the legacy callback form.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    // Modern browsers return a promise; older Safari used a callback (ignored here).
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export interface BrowserNotificationOptions {
  body?: string;
  /** Collapses repeat notifications with the same tag (use the inbox item id). */
  tag?: string;
  /** Invoked when the user activates the notification; the window is focused first. */
  onClick?: () => void;
}

/**
 * Raises a native browser notification. No-op when the API is unsupported or the
 * permission is not 'granted' (never throws).
 */
export function showBrowserNotification(title: string, options?: BrowserNotificationOptions): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, { body: options?.body, tag: options?.tag });
    if (options?.onClick) {
      notification.onclick = () => {
        try {
          window.focus?.();
        } catch {
          // focus can throw in some embedded contexts; ignore.
        }
        options.onClick?.();
      };
    }
  } catch {
    // Constructing a Notification can throw on platforms that require a service worker
    // (e.g. mobile Chrome). Degrade silently — the in-app inbox row still exists.
  }
}
