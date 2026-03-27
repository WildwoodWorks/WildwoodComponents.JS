import { useState } from 'react';
import { UsageDashboardComponent, OverageSummaryComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function UsageDashboardTest() {
  const [showOverageInfo, setShowOverageInfo] = useState(true);
  const [warningThreshold, setWarningThreshold] = useState(75);
  const [overageRate, setOverageRate] = useState(0.003);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'overage'>('dashboard');
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (msg: string) =>
    setEventLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  return (
    <ComponentTestPage
      title="Usage Dashboard & Overage Summary"
      description="View usage limits, progress bars, overage charges, and upgrade prompts."
      settings={{
        showOverageInfo: { type: 'boolean', value: showOverageInfo },
        warningThreshold: { type: 'text', value: String(warningThreshold) },
        overageRate: { type: 'text', value: String(overageRate) },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showOverageInfo') setShowOverageInfo(value as boolean);
        if (key === 'warningThreshold') setWarningThreshold(Number(value) || 80);
        if (key === 'overageRate') setOverageRate(Number(value) || 0.003);
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['dashboard', 'overage'] as const).map((section) => (
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
            {section === 'dashboard' && 'Usage Dashboard'}
            {section === 'overage' && 'Overage Summary'}
          </button>
        ))}
      </div>

      {activeSection === 'dashboard' && (
        <UsageDashboardComponent
          showOverageInfo={showOverageInfo}
          warningThreshold={warningThreshold}
          onUpgradeClick={() => {
            log('Upgrade clicked');
            console.log('Upgrade clicked');
          }}
        />
      )}

      {activeSection === 'overage' && (
        <OverageSummaryComponent
          overageRate={overageRate}
          onViewDetails={() => {
            log('View overage details clicked');
            console.log('View overage details');
          }}
        />
      )}

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
