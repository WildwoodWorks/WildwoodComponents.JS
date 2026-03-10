// AuthenticationComponent - ported from WildwoodComponents.Blazor AuthenticationComponent
// Multi-view auth: login, registration, 2FA, password reset, forgot password, disclaimers

import { useState, useCallback, useEffect } from 'react';
import type { FormEvent } from 'react';
import type {
  AuthenticationResponse,
  LoginRequest,
  RegistrationRequest,
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
  const dangerous = doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta');
  dangerous.forEach((el) => el.remove());
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
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaConfiguration | null>(null);
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Registration form
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

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
        client.auth.getAuthenticationConfiguration(appId).catch(() => null),
        client.auth.getCaptchaConfiguration(appId).catch(() => null),
        client.auth.getAvailableProviders(appId).catch(() => []),
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
  // Registration
  // ---------------------------------------------------------------------------
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const request: RegistrationRequest = {
        firstName: regFirstName,
        lastName: regLastName,
        email: regEmail,
        username: regEmail,
        password: regPassword,
        appId: appId ?? '',
        platform: 'web',
        deviceInfo: navigator.userAgent,
      };

      const response = await client.auth.register(request);
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
      setSuccessMessage('If an account exists with that email, a temporary password has been sent.');
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------
  const toggleMode = () => {
    clearMessages();
    setView(view === 'login' ? 'register' : 'login');
  };

  const resolveTitle = () => {
    if (title) return title;
    switch (view) {
      case 'login':
        return 'Sign In';
      case 'register':
        return 'Create Account';
      case 'twoFactor':
        return 'Two-Factor Authentication';
      case 'passwordReset':
        return 'Reset Password';
      case 'forgotPassword':
        return 'Forgot Password';
      case 'disclaimers':
        return 'Accept Disclaimers';
      default:
        return 'Sign In';
    }
  };

  // Check if registration is allowed (config-driven or fallback to always allowed when no config)
  const allowRegistration = authConfig ? authConfig.allowOpenRegistration || authConfig.allowTokenRegistration : true;

  const allowPasswordReset = authConfig?.allowPasswordReset ?? true;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className={`ww-authentication-component ${className ?? ''}`}>
      <div className="ww-auth-card">
        {/* Header */}
        <div className="ww-auth-header">
          <h2 className="ww-auth-title">{resolveTitle()}</h2>
          {errorMessage && <div className="ww-alert ww-alert-danger">{errorMessage}</div>}
          {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}
        </div>

        <div className="ww-auth-body">
          {/* Loading overlay */}
          {isLoading && (
            <div className="ww-loading-overlay">
              <div className="ww-spinner ww-auth-spinner" />
              <span className="ww-loading-message">Processing...</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* LOGIN VIEW                                                    */}
          {/* ============================================================ */}
          {view === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="ww-form-group">
                <label htmlFor="ww-username">Username</label>
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
                  <div className="ww-password-input-container">
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
                      className="ww-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? '\u{1F441}\u{FE0F}' : '\u{1F441}'}
                    </button>
                  </div>
                </div>
              )}

              <div className="ww-form-group ww-form-check">
                <input
                  type="checkbox"
                  id="ww-remember"
                  className="ww-form-check-input"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label className="ww-form-check-label" htmlFor="ww-remember">
                  Remember me
                </label>
              </div>

              <div className="ww-form-group">
                <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>

              {/* Social/OAuth providers */}
              {providers.length > 0 && (
                <div className="ww-social-auth-providers">
                  <div className="ww-auth-divider">
                    <span>or</span>
                  </div>
                  {providers.map((provider) => (
                    <button
                      key={provider.name}
                      type="button"
                      className="ww-social-btn"
                      disabled={isLoading}
                      onClick={() => {
                        setErrorMessage(`OAuth login with ${provider.displayName} is not yet available.`);
                      }}
                    >
                      {provider.icon && <i className={provider.icon} />}
                      Sign in with {provider.displayName}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}

          {/* ============================================================ */}
          {/* REGISTRATION VIEW                                             */}
          {/* ============================================================ */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="ww-register-section">
              <div className="ww-form-row">
                <div className="ww-form-group">
                  <label htmlFor="ww-reg-first">First Name</label>
                  <input
                    id="ww-reg-first"
                    type="text"
                    className="ww-form-control"
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    required
                    maxLength={50}
                    disabled={isLoading}
                  />
                </div>
                <div className="ww-form-group">
                  <label htmlFor="ww-reg-last">Last Name</label>
                  <input
                    id="ww-reg-last"
                    type="text"
                    className="ww-form-control"
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    required
                    maxLength={50}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-reg-email">Email Address</label>
                <input
                  id="ww-reg-email"
                  type="email"
                  className="ww-form-control"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-reg-password">Password</label>
                <div className="ww-password-input-container">
                  <input
                    id="ww-reg-password"
                    type={showRegPassword ? 'text' : 'password'}
                    className="ww-form-control"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="ww-password-toggle"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    tabIndex={-1}
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? '\u{1F441}\u{FE0F}' : '\u{1F441}'}
                  </button>
                </div>
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-reg-confirm">Confirm Password</label>
                <input
                  id="ww-reg-confirm"
                  type={showRegPassword ? 'text' : 'password'}
                  className="ww-form-control"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              <div className="ww-form-group">
                <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* TWO-FACTOR VIEW                                               */}
          {/* ============================================================ */}
          {view === 'twoFactor' && (
            <div className="ww-two-factor-section">
              <div className="ww-section-header">
                <div className="ww-section-icon ww-icon-shield" />
                <h3>Verify Your Identity</h3>
                <p className="ww-text-muted">
                  {selectedTwoFactorMethod.toLowerCase().includes('email')
                    ? "We've sent a verification code to your email address."
                    : 'Enter the 6-digit code from your authenticator app.'}
                </p>
              </div>

              {/* Method selector */}
              {twoFactorMethods.length > 1 && (
                <div className="ww-two-factor-methods">
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
                      {method.icon && <i className={method.icon} />}
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
                      className="ww-form-control ww-verification-code-input"
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
                    <input
                      type="checkbox"
                      id="ww-remember-device"
                      className="ww-form-check-input"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <label className="ww-form-check-label" htmlFor="ww-remember-device">
                      Trust this device for 30 days
                    </label>
                  </div>

                  <div className="ww-form-group">
                    <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                      {isLoading ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>

                  {selectedTwoFactorMethod.toLowerCase().includes('email') && (
                    <div className="ww-resend-code-section">
                      <button type="button" className="ww-btn-link" onClick={handleResendCode} disabled={isLoading}>
                        Resend code
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <form onSubmit={handleRecoverySubmit}>
                  <div className="ww-form-group">
                    <label htmlFor="ww-recovery-code">Recovery Code</label>
                    <input
                      id="ww-recovery-code"
                      type="text"
                      className="ww-form-control ww-recovery-code-input"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      maxLength={14}
                      placeholder="XXXX-XXXX-XXXX"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="ww-form-group">
                    <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                      {isLoading ? 'Verifying...' : 'Verify Recovery Code'}
                    </button>
                  </div>
                </form>
              )}

              <div className="ww-auth-footer">
                <button type="button" className="ww-btn-link" onClick={() => setShowRecoveryInput(!showRecoveryInput)}>
                  {showRecoveryInput ? 'Use verification code' : 'Use a recovery code instead'}
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
                  Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* PASSWORD RESET VIEW (forced)                                  */}
          {/* ============================================================ */}
          {view === 'passwordReset' && (
            <form onSubmit={handlePasswordReset} className="ww-password-reset-section">
              <div className="ww-section-header">
                <div className="ww-section-icon ww-icon-key" />
                <h3>Password Reset Required</h3>
                <p className="ww-text-muted">
                  You logged in with a temporary password. Please create a new password to continue.
                </p>
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-new-password">New Password</label>
                <div className="ww-password-input-container">
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
                    className="ww-password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? '\u{1F441}\u{FE0F}' : '\u{1F441}'}
                  </button>
                </div>
              </div>

              <div className="ww-form-group">
                <label htmlFor="ww-confirm-password">Confirm New Password</label>
                <div className="ww-password-input-container">
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
                    className="ww-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? '\u{1F441}\u{FE0F}' : '\u{1F441}'}
                  </button>
                </div>
              </div>

              {authConfig && (
                <div className="ww-password-requirements">
                  <small className="ww-text-muted">{client.auth.getPasswordRequirementsText(authConfig)}</small>
                </div>
              )}

              <div className="ww-form-group">
                <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                  {isLoading ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* FORGOT PASSWORD VIEW                                          */}
          {/* ============================================================ */}
          {view === 'forgotPassword' && (
            <form onSubmit={handleForgotPasswordSubmit} className="ww-forgot-password-section">
              <div className="ww-section-header">
                <div className="ww-section-icon ww-icon-envelope" />
                <h3>Reset Your Password</h3>
                <p className="ww-text-muted">Enter your email address and we'll send you a temporary password.</p>
              </div>

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

              <div className="ww-form-group">
                <button type="submit" className="ww-btn ww-btn-primary ww-btn-block" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Email'}
                </button>
              </div>

              <div className="ww-auth-footer">
                <button
                  type="button"
                  className="ww-btn-link"
                  onClick={() => {
                    clearMessages();
                    setView('login');
                  }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* DISCLAIMERS VIEW                                              */}
          {/* ============================================================ */}
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
              <div className="ww-form-group">
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
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* FOOTER                                                        */}
        {/* ============================================================ */}
        {(view === 'login' || view === 'register') && (
          <div className="ww-auth-footer">
            {view === 'login' && (
              <>
                {allowRegistration && (
                  <p>
                    Don't have an account?{' '}
                    <button type="button" className="ww-btn-link" onClick={toggleMode}>
                      Sign up
                    </button>
                  </p>
                )}
                {allowPasswordReset && (
                  <p>
                    <button
                      type="button"
                      className="ww-btn-link"
                      onClick={() => {
                        clearMessages();
                        setView('forgotPassword');
                      }}
                    >
                      Forgot your password?
                    </button>
                  </p>
                )}
              </>
            )}
            {view === 'register' && (
              <p>
                Already have an account?{' '}
                <button type="button" className="ww-btn-link" onClick={toggleMode}>
                  Sign in
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
