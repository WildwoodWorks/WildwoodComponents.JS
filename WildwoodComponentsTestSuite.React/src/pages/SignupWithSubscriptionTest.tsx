import { useState } from 'react';
import { SignupWithSubscriptionComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function SignupWithSubscriptionTest() {
  const [appId, setAppId] = useState('');
  const [preSelectedTierId, setPreSelectedTierId] = useState('');
  const [requireToken, setRequireToken] = useState(false);
  const [allowOpenRegistration, setAllowOpenRegistration] = useState(true);
  const [skipTierSelection, setSkipTierSelection] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (msg: string) =>
    setEventLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  return (
    <ComponentTestPage
      title="Signup With Subscription Component"
      description="Combined registration and subscription flow: create account, choose plan, and optionally pay."
      settings={{
        appId: { type: 'text', value: appId },
        preSelectedTierId: { type: 'text', value: preSelectedTierId },
        requireToken: { type: 'boolean', value: requireToken },
        allowOpenRegistration: { type: 'boolean', value: allowOpenRegistration },
        skipTierSelection: { type: 'boolean', value: skipTierSelection },
      }}
      onSettingChange={(key, value) => {
        if (key === 'appId') setAppId(value as string);
        if (key === 'preSelectedTierId') setPreSelectedTierId(value as string);
        if (key === 'requireToken') setRequireToken(value as boolean);
        if (key === 'allowOpenRegistration') setAllowOpenRegistration(value as boolean);
        if (key === 'skipTierSelection') setSkipTierSelection(value as boolean);
      }}
    >
      <SignupWithSubscriptionComponent
        appId={appId || undefined}
        preSelectedTierId={preSelectedTierId || undefined}
        requireToken={requireToken}
        allowOpenRegistration={allowOpenRegistration}
        skipTierSelection={skipTierSelection}
        onComplete={() => {
          log('Signup + subscription complete');
          console.log('Signup + subscription complete');
        }}
        onCancel={() => {
          log('Signup cancelled');
          console.log('Signup cancelled');
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
