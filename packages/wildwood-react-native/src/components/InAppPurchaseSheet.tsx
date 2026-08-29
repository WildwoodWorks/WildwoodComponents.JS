import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import type { UseInAppPurchasesReturn } from '../hooks/useInAppPurchases';
import { useWildwoodTheme } from '../styles/ThemeContext';
import type { WildwoodTheme } from '../styles/theme';

export interface InAppPurchaseSheetProps {
  visible: boolean;
  /** The Wildwood tier being bought. Must be mapped to a store product in the hook's `products`. */
  tierId: string;
  pricingId?: string;
  /** Display name for the tier. Falls back to the store product's title, then the tier id. */
  tierName?: string;
  /** The live {@link useInAppPurchases} return — the sheet holds no store logic of its own. */
  iap: UseInAppPurchasesReturn;
  onClose: () => void;
  /** Called with the Wildwood payment transaction id once the receipt validates. */
  onPurchased?: (transactionId: string) => void;
}

/**
 * A convenience sheet over {@link useInAppPurchases}: the store's own localized price, a Buy button,
 * and the Restore Purchases button App Store review requires. Every store interaction lives in the
 * hook, so an app that wants its own paywall UI can drop this component and keep the hook.
 */
export function InAppPurchaseSheet({
  visible,
  tierId,
  pricingId,
  tierName,
  iap,
  onClose,
  onPurchased,
}: InAppPurchaseSheetProps) {
  const theme = useWildwoodTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const product = useMemo(
    () =>
      iap.products.find((p) => p.tierId === tierId && (pricingId === undefined || p.pricingId === pricingId)) ??
      iap.products.find((p) => p.tierId === tierId),
    [iap.products, tierId, pricingId],
  );

  const busy = iap.purchaseState === 'purchasing' || iap.purchaseState === 'validating';
  const heading = tierName ?? product?.title ?? tierId;

  const handleBuy = useCallback(async () => {
    setRestoreMessage(null);
    try {
      const transactionId = await iap.purchaseTier(tierId, pricingId);
      if (transactionId) onPurchased?.(transactionId);
    } catch {
      // purchaseTier only rejects when a purchase is already running; iap.error carries the rest.
    }
  }, [iap, tierId, pricingId, onPurchased]);

  const handleRestore = useCallback(async () => {
    setRestoreMessage(null);
    const result = await iap.restorePurchases();
    if (result.error) {
      setRestoreMessage(result.error);
      return;
    }
    setRestoreMessage(
      result.restored > 0
        ? `Restored ${result.restored} purchase${result.restored === 1 ? '' : 's'}.`
        : 'No previous purchases to restore.',
    );
    if (result.restored > 0 && result.transactionId) onPurchased?.(result.transactionId);
  }, [iap, onPurchased]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{heading}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.modalCloseIcon}>{'×'}</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* The store's price is authoritative at purchase time - never a locally formatted one. */}
            {product?.localizedPrice ? (
              <Text style={styles.price}>{product.localizedPrice}</Text>
            ) : (
              <Text style={styles.priceMuted}>Price loading{'…'}</Text>
            )}
            {product?.description ? <Text style={styles.description}>{product.description}</Text> : null}

            {!iap.available && (
              <View style={styles.alertWarning}>
                <Text style={styles.alertWarningText}>In-app purchases are unavailable on this device.</Text>
              </View>
            )}
            {iap.purchaseState === 'pending' && (
              <View style={styles.alertInfo}>
                <Text style={styles.alertInfoText}>
                  Your purchase is pending approval. Access unlocks as soon as the store confirms it.
                </Text>
              </View>
            )}
            {iap.purchaseState === 'success' && (
              <View style={styles.alertSuccess}>
                <Text style={styles.alertSuccessText}>Purchase complete.</Text>
              </View>
            )}
            {iap.error ? (
              <View style={styles.alertError}>
                <Text style={styles.alertErrorText}>{iap.error}</Text>
              </View>
            ) : null}
            {restoreMessage ? <Text style={styles.restoreMessage}>{restoreMessage}</Text> : null}
          </View>

          <View style={styles.modalFooter}>
            <Pressable
              style={[styles.buyButton, (!iap.available || busy) && styles.buttonDisabled]}
              onPress={handleBuy}
              disabled={!iap.available || busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={theme.btnPrimaryText} size="small" />
              ) : (
                <Text style={styles.buyButtonText}>
                  {product?.localizedPrice ? `Buy ${product.localizedPrice}` : 'Buy'}
                </Text>
              )}
            </Pressable>
            {/* Required by App Store review guideline 3.1.1 for any non-consumable / subscription. */}
            <Pressable
              style={[styles.secondaryButton, (!iap.available || busy) && styles.buttonDisabled]}
              onPress={handleRestore}
              disabled={!iap.available || busy}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.linkButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* Built from the active theme rather than at module scope, so the token vocabulary the web
   exposes as `--ww-*` reaches this component too. */
const createStyles = (theme: WildwoodTheme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContainer: {
      backgroundColor: theme.bgPrimary,
      borderRadius: theme.borderRadiusLg,
      width: '100%',
      maxHeight: '85%',
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
      flex: 1,
      marginRight: 8,
    },
    modalCloseIcon: {
      fontSize: 24,
      color: theme.textMuted,
      lineHeight: 24,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    price: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    priceMuted: {
      fontSize: 15,
      color: theme.textMuted,
    },
    description: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 8,
    },
    alertError: {
      backgroundColor: theme.dangerBg,
      borderRadius: theme.borderRadius,
      padding: 12,
      marginTop: 12,
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
      marginTop: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.success,
    },
    alertSuccessText: {
      color: theme.successText,
      fontSize: 14,
    },
    alertInfo: {
      backgroundColor: theme.infoBg,
      borderRadius: theme.borderRadius,
      padding: 12,
      marginTop: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.info,
    },
    alertInfoText: {
      color: theme.infoText,
      fontSize: 14,
    },
    alertWarning: {
      backgroundColor: theme.warningBg,
      borderRadius: theme.borderRadius,
      padding: 12,
      marginTop: 12,
      borderLeftWidth: 4,
      borderLeftColor: theme.warning,
    },
    alertWarningText: {
      color: theme.warningText,
      fontSize: 14,
    },
    restoreMessage: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 12,
    },
    modalFooter: {
      padding: 16,
      gap: 10,
    },
    buyButton: {
      backgroundColor: theme.primaryDark,
      borderRadius: theme.borderRadius,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buyButtonText: {
      color: theme.btnPrimaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: theme.bgSecondary,
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '500',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    linkButton: {
      paddingVertical: 8,
      alignItems: 'center',
    },
    linkButtonText: {
      color: theme.textMuted,
      fontSize: 14,
    },
  });
