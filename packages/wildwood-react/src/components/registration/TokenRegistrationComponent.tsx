import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticationResponse, AuthenticationConfiguration, RegistrationFormData } from '@wildwood/core';
import { useWildwood } from '../../hooks/useWildwood.js';

export interface TokenRegistrationComponentProps {
  appId?: string;
  registrationToken?: string;
  /** If true, token is required to register. Default true. */
  requireToken?: boolean;
  /** If true, open registration (no token) is allowed. Default false. */
  allowOpenRegistration?: boolean;
  /** If true, auto-login after successful registration. Default true. */
  autoLogin?: boolean;
  /** URL to redirect after successful auto-login */
  redirectUrl?: string;
  /** If true, form validates client-side but does NOT call the API. Instead calls onFormDataCollected. */
  deferSubmission?: boolean;
  /** Called when deferSubmission is true and form passes validation. */
  onFormDataCollected?: (data: RegistrationFormData) => void;
  /** Pre-fill form fields (e.g. when navigating back from a later step). */
  initialFormData?: RegistrationFormData;
  onRegistrationSuccess?: (response: AuthenticationResponse) => void;
  onRegistrationError?: (error: string) => void;
  onAutoLoginSuccess?: (response: AuthenticationResponse) => void;
  onCancel?: () => void;
  /** Custom submit button text. Default: "Create Account" (or "Continue" in deferred mode). */
  submitButtonText?: string;
  /** Hide the internal step indicator (useful when a parent component provides its own). */
  hideStepIndicator?: boolean;
  className?: string;
}

type Step = 'token' | 'account' | 'success';

