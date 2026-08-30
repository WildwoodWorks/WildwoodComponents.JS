// AuthenticationComponent - ported from WildwoodComponents.Blazor AuthenticationComponent
// Multi-view auth: login, registration, 2FA, password reset, forgot password, disclaimers
// State management and handlers delegated to useAuthenticationLogic from @wildwood/react-shared

import { useMemo, useState } from 'react';
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
import {
  sanitizeHtml,
  type AuthenticationResponse,
  type AuthProvider,
  type PendingDisclaimerModel,
} from '@wildwood/core';
import { useAuthenticationLogic, resolveRegistrationAccess } from '@wildwood/react-shared';
import { useWildwoodTheme } from '../styles/ThemeContext';
import type { WildwoodTheme } from '../styles/theme';

export interface AuthenticationComponentProps {
  appId?: string;
  title?: string;
  showPasswordField?: boolean;
  showDetailedErrors?: boolean;
  onAuthenticationSuccess?: (response: AuthenticationResponse) => void;
  onAuthenticationError?: (error: string) => void;
  /**
   * Enables OAuth provider buttons. React Native has no popup window, so the consumer
   * supplies the browser/auth-session step (e.g. expo-auth-session or expo-web-browser):
   * open `authorizationUrl` and resolve with the provider token/authorization code from
   * the callback, or null if the user cancelled. The component then completes the login
   * via loginWithProvider. Provider buttons are hidden when this prop is not supplied.
   * Mirrors the injection pattern used by FeedbackComponent's captureScreenshot.
   */
  onProviderSignIn?: (provider: AuthProvider, authorizationUrl: string | null) => Promise<string | null>;
  /**
   * Overrides the server configuration's registration gate. `false` hides the sign-up link and
   * makes the registration view unreachable even when the app allows open or token registration —
   * for companion apps that are distributed without self-signup. `true` shows it even when the
   * configuration denies registration. Omit for config-driven behaviour (the default).
   */
  allowRegistration?: boolean;
}

