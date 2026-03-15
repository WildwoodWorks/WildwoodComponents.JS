// TokenRegistrationComponent - React Native port of the React TokenRegistrationComponent
// Allows users to register using a pre-issued registration token, with multi-step flow

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AuthenticationResponse, AuthenticationConfiguration, RegistrationFormData } from '@wildwood/core';
import { useWildwood } from '../hooks/useWildwood';

export interface TokenRegistrationComponentProps {
  appId?: string;
  registrationToken?: string;
  /** If true, token is required to register. Default true. */
  requireToken?: boolean;
  /** If true, open registration (no token) is allowed. Default false. */
  allowOpenRegistration?: boolean;
  /** If true, auto-login after successful registration. Default true. */
  autoLogin?: boolean;
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
  style?: ViewStyle;
}

type Step = 'token' | 'account' | 'success';

export function TokenRegistrationComponent({
  appId,
  registrationToken: initialToken,
  requireToken = true,
  allowOpenRegistration = false,
  autoLogin = true,
  deferSubmission = false,
  onFormDataCollected,
  initialFormData,
  onRegistrationSuccess,
  onRegistrationError,
  onAutoLoginSuccess,
  onCancel,
  submitButtonText,
  hideStepIndicator = false,
  style,
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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      .catch((err) => console.warn('Failed to load auth configuration:', err));
  }, [appId, client.auth]);

  // Step indicator helpers
  const getStepNumber = (step: Step): number => {
    if (tokenIsRequired) {
      if (step === 'token') return 1;
      if (step === 'account') return 2;
      return 3;
    }
    if (step === 'account') return 1;
    return 2;
  };

  const steps: Step[] = tokenIsRequired ? ['token', 'account', 'success'] : ['account', 'success'];

  const isStepActive = (step: Step): boolean => {
    return steps.indexOf(currentStep) >= steps.indexOf(step);
  };

  const isStepCompleted = (step: Step): boolean => {
    return steps.indexOf(currentStep) > steps.indexOf(step);
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
  const handleSubmit = useCallback(async () => {
    setError('');

    // Validation
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
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
          platform: Platform.OS,
          deviceInfo: `${Platform.OS} ${Platform.Version}`,
        });
      } else {
        response = await client.auth.register({
          firstName,
          lastName,
          username: username || email,
          email,
          password,
          appId: appId ?? '',
          platform: Platform.OS,
          deviceInfo: `${Platform.OS} ${Platform.Version}`,
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
  }, [
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
    deferSubmission,
    client,
    validatePassword,
    onFormDataCollected,
    onRegistrationSuccess,
    onRegistrationError,
    onAutoLoginSuccess,
  ]);

  const resetForm = () => {
    setToken('');
    setTokenValidated(false);
    setTokenError('');
    setUseToken(false);
    setCurrentStep(tokenIsRequired ? 'token' : 'account');
  };

  // Determine which steps to show in the indicator
  const visibleSteps = tokenIsRequired
    ? [
        { key: 'token' as Step, label: 'Token' },
        { key: 'account' as Step, label: 'Account' },
      ]
    : [{ key: 'account' as Step, label: 'Account' }];

  return (
    <KeyboardAvoidingView style={[styles.container, style]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step Indicator */}
        {!hideStepIndicator && currentStep !== 'success' && (
          <View style={styles.stepIndicator}>
            {visibleSteps.map((step, index) => (
              <View key={step.key} style={styles.stepRow}>
                {index > 0 && (
                  <View
                    style={[
                      styles.stepConnector,
                      isStepCompleted(visibleSteps[index - 1].key) && styles.stepConnectorCompleted,
                    ]}
                  />
                )}
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isStepActive(step.key) && styles.stepCircleActive,
                      isStepCompleted(step.key) && styles.stepCircleCompleted,
                    ]}
                  >
                    {isStepCompleted(step.key) ? (
                      <Text style={styles.stepCheckmark}>✓</Text>
                    ) : (
                      <Text style={[styles.stepNumber, isStepActive(step.key) && styles.stepNumberActive]}>
                        {getStepNumber(step.key)}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.stepLabel, isStepActive(step.key) && styles.stepLabelActive]}>{step.label}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Token Validation Step */}
        {currentStep === 'token' && tokenIsRequired && (
          <View style={styles.card}>
            <Text style={styles.title}>Registration Token Required</Text>
            <Text style={styles.subtitle}>Please enter your registration token to begin the signup process.</Text>

            {tokenError !== '' && (
              <View style={styles.alertError}>
                <Text style={styles.alertErrorText}>{tokenError}</Text>
              </View>
            )}

            <Text style={styles.label}>
              Registration Token <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, tokenError ? styles.inputError : undefined]}
              value={token}
              onChangeText={setToken}
              placeholder="Enter your registration token"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              editable={!isLoading}
              returnKeyType="go"
              onSubmitEditing={handleValidateToken}
            />

            <Pressable
              style={[styles.primaryButton, (isLoading || !token.trim()) && styles.buttonDisabled]}
              onPress={handleValidateToken}
              disabled={isLoading || !token.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Validate Token</Text>
              )}
            </Pressable>

            {onCancel && (
              <Pressable style={styles.linkButton} onPress={onCancel}>
                <Text style={styles.linkButtonText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Account Registration Step */}
        {currentStep === 'account' && (
          <View style={styles.card}>
            <Text style={styles.title}>Create Your Account</Text>
            <Text style={styles.subtitle}>
              {useToken
                ? 'Your registration token is valid. Please complete your account setup.'
                : 'Please complete the form below to create your account.'}
            </Text>

            {/* Optional Token Entry */}
            {tokenIsOptional && !useToken && (
              <View style={styles.optionalTokenCard}>
                <Text style={styles.optionalTokenTitle}>Have a Registration Token?</Text>
                <Text style={styles.optionalTokenDesc}>
                  If you have a registration token, enter it below to unlock special access or pricing.
                </Text>
                <View style={styles.optionalTokenRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.optionalTokenInput,
                      tokenError ? styles.inputError : undefined,
                      tokenValidated ? styles.inputValid : undefined,
                    ]}
                    value={token}
                    onChangeText={setToken}
                    placeholder="Enter registration token (optional)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={100}
                    editable={!isLoading}
                  />
                  <Pressable
                    style={[styles.outlineButton, (!token.trim() || isLoading) && styles.buttonDisabled]}
                    onPress={handleValidateOptionalToken}
                    disabled={!token.trim() || isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#007AFF" size="small" />
                    ) : (
                      <Text style={styles.outlineButtonText}>Apply</Text>
                    )}
                  </Pressable>
                </View>
                {tokenError !== '' && <Text style={styles.fieldErrorText}>{tokenError}</Text>}
                {tokenValidated && <Text style={styles.fieldSuccessText}>Token applied successfully!</Text>}
              </View>
            )}

            {/* Token Info Display */}
            {useToken && tokenValidated && (
              <View style={styles.alertInfo}>
                <View style={styles.tokenInfoContent}>
                  <Text style={styles.tokenInfoTitle}>Token Information</Text>
                  <Text style={styles.tokenInfoDesc}>Token validated and will be applied to your registration.</Text>
                </View>
                {tokenIsOptional && (
                  <Pressable style={styles.outlineButtonSmall} onPress={clearToken}>
                    <Text style={styles.outlineButtonText}>Remove</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Error alert */}
            {error !== '' && (
              <View style={styles.alertError}>
                <Text style={styles.alertErrorText}>{error}</Text>
              </View>
            )}

            {/* Name row - first and last side by side */}
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Text style={styles.label}>
                  First Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="given-name"
                  textContentType="givenName"
                  editable={!isLoading}
                  returnKeyType="next"
                />
              </View>
              <View style={styles.nameField}>
                <Text style={styles.label}>
                  Last Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="family-name"
                  textContentType="familyName"
                  editable={!isLoading}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Username */}
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Choose a unique username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              editable={!isLoading}
              returnKeyType="next"
            />
            <Text style={styles.helpText}>This will be used to log in to your account</Text>

            {/* Email */}
            <Text style={styles.label}>
              Email Address <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!isLoading}
              returnKeyType="next"
            />

            {/* Password */}
            <Text style={styles.label}>
              Password <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                editable={!isLoading}
                returnKeyType="next"
              />
              <Pressable style={styles.showPasswordBtn} onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {passwordRequirements !== '' && <Text style={styles.helpText}>{passwordRequirements}</Text>}

            {/* Confirm Password */}
            <Text style={styles.label}>
              Confirm Password <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                editable={!isLoading}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              <Pressable style={styles.showPasswordBtn} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Text style={styles.showPasswordText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>

            {/* Submit button */}
            <Pressable
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {submitButtonText ?? (deferSubmission ? 'Continue' : 'Create Account')}
                </Text>
              )}
            </Pressable>

            {/* Use Different Token link */}
            {tokenIsRequired && (
              <Pressable style={styles.linkButton} onPress={resetForm}>
                <Text style={styles.linkButtonText}>Use Different Token</Text>
              </Pressable>
            )}

            {/* Cancel link */}
            {onCancel && (
              <Pressable style={styles.linkButton} onPress={onCancel}>
                <Text style={styles.linkButtonText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Success Step */}
        {currentStep === 'success' && (
          <View style={styles.card}>
            {isAutoLoggingIn ? (
              <View style={styles.successContent}>
                <ActivityIndicator color="#007AFF" size="large" style={styles.successIcon} />
                <Text style={styles.successTitle}>Logging you in...</Text>
                <Text style={styles.successSubtitle}>Please wait while we complete your sign in.</Text>
              </View>
            ) : autoLoginComplete ? (
              <View style={styles.successContent}>
                <View style={styles.successCheckCircle}>
                  <Text style={styles.successCheckText}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Welcome!</Text>
                <Text style={styles.successSubtitle}>Your account has been created and you are now logged in.</Text>
              </View>
            ) : (
              <View style={styles.successContent}>
                <View style={styles.successCheckCircle}>
                  <Text style={styles.successCheckText}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Account Created Successfully!</Text>
                <Text style={styles.successSubtitle}>Your account has been created. You can now log in.</Text>
              </View>
            )}

            {autoLoginError !== '' && (
              <View style={styles.alertWarning}>
                <Text style={styles.alertWarningText}>{autoLoginError}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  inputValid: {
    borderColor: '#22C55E',
  },
  helpText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  showPasswordBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginLeft: 8,
  },
  showPasswordText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  outlineButtonSmall: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  alertError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertErrorText: {
    color: '#991B1B',
    fontSize: 14,
  },
  alertSuccess: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  alertSuccessText: {
    color: '#166534',
    fontSize: 14,
  },
  alertWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  alertWarningText: {
    color: '#92400E',
    fontSize: 14,
  },
  alertInfo: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Optional token card
  optionalTokenCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionalTokenTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionalTokenDesc: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  optionalTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionalTokenInput: {
    flex: 1,
  },
  // Token info
  tokenInfoContent: {
    flex: 1,
  },
  tokenInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  tokenInfoDesc: {
    fontSize: 12,
    color: '#1E40AF',
    marginTop: 2,
  },
  fieldErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  fieldSuccessText: {
    color: '#22C55E',
    fontSize: 12,
    marginTop: 4,
  },
  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#007AFF',
  },
  stepCircleCompleted: {
    backgroundColor: '#22C55E',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepCheckmark: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  stepLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  stepConnector: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
    marginBottom: 20,
  },
  stepConnectorCompleted: {
    backgroundColor: '#22C55E',
  },
  // Success step
  successContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIcon: {
    marginBottom: 16,
  },
  successCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successCheckText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
