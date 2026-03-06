// AuthenticationComponent - ported from WildwoodComponents.Blazor AuthenticationComponent
// Multi-view auth: login, registration, 2FA, password reset, forgot password, disclaimers

import { useState, useCallback, useEffect } from 'react';
import type { FormEvent } from 'react';
import type {
  AuthenticationResponse,
  LoginRequest,
  AuthProvider,
  AuthenticationConfiguration,
  CaptchaConfiguration,
  TwoFactorMethodInfo,
} from '@wildwood/core';
import { useWildwood } from '../../hooks/useWildwood.js';

// Sanitize HTML by stripping dangerous tags/attributes while preserving safe content
function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Remove script, style, iframe, object, embed, form elements
  const dangerous = doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta');
  dangerous.forEach((el) => el.remove());
  // Remove event handler attributes from all elements
  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc' || attr.name === 'formaction') {
        el.removeAttribute(attr.name);
      }
      if (attr.name === 'href' || attr.name === 'src' || attr.name === 'action') {
        const val = attr.value.trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });
  return doc.body.innerHTML;
}

export interface AuthenticationComponentProps {
  appId?: string;
  title?: string;
  showPasswordField?: boolean;
  showDetailedErrors?: boolean;
  onAuthenticationSuccess?: (response: AuthenticationResponse) => void;
  onAuthenticationError?: (error: string) => void;
  className?: string;
}

type AuthView = 'login' | 'register' | 'twoFactor' | 'passwordReset' | 'forgotPassword' | 'disclaimers';