export function AuthenticationComponent({
  appId,
  title,
  showPasswordField = true,
  showDetailedErrors = true,
  onAuthenticationSuccess,
  onAuthenticationError,
  onProviderSignIn,
  allowRegistration: allowRegistrationProp,
}: AuthenticationComponentProps) {
  const theme = useWildwoodTheme();
  // Memoised on the theme: StyleSheet.create is not free, and this component re-renders on every
  // keystroke in the login form.
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [oauthLoading, setOauthLoading] = useState(false);
  const {
    // State
    view: hookView,
    setView,
    isLoading: loading,
    errorMessage: error,
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
    processAuthResponse,
    handleLogin,
    handleTwoFactorSubmit,
    handleRecoverySubmit,
    handleResendCode,
    handlePasswordReset,
    handleForgotPasswordSubmit,
    handleAcceptDisclaimers,
    resolveTitle,

    // Computed
    allowPasswordReset,
    allowRegistration: configAllowsRegistration,

    // Client (for password requirements text)
    client,
  } = useAuthenticationLogic({
    appId,
    title,
    showPasswordField,
    showDetailedErrors,
    platform: Platform.OS,
    deviceInfo: `${Platform.OS} ${Platform.Version}`,
    deviceName: `${Platform.OS} Device`,
    onAuthenticationSuccess,
    onAuthenticationError,
  });

  // The prop overrides the server config in both directions; when registration is off the register
  // view collapses back to login, so it stays unreachable however it was entered.
  const { showRegistration, view } = resolveRegistrationAccess(
    allowRegistrationProp,
    configAllowsRegistration,
    hookView,
  );

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Map common OAuth provider names to unicode symbols for native rendering
  const getProviderIcon = (providerName: string): string => {
    const name = providerName.toLowerCase();
    if (name.includes('google')) return '\u{1F310}'; // globe
    if (name.includes('apple')) return '\uF8FF'; // apple symbol (renders on iOS)
    if (name.includes('facebook') || name.includes('meta')) return '\u{1F465}'; // people
    if (name.includes('microsoft') || name.includes('azure')) return '\u{1F5A5}'; // desktop
    if (name.includes('github')) return '\u{2699}'; // gear
    if (name.includes('twitter') || name.includes('x')) return '\u{1F426}'; // bird
    return '\u{1F511}'; // key (generic)
  };

  // Sanitize first (strips dangerous tags/attrs/URL schemes), then flatten to text for RN's <Text>.
  // Mirrors DisclaimerComponent.renderHtmlAsText \u2014 defense-in-depth even though tags are eventually stripped.
  const renderHtmlAsText = (html: string): string => {
    return sanitizeHtml(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '  \u2022 ')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderAlert = () => (
    <>
      {error && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      )}
      {successMessage && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      )}
    </>
  );

  const renderSubmitButton = (label: string, _loadingLabel: string, onPress: () => void) => (
    <Pressable style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={onPress} disabled={loading}>
      {loading ? (
        <ActivityIndicator color={theme.btnPrimaryText} size="small" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );

  const renderPasswordInput = (
    value: string,
    onChangeText: (text: string) => void,
    visible: boolean,
    onToggle: () => void,
    placeholder: string,
    onSubmit?: () => void,
  ) => (
    <View style={styles.passwordRow}>
      <TextInput
        style={[styles.input, styles.passwordInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        editable={!loading}
        returnKeyType={onSubmit ? 'go' : 'next'}
        onSubmitEditing={onSubmit}
      />
      <Pressable style={styles.showPasswordBtn} onPress={onToggle}>
        <Text style={styles.showPasswordText}>{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );

  // ---------------------------------------------------------------------------
  // LOGIN VIEW
  // ---------------------------------------------------------------------------
  const renderLogin = () => (
    <View>
      <Text style={styles.label}>Username or Email</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Enter username or email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        editable={!loading}
        returnKeyType="next"
      />

      {showPasswordField && (
        <>
          <Text style={styles.label}>Password</Text>
          {renderPasswordInput(
            password,
            setPassword,
            showPassword,
            () => setShowPassword(!showPassword),
            'Enter password',
            handleLogin,
          )}
        </>
      )}

      <Pressable style={styles.checkboxRow} onPress={() => setRememberMe(!rememberMe)}>
        <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
          {rememberMe && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>Remember me</Text>
      </Pressable>

      {renderSubmitButton('Sign In', 'Signing in...', handleLogin)}

      {/* Social/OAuth providers — rendered only when the consumer wires the browser step */}
      {providers.length > 0 && onProviderSignIn && (
        <View style={styles.socialSection}>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>
          {providers.map((provider) => (
            <Pressable
              key={provider.name}
              style={[styles.socialButton, (loading || oauthLoading) && styles.buttonDisabled]}
              disabled={loading || oauthLoading}
              onPress={async () => {
                clearMessages();
                setOauthLoading(true);
                try {
                  const authUrl = await client.auth.getProviderAuthorizationUrl(provider.name, appId ?? '');
                  const tokenOrCode = await onProviderSignIn(provider, authUrl);
                  if (!tokenOrCode) {
                    return; // user cancelled the browser/auth session
                  }
                  const response = await client.auth.loginWithProvider(provider.name, tokenOrCode, appId ?? '');
                  await processAuthResponse(response);
                } catch (err) {
                  handleError(err);
                } finally {
                  setOauthLoading(false);
                }
              }}
            >
              <View style={styles.socialButtonContent}>
                <Text style={styles.socialButtonIcon}>{getProviderIcon(provider.name)}</Text>
                {/* buttonText is an operator-configured full label; the bare displayName
                    stays the mobile fallback (matches the Swift component). */}
                <Text style={styles.socialButtonText}>
                  {provider.buttonText?.trim() ? provider.buttonText : provider.displayName}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        {allowPasswordReset && (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              clearMessages();
              setView('forgotPassword');
            }}
          >
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
        )}
        {showRegistration && (
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              clearMessages();
              setView('register');
            }}
          >
            <Text style={styles.linkText}>Don't have an account? Sign up</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // ---------------------------------------------------------------------------
  // REGISTRATION VIEW
  // ---------------------------------------------------------------------------
  const renderRegister = () => (
    <View>
      <Text style={styles.subtitle}>
        Use the TokenRegistrationComponent for invitation-based registration, or contact your administrator for account
        access.
      </Text>
      <Pressable
        style={styles.linkButton}
        onPress={() => {
          clearMessages();
          setView('login');
        }}
      >
        <Text style={styles.linkText}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );

  // ---------------------------------------------------------------------------
  // TWO-FACTOR VIEW
  // ---------------------------------------------------------------------------
  const renderTwoFactor = () => (
    <View>
      {/* Method selector */}
      {twoFactorMethods.length > 1 && (
        <View style={styles.twoFaMethodRow}>
          {twoFactorMethods.map((method) => (
            <Pressable
              key={method.providerType}
              style={[
                styles.twoFaMethodButton,
                selectedTwoFactorMethod === method.providerType && styles.twoFaMethodActive,
              ]}
              onPress={() => {
                setSelectedTwoFactorMethod(method.providerType);
                setShowRecoveryInput(false);
              }}
            >
              <Text
                style={[
                  styles.twoFaMethodText,
                  selectedTwoFactorMethod === method.providerType && styles.twoFaMethodTextActive,
                ]}
              >
                {method.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!showRecoveryInput ? (
        <View>
          <Text style={styles.label}>Verification Code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={twoFactorCode}
            onChangeText={(text) => setTwoFactorCode(text.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            placeholder="000000"
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleTwoFactorSubmit}
          />

          <Pressable style={styles.checkboxRow} onPress={() => setRememberDevice(!rememberDevice)}>
            <View style={[styles.checkbox, rememberDevice && styles.checkboxChecked]}>
              {rememberDevice && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Trust this device for 30 days</Text>
          </Pressable>

          {renderSubmitButton('Verify', 'Verifying...', handleTwoFactorSubmit)}

          {selectedTwoFactorMethod.toLowerCase().includes('email') && (
            <Pressable style={styles.linkButton} onPress={handleResendCode} disabled={loading}>
              <Text style={styles.linkText}>Resend code</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View>
          <Text style={styles.label}>Recovery Code</Text>
          <TextInput
            style={styles.input}
            value={recoveryCode}
            onChangeText={setRecoveryCode}
            maxLength={14}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleRecoverySubmit}
          />

          {renderSubmitButton('Verify Recovery Code', 'Verifying...', handleRecoverySubmit)}
        </View>
      )}

      <View style={styles.footer}>
        <Pressable style={styles.linkButton} onPress={() => setShowRecoveryInput(!showRecoveryInput)}>
          <Text style={styles.linkText}>{showRecoveryInput ? 'Use verification code' : 'Use recovery code'}</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => {
            clearMessages();
            setView('login');
            setTwoFactorCode('');
            setRecoveryCode('');
          }}
        >
          <Text style={styles.linkText}>Back to sign in</Text>
        </Pressable>
      </View>
    </View>
  );

  // ---------------------------------------------------------------------------
  // PASSWORD RESET VIEW (forced)
  // ---------------------------------------------------------------------------
  const renderPasswordReset = () => (
    <View>
      <Text style={styles.subtitle}>You must set a new password before continuing.</Text>

      <Text style={styles.label}>New Password</Text>
      {renderPasswordInput(
        newPassword,
        setNewPassword,
        showNewPassword,
        () => setShowNewPassword(!showNewPassword),
        'Enter new password',
      )}

      <Text style={styles.label}>Confirm Password</Text>
      {renderPasswordInput(
        confirmPassword,
        setConfirmPassword,
        showConfirmPassword,
        () => setShowConfirmPassword(!showConfirmPassword),
        'Confirm new password',
        handlePasswordReset,
      )}

      {authConfig && (
        <Text style={styles.passwordRequirements}>{client.auth.getPasswordRequirementsText(authConfig)}</Text>
      )}

      {renderSubmitButton('Set New Password', 'Updating...', handlePasswordReset)}
    </View>
  );

  // ---------------------------------------------------------------------------
  // FORGOT PASSWORD VIEW
  // ---------------------------------------------------------------------------
  const renderForgotPassword = () => (
    <View>
      <Text style={styles.subtitle}>Enter your email address and we'll send you a link to reset your password.</Text>

      <Text style={styles.label}>Email Address</Text>
      <TextInput
        style={styles.input}
        value={forgotEmail}
        onChangeText={setForgotEmail}
        placeholder="Enter your email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={handleForgotPasswordSubmit}
      />

      {renderSubmitButton('Send Reset Link', 'Sending...', handleForgotPasswordSubmit)}

      <Pressable
        style={styles.linkButton}
        onPress={() => {
          clearMessages();
          setView('login');
        }}
      >
        <Text style={styles.linkText}>Back to sign in</Text>
      </Pressable>
    </View>
  );

  // ---------------------------------------------------------------------------
  // DISCLAIMERS VIEW
  // ---------------------------------------------------------------------------
  const renderDisclaimers = () => {
    if (!pendingAuth?.pendingDisclaimers) return null;

    return (
      <View>
        <Text style={styles.subtitle}>Please review and accept the following before continuing.</Text>
        {pendingAuth.pendingDisclaimers.map((d: PendingDisclaimerModel) => (
          <View key={d.disclaimerId} style={styles.disclaimerItem}>
            <Text style={styles.disclaimerTitle}>{d.title}</Text>
            {d.changeNotes && d.previouslyAcceptedVersion != null && (
              <Text style={styles.disclaimerChangeNotes}>What changed: {d.changeNotes}</Text>
            )}
            <ScrollView style={styles.disclaimerContent} nestedScrollEnabled>
              <Text style={styles.disclaimerText}>
                {d.contentFormat === 'html' ? renderHtmlAsText(d.content) : d.content}
              </Text>
            </ScrollView>
          </View>
        ))}

        {renderSubmitButton('Accept & Continue', 'Accepting...', handleAcceptDisclaimers)}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{resolveTitle()}</Text>
          {renderAlert()}

          {view === 'login' && renderLogin()}
          {view === 'register' && renderRegister()}
          {view === 'twoFactor' && renderTwoFactor()}
          {view === 'passwordReset' && renderPasswordReset()}
          {view === 'forgotPassword' && renderForgotPassword()}
          {view === 'disclaimers' && renderDisclaimers()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* Built from the active theme rather than at module scope, so the token vocabulary the web
   exposes as `--ww-*` reaches these components too. `#000` stays literal: it is a shadow, not a
   themeable colour. */
const createStyles = (theme: WildwoodTheme) =>
  StyleSheet.create({
  container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      backgroundColor: theme.bgPrimary,
      borderRadius: theme.borderRadiusLg,
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
      marginBottom: 20,
      color: theme.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      // `inputBg`, not `bgSecondary`: the web has a dedicated --ww-input-bg, and an app porting
      // its palette by token name expects setting it to change the field, not the page.
      backgroundColor: theme.inputBg,
      color: theme.textPrimary,
    },
    codeInput: {
      textAlign: 'center',
      fontSize: 24,
      letterSpacing: 8,
      fontWeight: '600',
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
      color: theme.primaryDark,
      fontSize: 14,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: theme.primaryDark,
      borderRadius: theme.borderRadius,
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
      color: theme.btnPrimaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 12,
      marginTop: 8,
    },
    linkText: {
      color: theme.primaryDark,
      fontSize: 14,
    },
    footer: {
      marginTop: 8,
    },
    alertError: {
      backgroundColor: theme.dangerBg,
      borderRadius: theme.borderRadius,
      padding: 12,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.danger,
    },
    alertErrorText: {
      color: theme.dangerText,
      fontSize: 14,
    },
    alertSuccess: {
      backgroundColor: theme.successBg,
      borderRadius: theme.borderRadius,
      padding: 12,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.success,
    },
    alertSuccessText: {
      color: theme.successText,
      fontSize: 14,
    },

    // Social/OAuth
    socialSection: {
      marginTop: 20,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.borderColor,
    },
    dividerText: {
      marginHorizontal: 12,
      color: theme.textMuted,
      fontSize: 13,
    },
    socialButton: {
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: theme.bgPrimary,
    },
    socialButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    socialButtonIcon: {
      fontSize: 18,
    },
    socialButtonText: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.textPrimary,
    },

    // 2FA
    twoFaMethodRow: {
      flexDirection: 'row',
      marginBottom: 16,
      gap: 8,
    },
    twoFaMethodButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
      paddingVertical: 10,
      alignItems: 'center',
    },
    twoFaMethodActive: {
      borderColor: theme.primary,
      backgroundColor: theme.infoBg,
    },
    twoFaMethodText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textMuted,
    },
    twoFaMethodTextActive: {
      color: theme.primaryDark,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: theme.borderRadiusSm,
      borderWidth: 2,
      borderColor: theme.borderColor,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    checkboxChecked: {
      backgroundColor: theme.primaryDark,
      borderColor: theme.primary,
    },
    checkmark: {
      color: theme.btnPrimaryText,
      fontSize: 14,
      fontWeight: '700',
    },
    checkboxLabel: {
      fontSize: 14,
      color: theme.textPrimary,
    },

    // Password reset
    passwordRequirements: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 8,
      lineHeight: 18,
    },

    // Disclaimers
    disclaimerItem: {
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
      padding: 16,
      marginBottom: 12,
    },
    disclaimerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 8,
    },
    disclaimerChangeNotes: {
      fontSize: 13,
      color: theme.warningText,
      backgroundColor: theme.warningBg,
      padding: 8,
      borderRadius: theme.borderRadiusSm,
      marginBottom: 8,
    },
    disclaimerContent: {
      maxHeight: 200,
      backgroundColor: theme.bgSecondary,
      borderRadius: theme.borderRadiusSm,
      padding: 12,
    },
    disclaimerText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 20,
    },
  });
