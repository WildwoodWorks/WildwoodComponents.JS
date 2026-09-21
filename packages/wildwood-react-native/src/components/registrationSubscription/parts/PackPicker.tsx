// Picking packs and buying them, in one sheet.
//
// Three stages behind one modal, the same three the web's `PackPicker` walks: the grid, the checkout
// and what became of each pack. The stage is derived from what has happened rather than stored, so a
// re-render cannot land the sheet on a stage its data does not support.
//
// The one rule worth stating: the overlay closes the sheet only BEFORE the checkout starts and again
// AFTER the outcomes are in. While packs are being bought there is a card and a server in flight, and
// a stray tap outside the sheet must not walk away from it.

import { useCallback, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import type { AppTierAddOnModel, PublicCatalog } from '@wildwood/core';
import type {
  PaymentActionAdapter,
  RegistrationSubscriptionError,
  RegistrationSubscriptionLabels,
  SignupPackOutcome,
} from '@wildwood/react-shared';
import { togglePackSelection } from '../views/pricingViewModel';
import { wwModalTestId } from '../testIds';
import { PackCheckout } from './PackCheckout';
import { PackGrid } from './PackGrid';
import { PackOutcomeList } from './PackOutcomeList';

export interface PackPickerProps {
  visible: boolean;
  appId: string;
  /** The packs on offer - typically everything the account does not already have. */
  addOns: AppTierAddOnModel[];
  /** The live catalog, so a selection reads back in catalog order and stays inside the cap. */
  catalog: PublicCatalog | null;
  currency: string;
  labels: RegistrationSubscriptionLabels;
  paymentActionHandler?: PaymentActionAdapter;
  /** Fired once the outcomes are in, so the host can refresh what the account now has. */
  onBought?: (packs: SignupPackOutcome[]) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
  onClose: () => void;
}

export function PackPicker({
  visible,
  appId,
  addOns,
  catalog,
  currency,
  labels,
  paymentActionHandler,
  onBought,
  onError,
  onClose,
}: PackPickerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [buying, setBuying] = useState(false);
  const [outcomes, setOutcomes] = useState<SignupPackOutcome[] | null>(null);

  const togglePack = useCallback(
    (addOnId: string) => setSelectedIds((current) => togglePackSelection(catalog, current, addOnId)),
    [catalog],
  );

  const finish = useCallback(
    (packs: SignupPackOutcome[]) => {
      setOutcomes(packs);
      setBuying(false);
      onBought?.(packs);
    },
    [onBought],
  );

  const close = useCallback(() => {
    setSelectedIds([]);
    setBuying(false);
    setOutcomes(null);
    onClose();
  }, [onClose]);

  // Only before anything is charged, and again once everything has been.
  const dismissable = !buying;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismissable ? close : undefined}>
      <View style={styles.overlay}>
        <View style={styles.sheet} testID={wwModalTestId('packs')}>
          <View style={styles.header}>
            <Text style={styles.title}>{labels.addPacksTitle}</Text>
            {dismissable ? (
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel={labels.cancel}>
                <Text style={styles.close}>{'×'}</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {outcomes ? (
              <PackOutcomeList packs={outcomes} labels={labels} />
            ) : buying ? (
              <PackCheckout
                appId={appId}
                items={selectedIds.map((addOnId) => ({ addOnId }))}
                names={Object.fromEntries(addOns.map((addOn) => [addOn.id, addOn.name]))}
                labels={labels}
                paymentActionHandler={paymentActionHandler}
                onFinished={finish}
                onError={onError}
              />
            ) : (
              <PackGrid
                addOns={addOns}
                currency={currency}
                selection="multi"
                selectedIds={selectedIds}
                onToggle={togglePack}
                onChoose={(addOn) => {
                  setSelectedIds([addOn.id]);
                  setBuying(true);
                }}
                onContinue={() => setBuying(true)}
                labels={labels}
              />
            )}
          </ScrollView>

          {/* The sheet's own id became `modal:packs`; this one deliberately did not follow it. The
              `modal:` prefix names a modal, and its value space is the web's two `data-ww-modal`
              values - `modal:packs-continue` would assert a third sheet by that name. This is a
              button inside the packs sheet, no other stack has a counterpart for it (the web's
              outcome Continue carries no hook at all), so there is no contract string to match and
              renaming it would only break hosts. */}
          {outcomes ? (
            <Pressable
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel={labels.continueLabel}
              onPress={close}
              testID="packs-modal-continue"
            >
              <Text style={styles.primaryButtonText}>{labels.continueLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  close: { fontSize: 24, color: '#666', lineHeight: 24 },
  body: { padding: 16, gap: 16 },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginHorizontal: 16,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
