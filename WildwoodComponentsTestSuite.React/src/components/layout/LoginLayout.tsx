import type { ReactNode } from 'react';

export interface LoginLayoutProps {
  children: ReactNode;
}

/**
 * Minimal layout for login/registration pages - no sidebar navigation.
 */
export function LoginLayout({ children }: LoginLayoutProps) {
  return (
    <div className="login-layout">
      <div className="login-container">
        <div className="login-header">
          <h1>Wildwood Test Suite</h1>
          <span className="login-subtitle">React</span>
        </div>
        <div className="login-content">
          {children}
        </div>
      </div>
    </div>
  );
}
