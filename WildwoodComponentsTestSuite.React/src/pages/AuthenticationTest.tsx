import { useState } from 'react';
import { AuthenticationComponent } from '@wildwood/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AuthenticationTest() {
  const [showPasswordField, setShowPasswordField] = useState(true);
  const [showDetailedErrors, setShowDetailedErrors] = useState(false);
  const [title, setTitle] = useState('Sign In');
  const [lastResponse, setLastResponse] = useState<AuthenticationResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleSuccess = (response: AuthenticationResponse) => {
    setLastResponse(response);
    setLastError(null);
    console.log('Authentication successful:', response);
  };

  const handleError = (error: string) => {
    setLastError(error);
    console.error('Authentication error:', error);
  };

  return (
    <ComponentTestPage
      title="Authentication Component"
      description="Tests login, registration, 2FA, password reset, and OAuth flows."
      settings={{
        title: { type: 'text', value: title },
        showPasswordField: { type: 'boolean', value: showPasswordField },
        showDetailedErrors: { type: 'boolean', value: showDetailedErrors },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showPasswordField') setShowPasswordField(value as boolean);
        if (key === 'showDetailedErrors') setShowDetailedErrors(value as boolean);
        if (key === 'title') setTitle(value as string);
      }}
    >
      <AuthenticationComponent
        title={title}
        showPasswordField={showPasswordField}
        showDetailedErrors={showDetailedErrors}
        onAuthenticationSuccess={handleSuccess}
        onAuthenticationError={handleError}
      />

      {lastResponse && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Last Successful Response</h3>
          <dl>
            <dt>Email</dt>
            <dd>{lastResponse.email}</dd>
            <dt>Name</dt>
            <dd>{lastResponse.firstName} {lastResponse.lastName}</dd>
            <dt>Token</dt>
            <dd style={{ wordBreak: 'break-all', fontSize: 12 }}>
              {lastResponse.jwtToken?.substring(0, 40)}...
            </dd>
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
