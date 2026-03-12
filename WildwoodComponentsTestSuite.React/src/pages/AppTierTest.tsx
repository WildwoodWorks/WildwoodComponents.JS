import { useState } from 'react';
import {
  AppTierComponent,
  UsageDashboardComponent,
  OverageSummaryComponent,
  SignupWithSubscriptionComponent,
} from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AppTierTest() {
  const [autoLoad, setAutoLoad] = useState(true);
  const [lastTierId, setLastTierId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'tiers' | 'usage' | 'overage' | 'signup'>('tiers');

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['tiers', 'usage', 'overage', 'signup'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--ww-border, #ccc)',
              background: activeSection === section ? 'var(--ww-primary, #3182ce)' : 'transparent',
              color: activeSection === section ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {section === 'tiers' && 'App Tier'}
            {section === 'usage' && 'Usage Dashboard'}
            {section === 'overage' && 'Overage Summary'}
            {section === 'signup' && 'Signup + Subscribe'}
          </button>
        ))}
      </div>

      {activeSection === 'tiers' && (
        <>
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
        </>
      )}

      {activeSection === 'usage' && (
        <UsageDashboardComponent
          showOverageInfo={true}
          warningThreshold={75}
          onUpgradeClick={() => {
            setActiveSection('tiers');
          }}
        />
      )}

      {activeSection === 'overage' && (
        <OverageSummaryComponent overageRate={0.003} onViewDetails={() => console.log('View overage details')} />
      )}

      {activeSection === 'signup' && (
        <SignupWithSubscriptionComponent
          requireToken={false}
          allowOpenRegistration={true}
          onComplete={() => {
            console.log('Signup + subscribe complete');
            setActiveSection('tiers');
          }}
          onCancel={() => setActiveSection('tiers')}
        />
      )}
    </ComponentTestPage>
  );
}
