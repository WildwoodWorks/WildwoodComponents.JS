import { useState } from 'react';
import { TwoFactorSettingsComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function TwoFactorTest() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);

  return (
    <ComponentTestPage
      title="Two-Factor Settings"
      description="Manage 2FA enrollment, recovery codes, and trusted devices."
    >
      <TwoFactorSettingsComponent
        onStatusChange={(enabled) => {
          setTwoFactorEnabled(enabled);
          console.log('2FA status changed:', enabled);
        }}
      />

      {twoFactorEnabled !== null && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>2FA Status</h3>
          <p>Two-factor authentication is <strong>{twoFactorEnabled ? 'enabled' : 'disabled'}</strong>.</p>
        </div>
      )}
    </ComponentTestPage>
  );
}
