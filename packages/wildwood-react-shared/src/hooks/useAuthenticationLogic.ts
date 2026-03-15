'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  AuthenticationResponse,
  LoginRequest,
  RegistrationRequest,
  AuthProvider,
  AuthenticationConfiguration,
  CaptchaConfiguration,
  TwoFactorMethodInfo,
  WildwoodClient,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthView = 'login' | 'register' | 'twoFactor' | 'passwordReset' | 'forgotPassword' | 'disclaimers';

export interface UseAuthenticationLogicOptions {
  appId?: string;
  title?: string;
  showPasswordField?: boolean;
  showDetailedErrors?: boolean;
  platform: string; // 'web' or Platform.OS
  deviceInfo: string; // navigator.userAgent or `${Platform.OS} ${Platform.Version}`
  deviceName?: string; // 'Web Browser' or `${Platform.OS} Device`
  onAuthenticationSuccess?: (response: AuthenticationResponse) => void;
  onAuthenticationError?: (error: string) => void;
}

export interface UseAuthenticationLogicReturn {
  // State
  view: AuthView;
  setView: (view: AuthView) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  errorMessage: string;
  setErrorMessage: (msg: string) => void;
  successMessage: string;
  setSuccessMessage: (msg: string) => void;

  // Config
  authConfig: AuthenticationConfiguration | null;
  captchaConfig: CaptchaConfiguration | null;
  providers: AuthProvider[];

  // Login form
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (val: boolean) => void;

  // Registration form
  regFirstName: string;
  setRegFirstName: (val: string) => void;
  regLastName: string;
  setRegLastName: (val: string) => void;
  regUsername: string;
  setRegUsername: (val: string) => void;
  regEmail: string;
  setRegEmail: (val: string) => void;
  regPassword: string;
  setRegPassword: (val: string) => void;
  regConfirmPassword: string;
  setRegConfirmPassword: (val: string) => void;
  showRegPassword: boolean;
  setShowRegPassword: (val: boolean) => void;

  // 2FA
  twoFactorSessionId: string;
  twoFactorMethods: TwoFactorMethodInfo[];
  selectedTwoFactorMethod: string;
  setSelectedTwoFactorMethod: (val: string) => void;
  twoFactorCode: string;
  setTwoFactorCode: (val: string) => void;
  showRecoveryInput: boolean;
  setShowRecoveryInput: (val: boolean) => void;
  recoveryCode: string;
  setRecoveryCode: (val: string) => void;
  rememberDevice: boolean;
  setRememberDevice: (val: boolean) => void;

  // Password reset
  newPassword: string;
  setNewPassword: (val: string) => void;
  confirmPassword: string;
  setConfirmPassword: (val: string) => void;
  showNewPassword: boolean;
  setShowNewPassword: (val: boolean) => void;
  showConfirmPassword: boolean;
  setShowConfirmPassword: (val: boolean) => void;

  // Forgot password
  forgotEmail: string;
  setForgotEmail: (val: string) => void;

  // Pending auth
  pendingAuth: AuthenticationResponse | null;

  // Handlers
  clearMessages: () => void;
  handleError: (err: unknown) => void;
  completeAuth: (response: AuthenticationResponse) => Promise<void>;
  processAuthResponse: (response: AuthenticationResponse) => Promise<void>;
  handleLogin: () => Promise<void>;
  handleRegister: () => Promise<void>;
  handleTwoFactorSubmit: () => Promise<void>;
  handleRecoverySubmit: () => Promise<void>;
  handleResendCode: () => Promise<void>;
  handlePasswordReset: () => Promise<void>;
  handleForgotPasswordSubmit: () => Promise<void>;
  handleAcceptDisclaimers: () => Promise<void>;
  toggleMode: () => void;
  resolveTitle: () => string;

  // Computed
  allowRegistration: boolean;
  allowPasswordReset: boolean;

