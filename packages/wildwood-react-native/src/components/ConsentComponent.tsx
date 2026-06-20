import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Switch, ScrollView, Modal, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import { NON_NECESSARY_CATEGORIES, type ConsentCategory } from '@wildwood/core';
import { useConsent } from '../hooks/useConsent';

const NON_NECESSARY: ConsentCategory[] = NON_NECESSARY_CATEGORIES;

export interface ConsentComponentProps {
  /** Initialize on mount (fetch config, read GPC, compute decision). Default true. */
  autoInit?: boolean;
  /**
   * Render standalone CCPA opt-out controls ("Do Not Sell or Share", "Limit Use of Sensitive PI")
   * once the banner is dismissed - one-click, so the app can place them in a settings/footer area.
   * Default true.
   */
  showFooterOptOut?: boolean;
  style?: ViewStyle;
}

/**
 * React Native consent UI + state.
 *
 * NOTE: React Native has no DOM and no web pixels, so the script-injection half of consent does
 * NOT apply here. This component ships the banner + preferences UI and the consent-state store
 * (via useConsent). Native SDKs should check consent (useConsent().isGranted) before initializing.
 *
 * PERSISTENCE: the core engine's cookie is a no-op without a DOM. To persist consent across launches,
 * pass a synchronous `storage` adapter to createWildwoodClient's consent options (e.g. a sync MMKV
 * store, or an AsyncStorage value hydrated into memory at startup). Without one, consent is
 * session-only and the banner re-prompts on each launch.
 */
export function ConsentComponent({ autoInit = true, showFooterOptOut = true, style }: ConsentComponentProps) {
  const { config, state, shouldShowBanner, initialize, acceptAll, rejectAll, setCategories } = useConsent();
  const [showBanner, setShowBanner] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [selection, setSelection] = useState<Partial<Record<ConsentCategory, boolean>>>({});

  useEffect(() => {
    if (autoInit) {
      initialize().catch(() => {
        /* errors surfaced via hook state */
      });
    }
  }, [autoInit, initialize]);

  useEffect(() => {
    setShowBanner(shouldShowBanner);
  }, [shouldShowBanner]);

  const categoryActive = useCallback((c: ConsentCategory) => (config?.categories ?? []).includes(c), [config]);

  const openPrefs = useCallback(() => {
    const initial: Partial<Record<ConsentCategory, boolean>> = {};
    for (const c of NON_NECESSARY) {
      if (categoryActive(c)) initial[c] = state?.categories[c] === true;
    }
    setSelection(initial);
    setShowPrefs(true);
  }, [categoryActive, state]);

  const onAcceptAll = useCallback(async () => {
    await acceptAll();
    setShowBanner(false);
    setShowPrefs(false);
  }, [acceptAll]);

  const onRejectAll = useCallback(async () => {
    await rejectAll();
    setShowBanner(false);
    setShowPrefs(false);
  }, [rejectAll]);

  const onSave = useCallback(async () => {
    await setCategories(selection);
    setShowBanner(false);
    setShowPrefs(false);
  }, [setCategories, selection]);

  // One-click CCPA opt-out: turn the category off against the current granted state, post immediately.
  const optOut = useCallback(
    async (category: ConsentCategory) => {
      const next: Partial<Record<ConsentCategory, boolean>> = {};
      for (const c of NON_NECESSARY) {
        if (categoryActive(c)) next[c] = c === category ? false : state?.categories[c] === true;
      }
      await setCategories(next);
      setShowBanner(false);
      setShowPrefs(false);
    },
    [categoryActive, state, setCategories],
  );

  if (!config || !config.enabled) return null;

  const text = (config.bannerText ?? {}) as Record<string, string>;
  const title = text.title ?? 'We value your privacy';
  const body = text.body ?? 'Choose which categories to allow. Necessary items are always on.';
  const acceptLabel = text.acceptAll ?? 'Accept all';
  const rejectLabel = text.rejectAll ?? 'Reject all';
  const manageLabel = text.manage ?? 'Manage preferences';

  return (
    <View style={style}>
      {showBanner && (
        <View style={styles.banner} accessibilityLabel="Cookie consent">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {config.privacyPolicyUrl ? (
            <Pressable onPress={() => Linking.openURL(config.privacyPolicyUrl!)}>
              <Text style={styles.link}>Privacy Policy</Text>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={openPrefs}>
              <Text style={styles.btnText}>{manageLabel}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onRejectAll}>
              <Text style={styles.btnText}>{rejectLabel}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onAcceptAll}>
              <Text style={styles.btnPrimaryText}>{acceptLabel}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={showPrefs} transparent animationType="slide" onRequestClose={() => setShowPrefs(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal} accessibilityViewIsModal>
            <Text style={styles.modalTitle}>Privacy preferences</Text>
            <ScrollView>
              <View style={styles.category}>
                <Text style={styles.categoryLabel}>Strictly necessary</Text>
                <Switch value disabled />
              </View>
              {NON_NECESSARY.filter(categoryActive).map((c) => (
                <View style={styles.category} key={c}>
                  <Text style={styles.categoryLabel}>{c}</Text>
                  <Switch
                    value={selection[c] === true}
                    onValueChange={(v) => setSelection((prev) => ({ ...prev, [c]: v }))}
                  />
                </View>
              ))}

              {(config.showDoNotSell || config.showLimitSensitive) && (
                <View style={styles.rights}>
                  {config.showDoNotSell && (
                    <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => optOut('Advertising')}>
                      <Text style={styles.btnText}>Do Not Sell or Share My Personal Information</Text>
                    </Pressable>
                  )}
                  {config.showLimitSensitive && (
                    <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => optOut('Sensitive')}>
                      <Text style={styles.btnText}>Limit the Use of My Sensitive Personal Information</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onRejectAll}>
                <Text style={styles.btnText}>{rejectLabel}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onSave}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!showBanner && showFooterOptOut && (config.showDoNotSell || config.showLimitSensitive) && (
        <View style={styles.footerLinks}>
          {config.showDoNotSell && (
            <Pressable onPress={() => optOut('Advertising')}>
              <Text style={styles.link}>Do Not Sell or Share</Text>
            </Pressable>
          )}
          {config.showLimitSensitive && (
            <Pressable onPress={() => optOut('Sensitive')}>
              <Text style={styles.link}>Limit Use of Sensitive PI</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: 16, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#dee2e6' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 14, color: '#495057', marginBottom: 8 },
  link: { color: '#0d6efd', textDecorationLine: 'underline', marginBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#ced4da' },
  btnSecondary: { backgroundColor: '#f8f9fa' },
  btnPrimary: { backgroundColor: '#0d6efd', borderColor: '#0d6efd' },
  btnText: { color: '#212529' },
  btnPrimaryText: { color: '#ffffff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  category: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  categoryLabel: { fontSize: 15 },
  rights: { marginTop: 12, gap: 8 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 12 },
});
