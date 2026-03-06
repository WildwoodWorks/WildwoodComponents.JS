import { useState } from 'react';
import { AppTierComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AppTierTest() {
  const [autoLoad, setAutoLoad] = useState(true);
  const [lastTierId, setLastTierId] = useState<string | null>(null);

  return (
    <ComponentTestPage
      title="App Tier Component"
      description="Browse tiers, view current subscription, compare features, and change plans."
      settings={{
        autoLoad: { type: 'boolean', value: autoLoad },
      }}
      onSettingChange={(key, value) => {
        if (key === 'autoLoad') setAutoLoad(value as boolean);
      }}
    >
      <AppTierComponent
        autoLoad={autoLoad}
        onTierChanged={(tierId) => {
          setLastTierId(tierId);
          console.log('Tier changed to:', tierId);
        }}
      />

      {lastTierId && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Tier Changed</h3>
          <dl>
            <dt>New Tier ID</dt>
            <dd style={{ fontSize: 12 }}>{lastTierId}</dd>
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
