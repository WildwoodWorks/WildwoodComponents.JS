import { useState } from 'react';
import { TokenRegistrationComponent } from '@wildwood/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function TokenRegistrationTest() {
  const [registrationToken, setRegistrationToken] = useState('');
  const [lastResponse, setLastResponse] = useState<AuthenticationResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <ComponentTestPage
      title="Token Registration"
      description="Register a new account using an invitation token."
      settings={{
        registrationToken: { type: 'text', value: registrationToken },
      }}
      onSettingChange={(key, value) => {
        if (key === 'registrationToken') setRegistrationToken(value as string);
      }}
    >
      <TokenRegistrationComponent
        appId={import.meta.env.VITE_APP_ID || ''}
        registrationToken={registrationToken || undefined}
        onRegistrationSuccess={(resp) => {
          setLastResponse(resp);
          setLastError(null);
          console.log('Registration success:', resp);
        }}
        onRegistrationError={(err) => {
          setLastError(err);
          console.error('Registration error:', err);
        }}
      />

      {lastResponse && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Registration Successful</h3>
          <dl>
            <dt>Email</dt>
            <dd>{lastResponse.email}</dd>
            <dt>Name</dt>
            <dd>{lastResponse.firstName} {lastResponse.lastName}</dd>
          </dl>
        </div>
      )}

      {lastError && (
        <div className="ww-alert ww-alert-danger" style={{ marginTop: 16 }}>
          {lastError}
        </div>
      )}
    </ComponentTestPage>
  );
}
