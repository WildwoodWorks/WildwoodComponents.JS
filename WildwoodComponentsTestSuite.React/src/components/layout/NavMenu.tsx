import { NavLink } from 'react-router-dom';
import { useAuth } from '@wildwood/react';

export function NavMenu() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <nav className="nav-menu">
      <div className="nav-header">
        <h2>Wildwood Test Suite</h2>
        <span className="nav-subtitle">React</span>
      </div>

      {isAuthenticated && user && (
        <div className="nav-user">
          <span className="nav-user-name">
            {user.firstName} {user.lastName}
          </span>
          <button className="nav-logout" onClick={() => logout()}>
            Logout
          </button>
        </div>
      )}

      <ul className="nav-links">
        <li>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Home
          </NavLink>
        </li>
        <li className="nav-section">Auth & Identity</li>
        <li>
          <NavLink to="/authentication" className={({ isActive }) => (isActive ? 'active' : '')}>
            Authentication
          </NavLink>
        </li>
        <li>
          <NavLink to="/token-registration" className={({ isActive }) => (isActive ? 'active' : '')}>
            Token Registration
          </NavLink>
        </li>
        <li>
          <NavLink to="/twofactor" className={({ isActive }) => (isActive ? 'active' : '')}>
            Two-Factor Settings
          </NavLink>
        </li>
        <li className="nav-section">AI & Messaging</li>
        <li>
          <NavLink to="/ai-chat" className={({ isActive }) => (isActive ? 'active' : '')}>
            AI Chat
          </NavLink>
        </li>
        <li>
          <NavLink to="/ai-flow" className={({ isActive }) => (isActive ? 'active' : '')}>
            AI Flow
          </NavLink>
        </li>
        <li>
          <NavLink to="/messaging" className={({ isActive }) => (isActive ? 'active' : '')}>
            Secure Messaging
          </NavLink>
        </li>
        <li className="nav-section">Billing</li>
        <li>
          <NavLink to="/payment" className={({ isActive }) => (isActive ? 'active' : '')}>
            Payment
          </NavLink>
        </li>
        <li>
          <NavLink to="/subscription" className={({ isActive }) => (isActive ? 'active' : '')}>
            Subscription
          </NavLink>
        </li>
        <li>
          <NavLink to="/app-tier" className={({ isActive }) => (isActive ? 'active' : '')}>
            App Tier
          </NavLink>
        </li>
        <li>
          <NavLink to="/pricing-display" className={({ isActive }) => (isActive ? 'active' : '')}>
            Pricing Display
          </NavLink>
        </li>
        <li>
          <NavLink to="/subscription-admin" className={({ isActive }) => (isActive ? 'active' : '')}>
            Subscription Admin
          </NavLink>
        </li>
        <li className="nav-section">Other</li>
        <li>
          <NavLink to="/disclaimer" className={({ isActive }) => (isActive ? 'active' : '')}>
            Disclaimer
          </NavLink>
        </li>
        <li>
          <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
            Notifications
          </NavLink>
        </li>
        <li>
          <NavLink to="/theme" className={({ isActive }) => (isActive ? 'active' : '')}>
            Theme
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
