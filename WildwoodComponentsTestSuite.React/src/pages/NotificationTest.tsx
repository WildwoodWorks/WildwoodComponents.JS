import { useNotifications } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function NotificationTest() {
  const { toasts, show, success, error, warning, info, dismiss, clear } = useNotifications();

  return (
    <ComponentTestPage
      title="Notification Component"
      description="Tests toast notification queue with different types and durations."
    >
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
    </ComponentTestPage>
  );
}
