import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { usePasskeyManagement, passkeyDisplayName } from '@wildwood/react-shared';
import type { PasskeyCredentialCreator } from '@wildwood/react-shared';
import type { UserPasskey } from '@wildwood/core';
import { passkeyManagementBody, passkeyMetaLine, PASSKEY_TEST_IDS as IDS } from './passkeyManagementView';

export interface PasskeyManagementComponentProps {
  /** Defaults to the client's configured appId. */
  appId?: string;
  style?: ViewStyle;
  onPasskeysChanged?: () => void;
  /**
   * The platform passkey creation ceremony (e.g. a react-native-passkey adapter) resolving to the
   * base64url credential JSON. React Native takes no passkey dependency of its own — the same
   * injected-seam idiom as `paymentActionHandler` — so without one, passkeys can be listed,
   * renamed and removed but not added here.
   */
  createCredential?: PasskeyCredentialCreator;
}

/**
 * The signed-in user's passkeys: add (through the host's ceremony), rename, remove. Port of .NET
 * `PasskeyManagementComponent` over the shared `usePasskeyManagement` hook.
 */
export function PasskeyManagementComponent({
  appId,
  style,
  onPasskeysChanged,
  createCredential,
}: PasskeyManagementComponentProps) {
  const { loaded, appEnabled, canRegister, passkeys, loading, error, successMessage, register, rename, remove } =
    usePasskeyManagement({ appId, createCredential, onPasskeysChanged });

  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startRename = (p: UserPasskey) => {
    setConfirmDeleteId(null);
    setRenamingId(p.id);
    setRenameValue(passkeyDisplayName(p));
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const body = passkeyManagementBody({ loaded, appEnabled });

  return (
    <View style={[styles.container, style]} testID={IDS.root}>
      {error ? (
        <View style={styles.alertError} testID={IDS.error} accessibilityRole="alert">
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}
      {successMessage ? (
        <View style={styles.alertSuccess} testID={IDS.success}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      ) : null}

      {body === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Loading passkeys..." />
        </View>
      )}

      {body === 'app-disabled' && (
        <Text style={styles.muted} testID={IDS.noticeAppDisabled}>
          Passkeys are not enabled for this app.
        </Text>
      )}

      {body === 'list' && (
        <>
          <Text style={[styles.muted, styles.intro]}>
            A passkey signs you in with your device&apos;s fingerprint, face or PIN instead of a password. A passkey
            that verifies you counts as two-factor authentication on its own.
          </Text>

          {passkeys.length === 0 ? (
            <Text style={styles.intro} testID={IDS.empty}>
              You have no passkeys yet.
            </Text>
          ) : (
            <View style={styles.list} testID={IDS.list}>
              {passkeys.map((p, index) => (
                <View key={p.id} style={[styles.item, index > 0 && styles.itemDivider]} testID={IDS.row(p.id)}>
                  {renamingId === p.id ? (
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, styles.flex]}
                        maxLength={100}
                        accessibilityLabel="Passkey name"
                        value={renameValue}
                        onChangeText={setRenameValue}
                        testID={IDS.renameInput}
                      />
                      <Pressable
                        style={[styles.btn, styles.btnPrimary, (loading || !renameValue.trim()) && styles.disabled]}
                        disabled={loading || !renameValue.trim()}
                        onPress={async () => {
                          if (await rename(p.id, renameValue)) cancelRename();
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnPrimaryText}>Save</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.btn, styles.btnOutline]}
                        onPress={cancelRename}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnOutlineText}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.row}>
                      <View style={styles.flex}>
                        <Text style={styles.name}>{passkeyDisplayName(p)}</Text>
                        <Text style={styles.meta}>{passkeyMetaLine(p)}</Text>
                      </View>
                      <Pressable
                        style={[styles.btn, styles.btnOutline, loading && styles.disabled]}
                        disabled={loading}
                        onPress={() => startRename(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${passkeyDisplayName(p)}`}
                      >
                        <Text style={styles.btnOutlineText}>Rename</Text>
                      </Pressable>
                      {confirmDeleteId === p.id ? (
                        <>
                          <Pressable
                            style={[styles.btn, styles.btnDanger, loading && styles.disabled]}
                            disabled={loading}
                            onPress={async () => {
                              if (await remove(p)) setConfirmDeleteId(null);
                            }}
                            accessibilityRole="button"
                            testID={IDS.confirmDelete}
                          >
                            <Text style={styles.btnPrimaryText}>Remove</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.btn, styles.btnOutline]}
                            onPress={() => setConfirmDeleteId(null)}
                            accessibilityRole="button"
                          >
                            <Text style={styles.btnOutlineText}>Keep</Text>
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          style={[styles.btn, styles.btnOutline, loading && styles.disabled]}
                          disabled={loading}
                          onPress={() => setConfirmDeleteId(p.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${passkeyDisplayName(p)}`}
                        >
                          <Text style={styles.btnOutlineText}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {canRegister ? (
            <View style={styles.add}>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                maxLength={100}
                placeholder="e.g. Work phone"
                accessibilityLabel="Name (optional)"
                value={newName}
                onChangeText={setNewName}
                testID={IDS.newName}
              />
              <Pressable
                style={[styles.btn, styles.btnPrimary, styles.addBtn, loading && styles.disabled]}
                disabled={loading}
                onPress={async () => {
                  if (await register(newName)) setNewName('');
                }}
                accessibilityRole="button"
                testID={IDS.add}
              >
                <Text style={styles.btnPrimaryText}>Add a passkey</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.muted} testID={IDS.noticeUnsupported}>
              Passkeys cannot be added on this device.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  flex: { flex: 1 },
  loading: { alignItems: 'center', paddingVertical: 24 },
  muted: { color: '#666', fontSize: 14 },
  intro: { marginBottom: 12 },
  alertError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertErrorText: { color: '#991B1B', fontSize: 14 },
  alertSuccess: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  alertSuccessText: { color: '#166534', fontSize: 14 },
  list: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, marginBottom: 16 },
  item: { padding: 12 },
  itemDivider: { borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  label: { fontSize: 13, color: '#374151', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1a1a1a',
  },
  add: { marginTop: 4 },
  addBtn: { marginTop: 8, alignSelf: 'flex-start' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2563EB' },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnDanger: { backgroundColor: '#DC2626' },
  btnOutline: { borderWidth: 1, borderColor: '#D1D5DB' },
  btnOutlineText: { color: '#374151', fontSize: 14 },
  disabled: { opacity: 0.5 },
});
