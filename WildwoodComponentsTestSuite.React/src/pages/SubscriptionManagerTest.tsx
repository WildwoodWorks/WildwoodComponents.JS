import { useState } from 'react';
import { SubscriptionManagerComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function SubscriptionManagerTest() {
  const [autoLoad, setAutoLoad] = useState(true);
  const [showPlanSelector, setShowPlanSelector] = useState(true);
  const [allowPause, setAllowPause] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (msg: string) =>
    setEventLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  return (
    <ComponentTestPage
      title="Subscription Manager Component"
      description="Full subscription management: view current subscriptions, upgrade/downgrade plans, pause, resume, and cancel."
      settings={{
        autoLoad: { type: 'boolean', value: autoLoad },
        showPlanSelector: { type: 'boolean', value: showPlanSelector },
        allowPause: { type: 'boolean', value: allowPause },
      }}
      onSettingChange={(key, value) => {
        if (key === 'autoLoad') setAutoLoad(value as boolean);
        if (key === 'showPlanSelector') setShowPlanSelector(value as boolean);
        if (key === 'allowPause') setAllowPause(value as boolean);
      }}
    >
      <SubscriptionManagerComponent
        autoLoad={autoLoad}
        showPlanSelector={showPlanSelector}
        allowPause={allowPause}
        onSubscriptionChange={(sub) => {
          log(`Subscription changed: ${sub.planName} (${sub.status})`);
          console.log('Subscription changed:', sub);
        }}
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