export function AuthenticationComponent({
  appId,
  title,
  showPasswordField = true,
  showDetailedErrors = true,
  onAuthenticationSuccess,
  onAuthenticationError,
  className,
}: AuthenticationComponentProps) {
  const client = useWildwood();

  // View state
  const [view, setView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Config
  const [authConfig, setAuthConfig] = useState<AuthenticationConfiguration | null>(null);
  const [_captchaConfig, setCaptchaConfig] = useState<CaptchaConfiguration | null>(null);
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // 2FA
  const [twoFactorSessionId, setTwoFactorSessionId] = useState('');
  const [twoFactorMethods, setTwoFactorMethods] = useState<TwoFactorMethodInfo[]>([]);
  const [selectedTwoFactorMethod, setSelectedTwoFactorMethod] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);

  // Password reset
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');

  // Pending auth response (stored between views)
  const [pendingAuth, setPendingAuth] = useState<AuthenticationResponse | null>(null);

  // Load configuration on mount
  useEffect(() => {
    if (!appId) return;
    const load = async () => {
      const [ac, cc, prov] = await Promise.all([
        client.auth.getAuthenticationConfiguration(appId),
        client.auth.getCaptchaConfiguration(appId),
        client.auth.getAvailableProviders(appId),
      ]);
      setAuthConfig(ac);
      setCaptchaConfig(cc);
      setProviders(prov);
    };
    load();
  }, [appId, client]);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    const displayMsg = showDetailedErrors ? msg : 'Authentication failed. Please try again.';
    setErrorMessage(displayMsg);
    onAuthenticationError?.(msg);
  };

  // Complete auth flow (called after all checks pass)
  const completeAuth = useCallback(
    async (response: AuthenticationResponse) => {
      await client.session.login(response);
      onAuthenticationSuccess?.(response);
    },
    [client, onAuthenticationSuccess],
  );

  // Process auth response, checking for 2FA/password reset/disclaimers
  const processAuthResponse = useCallback(
    async (response: AuthenticationResponse) => {
      if (response.requiresTwoFactor) {
        setPendingAuth(response);
        setTwoFactorSessionId(response.twoFactorSessionId ?? '');
        setTwoFactorMethods(response.availableTwoFactorMethods ?? []);
        setSelectedTwoFactorMethod(response.defaultTwoFactorMethod ?? '');
        setView('twoFactor');
        return;
      }

      if (response.requiresPasswordReset) {
        setPendingAuth(response);
        setView('passwordReset');
        return;
      }

      if (response.requiresDisclaimerAcceptance && response.pendingDisclaimers?.length) {
        setPendingAuth(response);
        setView('disclaimers');
        return;
      }

      await completeAuth(response);
    },
    [completeAuth],
  );

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const request: LoginRequest = {
        username,
        password,
        appId,
        rememberMe,
        platform: 'web',
        deviceInfo: navigator.userAgent,
      };

      const response = await client.auth.login(request);
      await processAuthResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Two-Factor
  // ---------------------------------------------------------------------------
  const handleTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const result = await client.auth.verifyTwoFactorCode({
        sessionId: twoFactorSessionId,
        code: twoFactorCode,
        providerType: selectedTwoFactorMethod,
        rememberDevice,
        deviceFingerprint: navigator.userAgent,
        deviceName: 'Web Browser',
      });

      if (result.success && result.authResponse) {
        await processAuthResponse(result.authResponse);
      } else {
        setErrorMessage(result.errorMessage ?? 'Verification failed');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const result = await client.auth.verifyTwoFactorRecoveryCode(twoFactorSessionId, recoveryCode, '');

      if (result.success && result.authResponse) {
        await processAuthResponse(result.authResponse);
      } else {
        setErrorMessage(result.errorMessage ?? 'Recovery code verification failed');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    clearMessages();
    setIsLoading(true);
    try {
      const result = await client.auth.sendTwoFactorCode(twoFactorSessionId);
      if (result.success) {
        setSuccessMessage(`Code sent to ${result.maskedDestination ?? 'your device'}`);
      } else {
        setErrorMessage(result.errorMessage ?? 'Failed to resend code');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Password Reset (forced after login)
  // ---------------------------------------------------------------------------
  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await client.auth.resetPassword(newPassword, confirmPassword, appId ?? '');
      setSuccessMessage('Password updated successfully');

      if (pendingAuth) {
        // Re-login with new password
        const response = await client.auth.login({
          username: pendingAuth.email,
          password: newPassword,
          appId,
          platform: 'web',
          deviceInfo: navigator.userAgent,
        });
        await processAuthResponse(response);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Forgot Password
  // ---------------------------------------------------------------------------
  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      await client.auth.requestPasswordReset(forgotEmail, appId ?? '');
      setSuccessMessage('If an account exists with that email, a password reset link has been sent.');
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const resolveTitle = () => {
    if (title) return title;
    switch (view) {
      case 'login':
        return 'Sign In';
      case 'register':
        return 'Create Account';
      case 'twoFactor':
        return 'Two-Factor Verification';
      case 'passwordReset':
        return 'Reset Password';
      case 'forgotPassword':
        return 'Forgot Password';
      case 'disclaimers':
        return 'Terms & Conditions';
      default:
        return 'Sign In';
    }
  };

  return (
    <div className={`ww-authentication-component ${className ?? ''}`}>
      <div className="ww-auth-card">
        <div className="ww-auth-header">
          <h2>{resolveTitle()}</h2>
          {errorMessage && <div className="ww-alert ww-alert-danger">{errorMessage}</div>}
          {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}
        </div>

        <div className="ww-auth-body">
          {/* LOGIN VIEW */}
          {view === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="ww-form-group">
                <label htmlFor="ww-username">Username or Email</label>
                <input
                  id="ww-username"
                  type="text"
                  className="ww-form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>

              {showPasswordField && (
                <div className="ww-form-group">
                  <label htmlFor="ww-password">Password</label>
                  <div className="ww-input-group">
                    <input
                      id="ww-password"
                      type={showPassword ? 'text' : 'password'}
                      className="ww-form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
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
              )}

              <div className="ww-form-group ww-form-check">
                <label>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />{' '}
                  Remember me
                </label>
              </div>

              <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>

              {/* Social/OAuth providers */}
              {providers.length > 0 && (
                <div className="ww-social-auth-providers">
                  <div className="ww-divider">
                    <span>or continue with</span>
                  </div>
                  {providers.map((provider) => (
                    <button
                      key={provider.name}
                      type="button"
                      className="ww-btn ww-btn-outline ww-btn-block ww-btn-social"
                      disabled={isLoading}
                      onClick={() => {
                        setErrorMessage(`OAuth login with ${provider.displayName} is not yet available.`);
                      }}
                    >
                      {provider.icon && <span className={provider.icon} />}
                      {provider.displayName}
                    </button>
                  ))}
                </div>
              )}

              <div className="ww-auth-footer">
                {authConfig?.allowPasswordReset && (
                  <button
                    type="button"
                    className="ww-btn-link"
                    onClick={() => {
                      clearMessages();
                      setView('forgotPassword');
                    }}
                  >
                    Forgot password?
                  </button>
                )}
                {(authConfig?.allowOpenRegistration || authConfig?.allowTokenRegistration) && (
                  <button
                    type="button"
                    className="ww-btn-link"
                    onClick={() => {
                      clearMessages();
                      setView('register');
                    }}
                  >
                    Don't have an account? Sign up
                  </button>
                )}
              </div>
            </form>
          )}

          {/* REGISTRATION VIEW */}
          {view === 'register' && (
            <div className="ww-register-section">
              <p className="ww-text-muted">
                Use the <code>TokenRegistrationComponent</code> for invitation-based registration, or contact your
                administrator for account access.
              </p>
              <div className="ww-auth-footer">
                <button
                  type="button"
                  className="ww-btn-link"
                  onClick={() => {
                    clearMessages();
                    setView('login');
                  }}
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          )}

          {/* TWO-FACTOR VIEW */}
          {view === 'twoFactor' && (
            <div className="ww-two-factor-section">
              {/* Method selector */}
              {twoFactorMethods.length > 1 && (
                <div className="ww-twofa-methods">
                  {twoFactorMethods.map((method) => (
                    <button
                      key={method.providerType}
                      type="button"
                      className={`ww-btn ww-btn-outline ${selectedTwoFactorMethod === method.providerType ? 'ww-active' : ''}`}
                      onClick={() => {
                        setSelectedTwoFactorMethod(method.providerType);
                        setShowRecoveryInput(false);
                      }}
                    >
                      {method.icon && <span className={method.icon} />}
                      {method.name}
                    </button>
                  ))}
                </div>
              )}

              {!showRecoveryInput ? (
                <form onSubmit={handleTwoFactorSubmit}>
                  <div className="ww-form-group">
                    <label htmlFor="ww-2fa-code">Verification Code</label>
                    <input
                      id="ww-2fa-code"
                      type="text"
                      className="ww-form-control ww-code-input"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="ww-form-group ww-form-check">
                    <label>
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                      />{' '}
                      Trust this device for 30 days
                    </label>
                  </div>

                  <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </button>

                  {selectedTwoFactorMethod.toLowerCase().includes('email') && (
                    <button type="button" className="ww-btn-link" onClick={handleResendCode} disabled={isLoading}>
                      Resend code
                    </button>
                  )}
                </form>
              ) : (
                <form onSubmit={handleRecoverySubmit}>
                  <div className="ww-form-group">
                    <label htmlFor="ww-recovery-code">Recovery Code</label>
                    <input
                      id="ww-recovery-code"
                      type="text"
                      className="ww-form-control"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      maxLength={14}
                      placeholder="XXXX-XXXX-XXXX"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'Verify Recovery Code'}
                  </button>
                </form>
              )}

              <div className="ww-auth-footer">
                <button type="button" className="ww-btn-link" onClick={() => setShowRecoveryInput(!showRecoveryInput)}>
                  {showRecoveryInput ? 'Use verification code' : 'Use recovery code'}
                </button>
                <button
                  type="button"
                  className="ww-btn-link"
                  onClick={() => {
                    clearMessages();
                    setView('login');
                    setTwoFactorCode('');
                    setRecoveryCode('');
                  }}
                >
                  Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* PASSWORD RESET VIEW (forced) */}
          {view === 'passwordReset' && (
            <form onSubmit={handlePasswordReset} className="ww-password-reset-section">
              <p className="ww-text-muted">You must set a new password before continuing.</p>

              <div className="ww-form-group">
                <label htmlFor="ww-new-password">New Password</label>
                <div className="ww-input-group">
                  <input
                    id="ww-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    className="ww-form-control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="ww-btn-icon"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-confirm-password">Confirm Password</label>
                <div className="ww-input-group">
                  <input
                    id="ww-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="ww-form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="ww-btn-icon"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {authConfig && (
                <p className="ww-text-muted ww-password-requirements">
                  {client.auth.getPasswordRequirementsText(authConfig)}
                </p>
              )}

              <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Set New Password'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {view === 'forgotPassword' && (
            <form onSubmit={handleForgotPasswordSubmit} className="ww-forgot-password-section">
              <p className="ww-text-muted">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <div className="ww-form-group">
                <label htmlFor="ww-forgot-email">Email Address</label>
                <input
                  id="ww-forgot-email"
                  type="email"
                  className="ww-form-control"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="ww-auth-footer">
                <button
                  type="button"
                  className="ww-btn-link"
                  onClick={() => {
                    clearMessages();
                    setView('login');
                  }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* DISCLAIMERS VIEW */}
          {view === 'disclaimers' && pendingAuth?.pendingDisclaimers && (
            <div className="ww-disclaimers-section">
              <p className="ww-text-muted">Please review and accept the following before continuing.</p>
              {pendingAuth.pendingDisclaimers.map((d) => (
                <div key={d.disclaimerId} className="ww-disclaimer-item">
                  <h4>{d.title}</h4>
                  <div
                    className="ww-disclaimer-content"
                    dangerouslySetInnerHTML={
                      d.contentFormat === 'html' ? { __html: sanitizeHtml(d.content) } : undefined
                    }
                  >
                    {d.contentFormat !== 'html' ? d.content : undefined}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="ww-btn ww-btn-primary ww-btn-block"
                disabled={isLoading}
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await client.disclaimer.acceptAllDisclaimers(
                      pendingAuth.pendingDisclaimers!.map((d) => ({
                        disclaimerId: d.disclaimerId,
                        versionId: d.versionId,
                      })),
                    );
                    if (pendingAuth) await completeAuth(pendingAuth);
                  } catch (err) {
                    handleError(err);
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? 'Accepting...' : 'Accept & Continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
