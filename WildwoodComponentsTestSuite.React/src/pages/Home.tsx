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
          <li><strong>Authentication</strong> — Login, register, 2FA, password reset, OAuth</li>
          <li><strong>Notifications</strong> — Toast notification queue</li>
          <li><strong>Theme</strong> — Theme switching and CSS variables</li>
          <li><strong>Two-Factor</strong> — 2FA enrollment, recovery codes, trusted devices</li>
          <li><strong>Token Registration</strong> — Invitation-based registration</li>
          <li><strong>Disclaimer</strong> — Pending disclaimers and acceptance</li>
          <li><strong>App Tier</strong> — Tier comparison and selection</li>
          <li><strong>AI Chat</strong> — Chat sessions, messages, TTS</li>
          <li><strong>AI Flow</strong> — Workflow definitions and execution</li>
          <li><strong>Messaging</strong> — Threads, reactions, typing indicators</li>
          <li><strong>Payment</strong> — Payment methods and processing</li>
          <li><strong>Subscription</strong> — Plan browsing and lifecycle</li>
        </ul>
      </div>
    </div>
  );
}
