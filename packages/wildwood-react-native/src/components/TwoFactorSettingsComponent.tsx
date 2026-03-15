import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Share,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTwoFactorLogic } from '@wildwood/react-shared';

export interface TwoFactorSettingsComponentProps {
  onStatusChange?: (enabled: boolean) => void;
  style?: ViewStyle;
}

export function TwoFactorSettingsComponent({ onStatusChange, style }: TwoFactorSettingsComponentProps) {
  const {
    // State
    view,
    emailCode,
    authenticatorCode,
    authenticatorQrUri,
    authenticatorSecret,
    recoveryCodes,
    recoveryCodeCount,
    successMessage,

    // From useTwoFactor
    status,
    credentials,
    trustedDevices,
    loading,
    error,
    revokeTrustedDevice,

    // Handlers
    handleEnrollEmail,
    handleVerifyEmail,
    handleBeginAuthenticator,
    handleCompleteAuthenticator,
    handleRemoveCredential,
    handleViewRecoveryCodes,
    handleRegenerateCodes,
    handleViewTrustedDevices,
    handleRevokeAllDevices,
    handleSetPrimary,
    cancelView,
    setEmailCode,
    setAuthenticatorCode,
  } = useTwoFactorLogic({
    onStatusChange,
    confirmAction: (title, message) =>
      new Promise((resolve) =>
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
        ]),
      ),
  });

  const [copiedKey, setCopiedKey] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleShareKey = useCallback(async () => {
    try {
      await Share.share({ message: authenticatorSecret });
      setCopiedKey(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedKey(false), 2000);
    } catch (err) {
      console.warn('Failed to share key:', err);
    }
  }, [authenticatorSecret]);

  const handleShareRecoveryCodes = useCallback(async () => {
    try {
      const codesText = recoveryCodes.join('\n');
      await Share.share({
        message: `Recovery Codes:\n\n${codesText}\n\nSave these codes in a safe place. Each code can only be used once.`,
      });
    } catch (err) {
      console.warn('Failed to share recovery codes:', err);
    }
  }, [recoveryCodes]);

  // ---- Render helpers ----

  const renderOverview = () => (
    <View>
      {/* Status badge */}
      <View style={styles.statusRow}>
        <Text style={styles.sectionTitle}>Two-Factor Authentication</Text>
        <View style={[styles.badge, status?.isEnabled ? styles.badgeSuccess : styles.badgeWarning]}>
          <Text style={[styles.badgeText, status?.isEnabled ? styles.badgeSuccessText : styles.badgeWarningText]}>
            {status?.isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      {/* Enrolled methods */}
      <Text style={styles.heading}>Enrolled Methods</Text>
      {credentials.length === 0 ? (
        <Text style={styles.mutedText}>No two-factor methods enrolled.</Text>
      ) : (
        <View style={styles.listContainer}>
          {credentials.map((cred) => (
            <View key={cred.id} style={styles.listItem}>
              <View style={styles.listItemInfo}>
                <View style={styles.credentialTitleRow}>
                  <Text style={styles.listItemTitle}>{cred.providerType}</Text>
                  {cred.isPrimary && (
                    <View style={[styles.badge, styles.badgeSuccess, styles.badgeSmall]}>
                      <Text style={[styles.badgeText, styles.badgeSuccessText, styles.badgeSmallText]}>Primary</Text>
                    </View>
                  )}
                </View>
                {cred.displayName ? <Text style={styles.mutedText}>{cred.displayName}</Text> : null}
              </View>
              <View style={styles.credentialActions}>
                {!cred.isPrimary && credentials.length > 1 && (
                  <Pressable
                    style={[styles.buttonOutline, styles.buttonSmall, loading && styles.buttonDisabled]}
                    onPress={() => handleSetPrimary(cred.id)}
                    disabled={loading}
                  >
                    <Text style={styles.buttonOutlineText}>Set Primary</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.buttonDanger, styles.buttonSmall, loading && styles.buttonDisabled]}
                  onPress={() => handleRemoveCredential(cred.id)}
                  disabled={loading}
                >
                  <Text style={styles.buttonDangerText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.buttonOutline, loading && styles.buttonDisabled]}
          onPress={handleEnrollEmail}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#007AFF" size="small" />
          ) : (
            <Text style={styles.buttonOutlineText}>Add Email</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.buttonOutline, loading && styles.buttonDisabled]}
          onPress={handleBeginAuthenticator}
          disabled={loading}
        >
          <Text style={styles.buttonOutlineText}>Add Authenticator</Text>
        </Pressable>
        {status?.isEnabled && (
          <>
            <Pressable
              style={[styles.buttonOutline, loading && styles.buttonDisabled]}
              onPress={handleViewRecoveryCodes}
              disabled={loading}
            >
              <Text style={styles.buttonOutlineText}>Recovery Codes</Text>
            </Pressable>
            <Pressable
              style={[styles.buttonOutline, loading && styles.buttonDisabled]}
              onPress={handleViewTrustedDevices}
              disabled={loading}
            >
              <Text style={styles.buttonOutlineText}>Trusted Devices</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );

  const renderEnrollEmail = () => (
    <View style={styles.card}>
      <Text style={styles.heading}>Verify Email</Text>
      <Text style={styles.mutedText}>Enter the code sent to your email address.</Text>
      <TextInput
        style={styles.codeInput}
        value={emailCode}
        onChangeText={setEmailCode}
        maxLength={6}
        keyboardType="number-pad"
        placeholder="000000"
        placeholderTextColor="#999"
        editable={!loading}
      />
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={handleVerifyEmail}
          disabled={loading || emailCode.length < 6}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonPrimaryText}>Verify</Text>
          )}
        </Pressable>
        <Pressable style={styles.buttonOutline} onPress={cancelView}>
          <Text style={styles.buttonOutlineText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEnrollAuthenticator = () => (
    <View style={styles.card}>
      <Text style={styles.heading}>Setup Authenticator</Text>
      <Text style={styles.mutedText}>Scan the QR code with your authenticator app, or enter the key manually.</Text>

      {authenticatorQrUri ? (
        <View style={styles.qrContainer}>
          <Image source={{ uri: authenticatorQrUri }} style={styles.qrImage} resizeMode="contain" />
        </View>
      ) : null}

      {authenticatorSecret ? (
        <View style={styles.manualKeyContainer}>
          <Text style={styles.manualKeyLabel}>Manual Key:</Text>
          <View style={styles.manualKeyRow}>
            <Text style={[styles.manualKeyValue, styles.manualKeyFlex]} selectable>
              {authenticatorSecret}
            </Text>
            <Pressable style={[styles.buttonOutline, styles.buttonSmall, styles.copyButton]} onPress={handleShareKey}>
              <Text style={styles.buttonOutlineText}>{copiedKey ? 'Shared!' : 'Share'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.inputLabel}>Verification Code</Text>
      <TextInput
        style={styles.codeInput}
        value={authenticatorCode}
        onChangeText={setAuthenticatorCode}
        maxLength={6}
        keyboardType="number-pad"
        placeholder="000000"
        placeholderTextColor="#999"
        editable={!loading}
      />
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={handleCompleteAuthenticator}
          disabled={loading || authenticatorCode.length < 6}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonPrimaryText}>Verify & Enable</Text>
          )}
        </Pressable>
        <Pressable style={styles.buttonOutline} onPress={cancelView}>
          <Text style={styles.buttonOutlineText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderRecoveryCodes = () => (
    <View style={styles.card}>
      <Text style={styles.heading}>Recovery Codes</Text>
      {recoveryCodes.length > 0 ? (
        <>
          <Text style={styles.mutedText}>Save these codes in a safe place. Each code can only be used once.</Text>
          <View style={styles.codeGrid}>
            {recoveryCodes.map((code, i) => (
              <View key={i} style={styles.recoveryCodeItem}>
                <Text style={styles.recoveryCodeText} selectable>
                  {code}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.mutedText}>
            You have {recoveryCodeCount} recovery code{recoveryCodeCount !== 1 ? 's' : ''} remaining.
          </Text>
          {recoveryCodeCount <= 2 && (
            <View style={styles.alertWarning}>
              <Text style={styles.alertWarningText}>
                {recoveryCodeCount === 0
                  ? 'You have no recovery codes remaining. Regenerate new codes now to avoid being locked out.'
                  : 'You are running low on recovery codes. Consider regenerating new codes.'}
              </Text>
            </View>
          )}
        </>
      )}
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.buttonWarning, loading && styles.buttonDisabled]}
          onPress={handleRegenerateCodes}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonWarningText}>Regenerate Codes</Text>
          )}
        </Pressable>
        {recoveryCodes.length > 0 && (
          <Pressable
            style={[styles.buttonOutline, loading && styles.buttonDisabled]}
            onPress={handleShareRecoveryCodes}
            disabled={loading}
          >
            <Text style={styles.buttonOutlineText}>Share Codes</Text>
          </Pressable>
        )}
        <Pressable style={styles.buttonOutline} onPress={cancelView}>
          <Text style={styles.buttonOutlineText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderTrustedDevices = () => (
    <View style={styles.card}>
      <Text style={styles.heading}>Trusted Devices</Text>
      {trustedDevices.length === 0 ? (
        <Text style={styles.mutedText}>No trusted devices.</Text>
      ) : (
        <View style={styles.listContainer}>
          {trustedDevices.map((device) => (
            <View key={device.id} style={styles.listItem}>
              <View style={styles.listItemInfo}>
                <Text style={styles.listItemTitle}>{device.deviceName ?? 'Unknown Device'}</Text>
                {device.lastUsedAt ? (
                  <Text style={styles.mutedText}>Last used: {new Date(device.lastUsedAt).toLocaleDateString()}</Text>
                ) : null}
              </View>
              <Pressable
                style={[styles.buttonDanger, styles.buttonSmall, loading && styles.buttonDisabled]}
                onPress={async () => {
                  await revokeTrustedDevice(device.id);
                }}
                disabled={loading}
              >
                <Text style={styles.buttonDangerText}>Revoke</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.actionsRow}>
        {trustedDevices.length > 0 && (
          <Pressable
            style={[styles.buttonDanger, loading && styles.buttonDisabled]}
            onPress={handleRevokeAllDevices}
            disabled={loading}
          >
            <Text style={styles.buttonDangerText}>Revoke All</Text>
          </Pressable>
        )}
        <Pressable style={styles.buttonOutline} onPress={cancelView}>
          <Text style={styles.buttonOutlineText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.contentContainer}>
      {/* Loading overlay */}
      {loading && view === 'overview' && credentials.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* Error alert */}
      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}

      {/* Success alert */}
      {successMessage !== '' ? (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      ) : null}

      {view === 'overview' && renderOverview()}
      {view === 'enrollEmail' && renderEnrollEmail()}
      {view === 'enrollAuthenticator' && renderEnrollAuthenticator()}
      {view === 'recoveryCodes' && renderRecoveryCodes()}
      {view === 'trustedDevices' && renderTrustedDevices()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Alerts
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
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  alertWarningText: {
    color: '#92400E',
    fontSize: 14,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Badge
  badge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  badgeSuccessText: {
    color: '#166534',
  },
  badgeWarningText: {
    color: '#92400E',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeSmallText: {
    fontSize: 11,
  },

  // Headings & text
  heading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  mutedText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  // List
  listContainer: {
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  credentialTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  credentialActions: {
    flexDirection: 'row',
    gap: 8,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },

  // Code input
  codeInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1a1a1a',
    backgroundColor: '#F9FAFB',
    marginVertical: 12,
  },

  // QR code
  qrContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  qrImage: {
    width: 200,
    height: 200,
  },

  // Manual key
  manualKeyContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  manualKeyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  manualKeyValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },
  manualKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualKeyFlex: {
    flex: 1,
  },
  copyButton: {
    borderColor: '#007AFF',
  },

  // Recovery code grid
  codeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  recoveryCodeItem: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recoveryCodeText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#1a1a1a',
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonOutlineText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDanger: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDangerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonWarning: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonWarningText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonSmall: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