export function TokenRegistrationComponent({
  appId,
  registrationToken: initialToken,
  requireToken = true,
  allowOpenRegistration = false,
  autoLogin = true,
  redirectUrl,
  deferSubmission = false,
  onFormDataCollected,
  initialFormData,
  onRegistrationSuccess,
  onRegistrationError,
  onAutoLoginSuccess,
  onCancel,
  submitButtonText,
  hideStepIndicator = false,
  className,
}: TokenRegistrationComponentProps) {
  const client = useWildwood();

  // Step management
  const tokenIsRequired = requireToken && !allowOpenRegistration;
  const tokenIsOptional = !requireToken && allowOpenRegistration;
  const initialStep: Step = tokenIsRequired ? 'token' : 'account';
  const [currentStep, setCurrentStep] = useState<Step>(initialToken ? 'account' : initialStep);

  // Token state
  const [token, setToken] = useState(initialToken ?? '');
  const [tokenValidated, setTokenValidated] = useState(!!initialToken);
  const [tokenError, setTokenError] = useState('');
  const [useToken, setUseToken] = useState(!!initialToken);

  // Registration form state
  const [firstName, setFirstName] = useState(initialFormData?.firstName ?? '');
  const [lastName, setLastName] = useState(initialFormData?.lastName ?? '');
  const [username, setUsername] = useState(initialFormData?.username ?? '');
  const [email, setEmail] = useState(initialFormData?.email ?? '');
  const [password, setPassword] = useState(initialFormData?.password ?? '');
  const [confirmPassword, setConfirmPassword] = useState(initialFormData?.password ?? '');
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [autoLoginComplete, setAutoLoginComplete] = useState(false);
  const [autoLoginError, setAutoLoginError] = useState('');
  const [registrationResponse, setRegistrationResponse] = useState<AuthenticationResponse | null>(null);

  // Auth config (password requirements)
  const [authConfig, setAuthConfig] = useState<AuthenticationConfiguration | null>(null);
  const [passwordRequirements, setPasswordRequirements] = useState('');

  // Load auth configuration for password requirements
  useEffect(() => {
    if (!appId) return;
    client.auth
      .getAuthenticationConfiguration(appId)
      .then((config) => {
        if (config) {
          setAuthConfig(config);
          setPasswordRequirements(client.auth.getPasswordRequirementsText(config));
        }
      })
      .catch(() => {});
  }, [appId, client.auth]);

  // Get step number for display
  const getStepNumber = (step: Step): number => {
    if (tokenIsRequired) {
      if (step === 'token') return 1;
      if (step === 'account') return 2;
      return 3;
    }
    if (step === 'account') return 1;
    return 2;
  };

  const isStepActive = (step: Step): boolean => {
    const order: Step[] = tokenIsRequired ? ['token', 'account', 'success'] : ['account', 'success'];
    return order.indexOf(currentStep) >= order.indexOf(step);
  };

  const isStepCompleted = (step: Step): boolean => {
    const order: Step[] = tokenIsRequired ? ['token', 'account', 'success'] : ['account', 'success'];
    return order.indexOf(currentStep) > order.indexOf(step);
  };

  // Validate registration token
  const handleValidateToken = useCallback(async () => {
    if (!token.trim()) {
      setTokenError('Registration token is required');
      return;
    }

    setIsLoading(true);
    setTokenError('');
    try {
      const valid = await client.auth.validateRegistrationToken(token);
      if (valid) {
        setTokenValidated(true);
        setUseToken(true);
        setCurrentStep('account');
      } else {
        setTokenError('Invalid or expired registration token');
      }
    } catch {
      setTokenError('Failed to validate token. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [token, client.auth]);

  // Handle token input Enter key
  const handleTokenKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleValidateToken();
    }
  };

  // Validate optional token
  const handleValidateOptionalToken = useCallback(async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setTokenError('');
    try {
      const valid = await client.auth.validateRegistrationToken(token);
      if (valid) {
        setUseToken(true);
        setTokenValidated(true);
      } else {
        setTokenError('Invalid or expired registration token');
      }
    } catch {
      setTokenError('Failed to validate token');
    } finally {
      setIsLoading(false);
    }
  }, [token, client.auth]);

  const clearToken = () => {
    setToken('');
    setUseToken(false);
    setTokenValidated(false);
    setTokenError('');
  };

  // Client-side password validation
  const validatePassword = useCallback(
    (pwd: string): string | null => {
      if (!authConfig) return null;
      if (pwd.length < authConfig.passwordMinimumLength) {
        return `Password must be at least ${authConfig.passwordMinimumLength} characters.`;
      }
      if (authConfig.passwordRequireUppercase && !/[A-Z]/.test(pwd)) {
        return 'Password must contain at least one uppercase letter (A-Z).';
      }
      if (authConfig.passwordRequireLowercase && !/[a-z]/.test(pwd)) {
        return 'Password must contain at least one lowercase letter (a-z).';
      }
      if (authConfig.passwordRequireDigit && !/\d/.test(pwd)) {
        return 'Password must contain at least one number (0-9).';
      }
      if (authConfig.passwordRequireSpecialChar && !/[^a-zA-Z0-9]/.test(pwd)) {
        return 'Password must contain at least one special character.';
      }
      return null;
    },
    [authConfig],
  );

  // Submit registration
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');

      // Validation
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      const pwdError = validatePassword(password);
      if (pwdError) {
        setError(pwdError);
        return;
      }

      if (useToken && !token.trim()) {
        setError('Registration token is required');
        return;
      }

      // Server-side validation: check username/email availability
      setIsLoading(true);
      try {
        const validation = await client.auth.validateRegistration({
          username: username || email,
          email,
          password,
          token: useToken && token.trim() ? token : undefined,
          appId: appId ?? '',
        });

        if (!validation.usernameAvailable) {
          setError('This username is already taken. Please choose a different one.');
          setIsLoading(false);
          return;
        }
        if (!validation.emailAvailable) {
          setError('An account with this email address already exists.');
          setIsLoading(false);
          return;
        }
        if (!validation.passwordValid && validation.passwordErrors?.length > 0) {
          setError(validation.passwordErrors.join(' '));
          setIsLoading(false);
          return;
        }
      } catch {
        // If validation endpoint fails, continue with registration
        // (the register endpoint will catch real issues)
      }
      setIsLoading(false);

      // Deferred mode: collect data without calling API
      if (deferSubmission) {
        onFormDataCollected?.({
          firstName,
          lastName,
          username: username || email,
          email,
          password,
          registrationToken: useToken && token.trim() ? token : undefined,
          useToken,
        });
        return;
      }

      setIsLoading(true);
      try {
        let response: AuthenticationResponse;

        if (useToken && token.trim()) {
          response = await client.auth.registerWithToken({
            registrationToken: token,
            firstName,
            lastName,
            username: username || email,
            email,
            password,
            appId: appId ?? '',
            platform: 'web',
            deviceInfo: navigator.userAgent,
          });
        } else {
          response = await client.auth.register({
            firstName,
            lastName,
            username: username || email,
            email,
            password,
            appId: appId ?? '',
            platform: 'web',
            deviceInfo: navigator.userAgent,
          });
        }

        setRegistrationResponse(response);
        onRegistrationSuccess?.(response);

        // Auto-login
        if (autoLogin && response.jwtToken) {
          setIsAutoLoggingIn(true);
          try {
            await client.session.login(response);
            setAutoLoginComplete(true);
            onAutoLoginSuccess?.(response);
            if (redirectUrl) {
              window.location.href = redirectUrl;
              return;
            }
          } catch {
            setAutoLoginError('Account created but auto-login failed. Please log in manually.');
          } finally {
            setIsAutoLoggingIn(false);
          }
        }

        setCurrentStep('success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        setError(msg);
        onRegistrationError?.(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [
      token,
      firstName,
      lastName,
      username,
      email,
      password,
      confirmPassword,
      appId,
      useToken,
      autoLogin,
      redirectUrl,
      deferSubmission,
      client,
      validatePassword,
      onFormDataCollected,
      onRegistrationSuccess,
      onRegistrationError,
      onAutoLoginSuccess,
    ],
  );

  const resetForm = () => {
    setToken('');
    setTokenValidated(false);
    setTokenError('');
    setUseToken(false);
    setCurrentStep('token');
  };

  return (
    <div className={`ww-token-registration ${className ?? ''}`}>
      {/* Step Indicator */}
      {!hideStepIndicator && currentStep !== 'success' && (
        <div className="ww-step-indicator">
          <div className="ww-steps">
            {tokenIsRequired && (
              <>
                <div
                  className={`ww-step ${isStepActive('token') ? 'ww-step-active' : ''} ${isStepCompleted('token') ? 'ww-step-completed' : ''}`}
                >
                  <span className="ww-step-number">{getStepNumber('token')}</span>
                  <span className="ww-step-label">Token</span>
                </div>
                <div className={`ww-step-connector ${isStepCompleted('token') ? 'ww-step-connector-completed' : ''}`} />
              </>
            )}
            <div
              className={`ww-step ${isStepActive('account') ? 'ww-step-active' : ''} ${isStepCompleted('account') ? 'ww-step-completed' : ''}`}
            >
              <span className="ww-step-number">{getStepNumber('account')}</span>
              <span className="ww-step-label">Account</span>
            </div>
          </div>
        </div>
      )}

      {/* Token Validation Step */}
      {currentStep === 'token' && tokenIsRequired && (
        <div className="ww-reg-section">
          <h3 className="ww-reg-title">Registration Token Required</h3>
          <p className="ww-reg-subtitle">Please enter your registration token to begin the signup process.</p>

          <div className="ww-form-group">
            <label htmlFor="ww-reg-token">
              Registration Token <span className="ww-text-danger">*</span>
            </label>
            <input
              id="ww-reg-token"
              type="text"
              className={`ww-form-control ${tokenError ? 'ww-is-invalid' : ''}`}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={handleTokenKeyPress}
              placeholder="Enter your registration token"
              maxLength={100}
              disabled={isLoading}
            />
            {tokenError && <div className="ww-invalid-feedback">{tokenError}</div>}
          </div>

          <button
            type="button"
            className="ww-btn ww-btn-primary"
            onClick={handleValidateToken}
            disabled={isLoading || !token.trim()}
          >
            {isLoading ? (
              <>
                <span className="ww-spinner ww-spinner-sm" />
                Validating...
              </>
            ) : (
              'Validate Token'
            )}
          </button>
        </div>
      )}

      {/* Account Registration Step */}
      {currentStep === 'account' && (
        <div className="ww-reg-section">
          <h3 className="ww-reg-title">Create Your Account</h3>
          <p className="ww-reg-subtitle">
            {useToken
              ? 'Your registration token is valid. Please complete your account setup.'
              : 'Please complete the form below to create your account.'}
          </p>

          {/* Optional Token Entry */}
          {tokenIsOptional && !useToken && (
            <div className="ww-optional-token-card">
              <h6 className="ww-optional-token-title">Have a Registration Token?</h6>
              <p className="ww-optional-token-desc">
                If you have a registration token, enter it below to unlock special access or pricing.
              </p>
              <div className="ww-input-group">
                <input
                  type="text"
                  className={`ww-form-control ${tokenError ? 'ww-is-invalid' : ''} ${tokenValidated ? 'ww-is-valid' : ''}`}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter registration token (optional)"
                  maxLength={100}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="ww-btn ww-btn-outline"
                  onClick={handleValidateOptionalToken}
                  disabled={!token.trim() || isLoading}
                >
                  {isLoading ? <span className="ww-spinner ww-spinner-sm" /> : 'Apply'}
                </button>
              </div>
              {tokenError && <div className="ww-text-danger ww-text-sm">{tokenError}</div>}
              {tokenValidated && <div className="ww-text-success ww-text-sm">Token applied successfully!</div>}
            </div>
          )}

          {/* Token Info Display */}
          {useToken && tokenValidated && (
            <div className="ww-alert ww-alert-info ww-token-info">
              <div className="ww-token-info-content">
                <h6>Token Information</h6>
                <small>Token validated and will be applied to your registration.</small>
              </div>
              {tokenIsOptional && (
                <button type="button" className="ww-btn ww-btn-sm ww-btn-outline" onClick={clearToken}>
                  Remove
                </button>
              )}
            </div>
          )}

          {error && <div className="ww-alert ww-alert-danger">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="ww-form-row">
              <div className="ww-form-group">
                <label htmlFor="ww-reg-first">First Name *</label>
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
                <label htmlFor="ww-reg-last">Last Name *</label>
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
              <label htmlFor="ww-reg-username">Username *</label>
              <input
                id="ww-reg-username"
                type="text"
                className="ww-form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a unique username"
                disabled={isLoading}
              />
              <small className="ww-text-muted">This will be used to log in to your account</small>
            </div>

            <div className="ww-form-group">
              <label htmlFor="ww-reg-email">Email Address *</label>
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
              <label htmlFor="ww-reg-password">Password *</label>
              <div className="ww-password-input-container">
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
                  className="ww-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {passwordRequirements && <small className="ww-text-muted">{passwordRequirements}</small>}
            </div>

            <div className="ww-form-group">
              <label htmlFor="ww-reg-confirm">Confirm Password *</label>
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

            <div className="ww-reg-actions">
              <button type="submit" className="ww-btn ww-btn-primary ww-btn-block ww-btn-lg" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="ww-spinner ww-spinner-sm" />
                    Creating Account...
                  </>
                ) : (
                  (submitButtonText ?? (deferSubmission ? 'Continue' : 'Create Account'))
                )}
              </button>

              {tokenIsRequired && (
                <button type="button" className="ww-btn ww-btn-link" onClick={resetForm}>
                  Use Different Token
                </button>
              )}

              {onCancel && (
                <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Success Step */}
      {currentStep === 'success' && (
        <div className="ww-reg-section ww-reg-success">
          {isAutoLoggingIn ? (
            <>
              <div className="ww-reg-success-icon">
                <span className="ww-spinner ww-spinner-lg" />
              </div>
              <h4>Logging you in...</h4>
              <p className="ww-text-muted">Please wait while we complete your sign in.</p>
            </>
          ) : autoLoginComplete ? (
            <>
              <div className="ww-reg-success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--ww-success, #198754)">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <h4>Welcome!</h4>
              <p className="ww-text-muted">Your account has been created and you are now logged in.</p>
            </>
          ) : (
            <>
              <div className="ww-reg-success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--ww-success, #198754)">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <h4>Account Created Successfully!</h4>
              <p className="ww-text-muted">Your account has been created. You can now log in.</p>
            </>
          )}

          {autoLoginError && <div className="ww-alert ww-alert-warning">{autoLoginError}</div>}

          {registrationResponse && !autoLoginComplete && !isAutoLoggingIn && (
            <div className="ww-reg-success-actions">
              <button
                type="button"
                className="ww-btn ww-btn-primary ww-btn-lg"
                onClick={() => {
                  if (redirectUrl) {
                    window.location.href = redirectUrl;
                  }
                }}
              >
                Continue to Login
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
