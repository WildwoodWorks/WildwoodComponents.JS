import { TwoFactorSettingsComponent } from '@wildwood/react';

export function TwoFactorTest() {
  return (
    <div className="page">
      <h1>Two-Factor Settings</h1>
      <p>Manage 2FA enrollment, recovery codes, and trusted devices.</p>

      <TwoFactorSettingsComponent
        onStatusChange={(enabled) => console.log('2FA status changed:', enabled)}
      />
    </div>
  );
}
