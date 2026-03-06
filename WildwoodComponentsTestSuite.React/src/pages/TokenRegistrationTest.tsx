import { TokenRegistrationComponent } from '@wildwood/react';

export function TokenRegistrationTest() {
  return (
    <div className="page">
      <h1>Token Registration</h1>
      <p>Register a new account using an invitation token.</p>

      <TokenRegistrationComponent
        appId="d6e61c7a-eec5-4164-a004-9b99eb5eb6de"
        onRegistrationSuccess={(resp) => console.log('Registration success:', resp)}
        onRegistrationError={(err) => console.error('Registration error:', err)}
      />
    </div>
  );
}
