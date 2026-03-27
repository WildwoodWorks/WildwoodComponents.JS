import { useState } from 'react';
import { NotificationToastComponent, useNotifications } from '@wildwood/react';
import type { NotificationToastComponentProps } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function NotificationToastTest() {
  const { success, error, warning, info, clear } = useNotifications();
  const [position, setPosition] = useState<NonNullable<NotificationToastComponentProps['position']>>('top-right');
  const [duration, setDuration] = useState(5000);
  const [autoDismiss, setAutoDismiss] = useState(true);
  const [maxToasts, setMaxToasts] = useState(5);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (msg: string) =>
    setEventLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  return (
    <ComponentTestPage
      title="Notification Toast Component"
      description="Trigger toast notifications with different types, positions, durations, and auto-dismiss settings."
      settings={{
        position: { type: 'text', value: position },
        duration: { type: 'text', value: String(duration) },
        autoDismiss: { type: 'boolean', value: autoDismiss },
        maxToasts: { type: 'text', value: String(maxToasts) },
      }}
      onSettingChange={(key, value) => {
        if (key === 'position') setPosition(value as NonNullable<NotificationToastComponentProps['position']>);
        if (key === 'duration') setDuration(Number(value) || 5000);
        if (key === 'autoDismiss') setAutoDismiss(value as boolean);
        if (key === 'maxToasts') setMaxToasts(Number(value) || 5);
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className="ww-btn ww-btn-success"
          onClick={() => {
            success('Operation completed successfully!', 'Success');
            log('Triggered success toast');
          }}
        >
          Success
        </button>
        <button
          className="ww-btn ww-btn-danger"
          onClick={() => {
            error('Something went wrong. Please try again.', 'Error');
            log('Triggered error toast');
          }}
        >
          Error
        </button>
        <button
          className="ww-btn ww-btn-warning"
          onClick={() => {
            warning('You are approaching your usage limit.', 'Warning');
            log('Triggered warning toast');
          }}
        >
          Warning
        </button>
        <button
          className="ww-btn ww-btn-primary"
          onClick={() => {
            info('Your session will expire in 5 minutes.', 'Info');
            log('Triggered info toast');
          }}
        >
          Info
        </button>
        <button
          className="ww-btn ww-btn-outline"
          onClick={() => {
            clear();
            log('Cleared all toasts');
          }}
        >
          Clear All
        </button>
      </div>

      <NotificationToastComponent
        position={position}
        defaultDuration={duration}
        autoDismiss={autoDismiss}
        maxToasts={maxToasts}
        onAction={(notificationId, action) => log(`Action "${action.text}" on notification ${notificationId}`)}
        onNotificationDismissed={(id) => log(`Dismissed: ${id}`)}
      />

      {eventLog.length > 0 && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Event Log</h3>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
            {eventLog.map((entry, i) => (
              <div key={i}>{entry}</div>
            ))}
          </div>
        </div>
      )}
    </ComponentTestPage>
  );
}