  // Client (for OAuth handling in React web)
  client: WildwoodClient;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthenticationLogic(options: UseAuthenticationLogicOptions): UseAuthenticationLogicReturn {
  const {
    appId,
    title,
    showPasswordField = true,
    showDetailedErrors = true,
    platform,
    deviceInfo,
    deviceName,
    onAuthenticationSuccess,
    onAuthenticationError,
  } = options;

  const client = useWildwood();

  // View state
  const [view, setViewInternal] = useState<AuthView>('login');
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
  const [regUsername, setRegUsername] = useState('');
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

  // Wrapped setView that resets 2FA/pending state when navigating back to login
  const setView = useCallback((nextView: AuthView) => {
    if (nextView === 'login' || nextView === 'register') {
      setTwoFactorSessionId('');
      setTwoFactorCode('');
      setTwoFactorMethods([]);
      setSelectedTwoFactorMethod('');
      setShowRecoveryInput(false);
      setRecoveryCode('');
      setRememberDevice(false);
      setNewPassword('');
      setConfirmPassword('');
      setPendingAuth(null);
    }
    setViewInternal(nextView);
  }, []);

  // ---------------------------------------------------------------------------
  // Load configuration on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!appId) return;
    const load = async () => {
      const [ac, cc, prov] = await Promise.all([
        client.auth.getAuthenticationConfiguration(appId).catch(() => null),
        client.auth.getCaptchaConfiguration(appId).catch(() => null),
        client.auth.getAvailableProviders(appId).catch(() => [] as AuthProvider[]),
      ]);
      setAuthConfig(ac);
      setCaptchaConfig(cc);
      setProviders(prov);
    };
    load();
  }, [appId, client]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clearMessages = useCallback(() => {
    setErrorMessage('');
    setSuccessMessage('');
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const displayMsg = showDetailedErrors ? msg : 'Authentication failed. Please try again.';
      setErrorMessage(displayMsg);
      onAuthenticationError?.(msg);
    },
    [showDetailedErrors, onAuthenticationError],
  );

  // ---------------------------------------------------------------------------
  // Complete auth flow (called after all checks pass)
  // ---------------------------------------------------------------------------
  const completeAuth = useCallback(
    async (response: AuthenticationResponse) => {
      await client.session.login(response);
      onAuthenticationSuccess?.(response);
    },
    [client, onAuthenticationSuccess],
  );

