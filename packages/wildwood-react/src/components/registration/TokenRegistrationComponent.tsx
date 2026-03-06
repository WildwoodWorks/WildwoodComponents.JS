import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticationResponse } from '@wildwood/core';
import { useWildwood } from '../../hooks/useWildwood.js';

export interface TokenRegistrationComponentProps {
  appId?: string;
  registrationToken?: string;
  onRegistrationSuccess?: (response: AuthenticationResponse) => void;
  onRegistrationError?: (error: string) => void;
  className?: string;
}

export function TokenRegistrationComponent({
  appId,
  registrationToken: initialToken,
  onRegistrationSuccess,
  onRegistrationError,
  className,
}: TokenRegistrationComponentProps) {
  const client = useWildwood();

  const [token, setToken] = useState(initialToken ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token.trim()) {
      setError('Registration token is required');
      return;
    }

    setIsLoading(true);
    try {
      const response = await client.auth.registerWithToken({
        registrationToken: token,
        firstName,
        lastName,
        email,
        password,
        appId: appId ?? '',
        platform: 'web',
        deviceInfo: navigator.userAgent,
      });

      setSuccess('Registration successful!');
      await client.session.login(response);
      onRegistrationSuccess?.(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      onRegistrationError?.(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, firstName, lastName, email, password, confirmPassword, appId, client, onRegistrationSuccess, onRegistrationError]);

  return (
    <div className={`ww-token-registration ${className ?? ''}`}>
      <div className="ww-auth-card">
        <div className="ww-auth-header">
          <h2>Register with Invitation</h2>
          {error && <div className="ww-alert ww-alert-danger">{error}</div>}
          {success && <div className="ww-alert ww-alert-success">{success}</div>}
        </div>

        <div className="ww-auth-body">
          <form onSubmit={handleSubmit}>
            {!initialToken && (
              <div className="ww-form-group">
                <label htmlFor="ww-reg-token">Registration Token</label>
                <input
                  id="ww-reg-token"
                  type="text"
                  className="ww-form-control"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="Enter your invitation token"
                />
              </div>
            )}

            <div className="ww-form-row">
              <div className="ww-form-group">
                <label htmlFor="ww-reg-first">First Name</label>
                <input
                  id="ww-reg-first"
                  type="text"
                  className="ww-form-control"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="ww-form-group">
                <label htmlFor="ww-reg-last">Last Name</label>
                <input
                  id="ww-reg-last"
                  type="text"
                  className="ww-form-control"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="ww-form-group">
              <label htmlFor="ww-reg-email">Email</label>
              <input
                id="ww-reg-email"
                type="email"
                className="ww-form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="ww-form-group">
              <label htmlFor="ww-reg-password">Password</label>
              <div className="ww-input-group">
                <input
                  id="ww-reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className="ww-form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="ww-btn-icon"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="ww-form-group">
              <label htmlFor="ww-reg-confirm">Confirm Password</label>
              <input
                id="ww-reg-confirm"
                type={showPassword ? 'text' : 'password'}
                className="ww-form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
