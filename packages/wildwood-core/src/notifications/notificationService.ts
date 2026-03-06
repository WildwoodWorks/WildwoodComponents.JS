// Notification service - client-side toast queue management
// Mirrors WildwoodComponents.Blazor notification pattern

import { NotificationType, NotificationPosition, type ToastNotification } from './types.js';

let nextId = 1;

export class NotificationService {
  private toasts: ToastNotification[] = [];
  private listeners: Set<() => void> = new Set();
  private defaultPosition: NotificationPosition = NotificationPosition.TopRight;
  private defaultDurationMs = 5000;

  /** Get current toast queue (read-only snapshot) */
  getToasts(): readonly ToastNotification[] {
    return this.toasts;
  }

  /** Get default position for rendering */
  getDefaultPosition(): NotificationPosition {
    return this.defaultPosition;
  }

  /** Subscribe to toast changes (returns unsubscribe) */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Show a toast notification */
  show(
    message: string,
    type: NotificationType = NotificationType.Info,
    title?: string,
    durationMs?: number,
  ): string {
    const id = String(nextId++);
    const duration = durationMs ?? this.defaultDurationMs;
    const toast: ToastNotification = {
      id,
      type,
      title: title ?? '',
      message,
      duration,
      isVisible: true,
      isDismissible: true,
      timestamp: new Date().toISOString(),
    };
    this.toasts.push(toast);
    this.notify();

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  success(message: string, title?: string): string {
    return this.show(message, NotificationType.Success, title);
  }

  error(message: string, title?: string): string {
    return this.show(message, NotificationType.Error, title, 0); // errors don't auto-dismiss
  }

  warning(message: string, title?: string): string {
    return this.show(message, NotificationType.Warning, title);
  }

  info(message: string, title?: string): string {
    return this.show(message, NotificationType.Info, title);
  }

  /** Dismiss a specific toast */
  dismiss(id: string): void {
    const idx = this.toasts.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.toasts.splice(idx, 1);
      this.notify();
    }
  }

  /** Clear all toasts */
  clear(): void {
    this.toasts = [];
    this.notify();
  }

  /** Set default position */
  setDefaultPosition(position: NotificationPosition): void {
    this.defaultPosition = position;
  }

  /** Set default duration */
  setDefaultDuration(durationMs: number): void {
    this.defaultDurationMs = durationMs;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Listener errors should not break notification system
      }
    }
  }
}
