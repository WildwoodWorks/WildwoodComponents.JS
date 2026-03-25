// AuthenticationComponent - ported from WildwoodComponents.Blazor AuthenticationComponent
// Multi-view auth: login, registration, 2FA, password reset, forgot password, disclaimers

import type { FormEvent } from 'react';
import type { AuthenticationResponse } from '@wildwood/core';
import { openOAuthPopup, isPopupSupported } from '@wildwood/core';
import { useAuthenticationLogic } from '@wildwood/react-shared';

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

export function AuthenticationComponent({
  appId,
  title,
  showPasswordField = true,
  showDetailedErrors = true,
  onAuthenticationSuccess,
  onAuthenticationError,
  className,
}: AuthenticationComponentProps) {
  const {
    // State
    view,
    setView,
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    successMessage,

    // Config
    authConfig,
    providers,

    // Login form
    username,
    setUsername,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,

    // Registration form
    regFirstName,
    setRegFirstName,
    regLastName,
    setRegLastName,
    regUsername,
    setRegUsername,
    regEmail,
    setRegEmail,
    regPassword,
    setRegPassword,
    regConfirmPassword,
    setRegConfirmPassword,
    showRegPassword,
    setShowRegPassword,

    // 2FA
    twoFactorMethods,
    selectedTwoFactorMethod,
    setSelectedTwoFactorMethod,
    twoFactorCode,
    setTwoFactorCode,
    showRecoveryInput,
    setShowRecoveryInput,
    recoveryCode,
    setRecoveryCode,
    rememberDevice,
    setRememberDevice,

    // Password reset
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showNewPassword,
    setShowNewPassword,
    showConfirmPassword,
    setShowConfirmPassword,

    // Forgot password
    forgotEmail,
    setForgotEmail,

    // Pending auth
    pendingAuth,

    // Handlers
    clearMessages,
    handleError,
    completeAuth,
    processAuthResponse,
    handleLogin,
    handleRegister,
    handleTwoFactorSubmit,
    handleRecoverySubmit,
    handleResendCode,
    handlePasswordReset,
    handleForgotPasswordSubmit,
    handleAcceptDisclaimers,
    toggleMode,
    resolveTitle,

    // Computed
    allowRegistration,
    allowPasswordReset,

    // Client
    client,
  } = useAuthenticationLogic({
    appId,
    title,
    showPasswordField,
    showDetailedErrors,
    platform: 'web',
    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
    deviceName: 'Web Browser',
    onAuthenticationSuccess,
    onAuthenticationError,
  });

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
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                handleLogin();
              }}
            >
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
                      onClick={async () => {
                        clearMessages();
                        setIsLoading(true);
                        try {
                          const authUrl = await client.auth.getProviderAuthorizationUrl(
                            provider.name,
                            appId ?? '',
                            provider.redirectUri,
                          );
                          if (!authUrl) {
                            setErrorMessage(`Unable to get authorization URL for ${provider.displayName}.`);
                            return;
                          }
                          if (!isPopupSupported()) {
                            // Fallback to redirect if popups are blocked
                            window.location.href = authUrl;
                            return;
                          }
                          const result = await openOAuthPopup(authUrl);
                          if (result.success && result.response) {
                            const authResponse = result.response as AuthenticationResponse;
                            if (authResponse.jwtToken) {
                              await processAuthResponse(authResponse);
                            } else {
                              // Provider returned a token/code, complete via login
                              const tokenOrCode =
                                typeof result.response === 'string'
                                  ? result.response
                                  : (((result.response as Record<string, unknown>).token as string) ??
                                    ((result.response as Record<string, unknown>).code as string) ??
                                    '');
                              if (tokenOrCode) {
                                const response = await client.auth.loginWithProvider(
                                  provider.name,
                                  tokenOrCode,
                                  appId ?? '',
                                );
                                await processAuthResponse(response);
                              }
                            }
                          } else if (result.error) {
                            setErrorMessage(result.error);
                          }
                        } catch (err) {
                          handleError(err);
                        } finally {
                          setIsLoading(false);
                        }
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
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                handleRegister();
              }}
              className="ww-register-section"
            >
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
                <label htmlFor="ww-reg-username">Username</label>
                <input
                  id="ww-reg-username"
                  type="text"
                  className="ww-form-control"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="Leave blank to use email"
                  autoComplete="username"
                  maxLength={50}
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
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    handleTwoFactorSubmit();
                  }}
                >
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
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    handleRecoverySubmit();
                  }}
                >
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
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                handlePasswordReset();
              }}
              className="ww-password-reset-section"
            >
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
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
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
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                handleForgotPasswordSubmit();
              }}
              className="ww-forgot-password-section"
            >
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
                  onClick={handleAcceptDisclaimers}
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
