// TokenRegistrationComponent - React Native port of the React TokenRegistrationComponent
// Allows users to register using a pre-issued registration token

import { useState, useCallback } from 'react';
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
import type { AuthenticationResponse } from '@wildwood/core';
import { useWildwood } from '../hooks/useWildwood';

export interface TokenRegistrationComponentProps {
  appId?: string;
  registrationToken?: string;
  onRegistrationSuccess?: (response: AuthenticationResponse) => void;
  onRegistrationError?: (error: string) => void;
}

export function TokenRegistrationComponent({
  appId,
  registrationToken: initialToken,
  onRegistrationSuccess,
  onRegistrationError,
}: TokenRegistrationComponentProps) {
  const client = useWildwood();
  const [token, setToken] = useState(initialToken ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!token.trim()) {
      setError('Registration token is required');
      return;
    }
    if (!firstName.trim()) {
      setError('First name is required');
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

    setIsLoading(true);
    try {
      const response = await client.auth.registerWithToken({
        registrationToken: token,
        firstName,
        lastName,
        email,
        password,
        appId: appId ?? '',
        platform: Platform.OS,
        deviceInfo: `${Platform.OS} ${Platform.Version}`,
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
  }, [
    token,
    firstName,
    lastName,
    email,
    password,
    confirmPassword,
    appId,
    client,
    onRegistrationSuccess,
    onRegistrationError,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Register with Token</Text>

          {/* Error alert */}
          {error !== '' && (
            <View style={styles.alertError}>
              <Text style={styles.alertErrorText}>{error}</Text>
            </View>
          )}

          {/* Success alert */}
          {success !== '' && (
            <View style={styles.alertSuccess}>
              <Text style={styles.alertSuccessText}>{success}</Text>
            </View>
          )}

          {/* Token field - hidden when initialToken is provided */}
          {!initialToken && (
            <>
              <Text style={styles.label}>Registration Token</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="Enter your registration token"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                returnKeyType="next"
              />
            </>
          )}

          {/* Name row - first and last side by side */}
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Text style={styles.label}>First Name</Text>
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
              <Text style={styles.label}>Last Name</Text>
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

          {/* Email */}
          <Text style={styles.label}>Email</Text>
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
          <Text style={styles.label}>Password</Text>
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
            <Pressable
              style={styles.showPasswordBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.showPasswordText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          {/* Confirm Password */}
          <Text style={styles.label}>Confirm Password</Text>
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
            <Pressable
              style={styles.showPasswordBtn}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Text style={styles.showPasswordText}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </Text>
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
              <Text style={styles.primaryButtonText}>Register</Text>
            )}
          </Pressable>
        </View>
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
    marginBottom: 20,
    color: '#1a1a1a',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
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
});
