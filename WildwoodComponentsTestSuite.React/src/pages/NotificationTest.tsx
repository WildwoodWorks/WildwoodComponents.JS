import { useNotifications } from '@wildwood/react';

export function NotificationTest() {
  const { toasts, show, success, error, warning, info, dismiss, clear } = useNotifications();

  return (
    <div className="page">
      <h1>Notification Component</h1>
      <p>Tests toast notification queue with different types and durations.</p>

      <div className="button-group">
        <button onClick={() => success('Operation completed successfully!', 'Success')}>
          Success
        </button>
        <button onClick={() => error('Something went wrong.', 'Error')}>
          Error
        </button>
        <button onClick={() => warning('Please check your input.', 'Warning')}>
          Warning
        </button>
        <button onClick={() => info('Here is some information.', 'Info')}>
          Info
        </button>
        <button onClick={() => show('Custom notification', undefined, 'Custom', 10000)}>
          Custom (10s)
        </button>
        <button onClick={() => clear()} disabled={toasts.length === 0}>
          Clear All
        </button>
      </div>

      <div className="status-card">
        <h3>Active Toasts ({toasts.length})</h3>
        {toasts.length === 0 ? (
          <p>No active toasts.</p>
        ) : (
          <ul>
            {toasts.map((toast) => (
              <li key={toast.id}>
                <strong>[{toast.type}]</strong> {toast.title ? `${toast.title}: ` : ''}{toast.message}
                <button className="dismiss-btn" onClick={() => dismiss(toast.id)}>Dismiss</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
