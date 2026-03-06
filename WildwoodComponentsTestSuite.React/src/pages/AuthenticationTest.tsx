import { AuthenticationComponent } from '@wildwood/react';
import type { AuthenticationResponse } from '@wildwood/core';

export function AuthenticationTest() {
  const handleSuccess = (response: AuthenticationResponse) => {
    console.log('Authentication successful:', response);
  };

  const handleError = (error: string) => {
    console.error('Authentication error:', error);
  };

  return (
    <div className="page">
      <h1>Authentication Component</h1>
      <p>Tests login, registration, 2FA, password reset, and OAuth flows.</p>

      <div className="component-container">
        <AuthenticationComponent
          onAuthenticationSuccess={handleSuccess}
          onAuthenticationError={handleError}
        />
      </div>
    </div>
  );
}
