import { useState } from 'react';
import { useDebug } from '../../contexts/DebugContext';

type Tab = 'http' | 'lifecycle' | 'signalr';

export function DebugPanel() {
  const {
    httpEntries, lifecycleEntries, signalREntries,
    clearHttp, clearLifecycle, clearSignalR,
  } = useDebug();
  const [activeTab, setActiveTab] = useState<Tab>('http');
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="debug-panel debug-panel-collapsed">
        <button type="button" className="debug-toggle" onClick={() => setCollapsed(false)}>
          Debug ({httpEntries.length + lifecycleEntries.length + signalREntries.length})
        </button>
      </div>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <div className="debug-tabs">
          <button
            type="button"
            className={activeTab === 'http' ? 'active' : ''}
            onClick={() => setActiveTab('http')}
          >
            HTTP ({httpEntries.length})
          </button>
          <button
            type="button"
            className={activeTab === 'lifecycle' ? 'active' : ''}
            onClick={() => setActiveTab('lifecycle')}
          >
            Lifecycle ({lifecycleEntries.length})
          </button>
          <button
            type="button"
            className={activeTab === 'signalr' ? 'active' : ''}
            onClick={() => setActiveTab('signalr')}
          >
            SignalR ({signalREntries.length})
          </button>
        </div>
        <div className="debug-actions">
          <button
            type="button"
            className="dismiss-btn"
            onClick={() => {
              if (activeTab === 'http') clearHttp();
              else if (activeTab === 'lifecycle') clearLifecycle();
              else clearSignalR();
            }}
          >
            Clear
          </button>
          <button type="button" className="dismiss-btn" onClick={() => setCollapsed(true)}>
            Collapse
          </button>
        </div>
      </div>

      <div className="debug-content">
        {activeTab === 'http' && (
          httpEntries.length === 0 ? (
            <p className="debug-empty">No HTTP requests captured yet.</p>
          ) : (
            <table className="debug-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>URL</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {httpEntries.map((entry) => (
                  <tr key={entry.id} className={entry.status && entry.status >= 400 ? 'debug-error' : ''}>
                    <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
                    <td>{entry.status ?? '...'}</td>
                    <td className="debug-url">{entry.url}</td>
                    <td>{entry.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'lifecycle' && (
          lifecycleEntries.length === 0 ? (
            <p className="debug-empty">No lifecycle events captured yet.</p>
          ) : (
            <table className="debug-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Component</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {lifecycleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
                    <td>{entry.event}</td>
                    <td>{entry.component}</td>
                    <td className="debug-data">{entry.data ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'signalr' && (
          signalREntries.length === 0 ? (
            <p className="debug-empty">No SignalR messages captured yet.</p>
          ) : (
            <table className="debug-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {signalREntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
                    <td><span className={`debug-badge debug-badge-${entry.type}`}>{entry.type}</span></td>
                    <td>{entry.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