  // ---------------------------------------------------------------------------
  // Process auth response, checking for 2FA / password reset / disclaimers
  // ---------------------------------------------------------------------------
  const processAuthResponse = useCallback(
    async (response: AuthenticationResponse) => {
      if (response.requiresTwoFactor) {
        setPendingAuth(response);
        setTwoFactorSessionId(response.twoFactorSessionId ?? '');
        setTwoFactorMethods(response.availableTwoFactorMethods ?? []);
        setSelectedTwoFactorMethod(response.defaultTwoFactorMethod ?? '');
        setViewInternal('twoFactor');
        return;
      }

      if (response.requiresPasswordReset) {
        setPendingAuth(response);
        setViewInternal('passwordReset');
        return;
      }

      if (response.requiresDisclaimerAcceptance && response.pendingDisclaimers?.length) {
        setPendingAuth(response);
        setViewInternal('disclaimers');
        return;
      }

      await completeAuth(response);
    },
    [completeAuth],
  );

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  const handleLogin = useCallback(async () => {
    clearMessages();
    setIsLoading(true);

    try {
      const request: LoginRequest = {
        username,
        email: username,
        password,
        appId,
        rememberMe,
        platform,
        deviceInfo,
      };

      const response = await client.auth.login(request);
      await processAuthResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [
    username,
    password,
    appId,
    rememberMe,
    platform,
    deviceInfo,
    client,
    processAuthResponse,
    clearMessages,
    handleError,
  ]);

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  const handleRegister = useCallback(async () => {
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
        username: regUsername || regEmail,
        password: regPassword,
        appId: appId ?? '',
        platform,
        deviceInfo,
      };

      const response = await client.auth.register(request);
      await processAuthResponse(response);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [
    regFirstName,
    regLastName,
    regEmail,
    regUsername,
    regPassword,
    regConfirmPassword,
    appId,
    platform,
    deviceInfo,
    client,
    processAuthResponse,
    clearMessages,
    handleError,
  ]);

  // ---------------------------------------------------------------------------
  // Two-Factor
  // ---------------------------------------------------------------------------
  const handleTwoFactorSubmit = useCallback(async () => {
    clearMessages();
    setIsLoading(true);

    try {
      const result = await client.auth.verifyTwoFactorCode({
        sessionId: twoFactorSessionId,
        code: twoFactorCode,
        providerType: selectedTwoFactorMethod,
        rememberDevice,
        deviceFingerprint: deviceInfo,
        deviceName: deviceName ?? `${platform} Device`,
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
  }, [
    twoFactorSessionId,
    twoFactorCode,
    selectedTwoFactorMethod,
    rememberDevice,
    deviceInfo,
    deviceName,
    platform,
    client,
    processAuthResponse,
    clearMessages,
    handleError,
  ]);

  const handleRecoverySubmit = useCallback(async () => {
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
  }, [twoFactorSessionId, recoveryCode, client, processAuthResponse, clearMessages, handleError]);

  const handleResendCode = useCallback(async () => {
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
  }, [twoFactorSessionId, client, clearMessages, handleError]);

  // ---------------------------------------------------------------------------
  // Password Reset (forced after login)
  // ---------------------------------------------------------------------------
  const handlePasswordReset = useCallback(async () => {
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
          email: pendingAuth.email,
          password: newPassword,
          appId,
          platform,
          deviceInfo,
        });
        await processAuthResponse(response);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [
    newPassword,
    confirmPassword,
    appId,
    platform,
    deviceInfo,
    pendingAuth,
    client,
    processAuthResponse,
    clearMessages,
    handleError,
  ]);

  // ---------------------------------------------------------------------------
  // Forgot Password
  // ---------------------------------------------------------------------------
  const handleForgotPasswordSubmit = useCallback(async () => {
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
  }, [forgotEmail, appId, client, clearMessages, handleError]);

  // ---------------------------------------------------------------------------
  // Disclaimers
  // ---------------------------------------------------------------------------
  const handleAcceptDisclaimers = useCallback(async () => {
    if (!pendingAuth?.pendingDisclaimers) return;
    clearMessages();
    setIsLoading(true);
    try {
      await client.disclaimer.acceptAllDisclaimers(
        pendingAuth.pendingDisclaimers.map((d) => ({
          disclaimerId: d.disclaimerId,
          versionId: d.versionId,
        })),
      );
      await completeAuth(pendingAuth);
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [pendingAuth, client, completeAuth, clearMessages, handleError]);

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------
  const toggleMode = useCallback(() => {
    clearMessages();
    // Clear form fields when switching views
    setPassword('');
    setShowPassword(false);
    setRegPassword('');
    setRegConfirmPassword('');
    setShowRegPassword(false);
    // Reset 2FA state
    setTwoFactorSessionId('');
    setTwoFactorCode('');
    setTwoFactorMethods([]);
    setSelectedTwoFactorMethod('');
    setShowRecoveryInput(false);
    setRecoveryCode('');
    setPendingAuth(null);
    setView(view === 'login' ? 'register' : 'login');
  }, [view, clearMessages]);

  const resolveTitle = useCallback(() => {
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
  }, [title, view]);

  // Computed
  const allowRegistration = authConfig ? authConfig.allowOpenRegistration || authConfig.allowTokenRegistration : true;

  const allowPasswordReset = authConfig?.allowPasswordReset ?? true;

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    // State
    view,
    setView,
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    successMessage,
    setSuccessMessage,

    // Config
    authConfig,
    captchaConfig,
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
    twoFactorSessionId,
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
  };
}
