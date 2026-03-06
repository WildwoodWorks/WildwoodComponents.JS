import { useState, useCallback } from 'react';
import { useNotifications } from '../../hooks/useNotifications.js';

export interface NotificationComponentProps {
  className?: string;
}

/**
 * Notification manager component - provides UI to trigger and manage notifications.
 * Complements NotificationToastComponent which renders the actual toasts.
 */
export function NotificationComponent({
  className,
}: NotificationComponentProps) {
  const { toasts, success, error, warning, info, dismiss, clear } = useNotifications();

  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning' | 'error'>('info');

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

  return (
    <div className={`ww-notification-component ${className ?? ''}`}>
      <div className="ww-notification-form">
        <h4>Send Notification</h4>
        <div className="ww-form-group">
          <label>Type</label>
          <select
            className="ww-form-control"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="ww-form-group">
          <label>Title (optional)</label>
          <input
            type="text"
            className="ww-form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
          />
        </div>
        <div className="ww-form-group">
          <label>Message</label>
          <input
            type="text"
            className="ww-form-control"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Notification message"
          />
        </div>
        <button type="button" className="ww-btn ww-btn-primary" onClick={handleSend} disabled={!message.trim()}>
          Send Notification
        </button>
      </div>

      {toasts.length > 0 && (
        <div className="ww-notification-list">
          <div className="ww-notification-list-header">
            <h4>Active Notifications ({toasts.length})</h4>
            <button type="button" className="ww-btn ww-btn-sm ww-btn-outline" onClick={clear}>
              Clear All
            </button>
          </div>
          {toasts.map((toast) => (
            <div key={toast.id} className="ww-notification-item">
              <span className={`ww-badge ww-badge-${toast.type === 'Error' ? 'danger' : toast.type.toLowerCase()}`}>
                {toast.type}
              </span>
              <span>{toast.title ? `${toast.title}: ` : ''}{toast.message}</span>
              <button type="button" className="ww-btn-icon ww-btn-sm" onClick={() => dismiss(toast.id)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
