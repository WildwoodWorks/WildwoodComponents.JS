import { useAuth } from '@wildwood/react';

export function Home() {
  const { isAuthenticated, isInitialized, user } = useAuth();

  return (
    <div className="page">
      <h1>Wildwood Components Test Suite</h1>
      <p>React implementation of the Wildwood component library test harness.</p>

      <div className="status-card">
        <h3>Status</h3>
        <dl>
          <dt>SDK Initialized</dt>
          <dd>{isInitialized ? 'Yes' : 'No'}</dd>
          <dt>Authenticated</dt>
          <dd>{isAuthenticated ? 'Yes' : 'No'}</dd>
          {user && (
            <>
              <dt>User</dt>
              <dd>{user.firstName} {user.lastName} ({user.email})</dd>
            </>
          )}
        </dl>
      </div>

      <div className="status-card">
        <h3>Available Test Pages</h3>
        <ul>
          <li><strong>Authentication</strong> - Login, register, 2FA, password reset</li>
          <li><strong>Notifications</strong> - Toast notification queue</li>
          <li><strong>Theme</strong> - Theme switching and CSS variables</li>
        </ul>
      </div>
    </div>
  );
}
