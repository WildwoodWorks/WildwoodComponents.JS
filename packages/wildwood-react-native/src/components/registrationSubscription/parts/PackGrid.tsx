// The pack grid: what an app sells alongside a plan.
//
// The grouping rules are the web's, which had them first and got them right: an EMPTY group is
// dropped rather than rendered as a heading with nothing under it, and a pack whose category matches
// no group is NOT dropped - it lands in a trailing catch-all, because a pack the company sells and
// has priced going silently missing from the screen that sells it is the one failure this must not
// have. `groupAddOns` holds that rule, so it can be tested without a renderer.
//
// Every price is the live one off the catalog. A pack the operator has defined but not priced says
// so instead of implying it is free.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierAddOnModel } from '@wildwood/core';
import { resolvePriceOption, trialLabel } from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { wwGroupTestId, wwPackTestId } from '../testIds';
import type { AddOnGroup, AddOnPresentation, PricingPackSelection } from '../types';
import { continueWithPacksLabel, groupAddOns, packPriceText } from '../views/pricingViewModel';

export interface PackGridProps {
  /** Active packs in catalog order. */
  addOns: AppTierAddOnModel[];
  /** The currency every price in the grid is quoted in. */
  currency: string;
  /** Headings to file packs under. Omitted, the packs render as one flat grid. */
  groups?: AddOnGroup[];
  /** Host copy for a pack. */
  describeAddOn?: (addOn: AppTierAddOnModel) => AddOnPresentation | undefined;
  selection: PricingPackSelection;
  /** The currently selected pack ids (multi-select only). */
  selectedIds: string[];
  /** Toggle one pack (multi-select only). */
  onToggle: (addOnId: string) => void;
  /** Take one pack straight through (single-select only). */
  onChoose: (addOn: AppTierAddOnModel) => void;
  /** Continue with everything selected (multi-select only). */
  onContinue: () => void;
  labels: RegistrationSubscriptionLabels;
  style?: ViewStyle;
}

interface PackCardBodyProps {
  addOn: AppTierAddOnModel;
  currency: string;
  presentation?: AddOnPresentation;
  labels: RegistrationSubscriptionLabels;
}

/** The inside of a pack card, shared by the tick-to-select and the one-CTA variants. */
function PackCardBody({ addOn, currency, presentation, labels }: PackCardBodyProps) {
  const blurb = presentation?.blurb ?? addOn.description;
  const trial = trialLabel(resolvePriceOption(addOn)?.trialDays);
  const icon = presentation?.icon;

  return (
    <>
      <View style={styles.cardTitle}>
        {typeof icon === 'string' || typeof icon === 'number' ? (
          <Text style={styles.cardIcon}>{icon}</Text>
        ) : (
          (icon ?? null)
        )}
        <Text style={styles.cardName}>{addOn.name}</Text>
      </View>

      {blurb ? <Text style={styles.cardBlurb}>{blurb}</Text> : null}
      {presentation?.meter ? <Text style={styles.cardMeter}>{presentation.meter}</Text> : null}

      <Text style={[styles.cardPrice, resolvePriceOption(addOn) ? null : styles.cardPriceUnavailable]}>
        {packPriceText(addOn, currency, labels)}
      </Text>

      {trial ? <Text style={styles.cardTrial}>{trial}</Text> : null}

      {addOn.features?.length ? (
        <View style={styles.cardFeatures}>
          {addOn.features.map((feature) => (
            <Text style={styles.cardFeature} key={feature.id}>
              {feature.displayName}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

export function PackGrid({
  addOns,
  currency,
  groups,
  describeAddOn,
  selection,
  selectedIds,
  onToggle,
  onChoose,
  onContinue,
  labels,
  style,
}: PackGridProps) {
  const grouped = groupAddOns(addOns, groups, labels.morePacks);
  if (grouped.length === 0) return null;

  const multi = selection === 'multi';
  const selected = new Set(selectedIds);
  const count = selectedIds.length;

  return (
    <View style={[styles.packs, style]}>
      {grouped.map((group) => (
        <View style={styles.group} key={group.id} testID={wwGroupTestId(group.id)}>
          {group.title ? <Text style={styles.groupTitle}>{group.title}</Text> : null}
          {group.blurb ? <Text style={styles.groupBlurb}>{group.blurb}</Text> : null}

          <View style={styles.packGrid}>
            {group.addOns.map((addOn) => {
              const presentation = describeAddOn?.(addOn);
              const isSelected = selected.has(addOn.id);
              const body = (
                <PackCardBody addOn={addOn} currency={currency} presentation={presentation} labels={labels} />
              );

              if (multi) {
                return (
                  <Pressable
                    key={addOn.id}
                    style={[styles.packCard, isSelected ? styles.packCardSelected : null]}
                    accessibilityRole="button"
                    accessibilityLabel={formatLabel(labels.packSelectNamed, { name: addOn.name })}
                    accessibilityState={{ selected: isSelected }}
                    testID={wwPackTestId(addOn.id)}
                    onPress={() => onToggle(addOn.id)}
                  >
                    {body}
                  </Pressable>
                );
              }

              return (
                <View style={styles.packCard} key={addOn.id} testID={wwPackTestId(addOn.id)}>
                  {body}
                  <Pressable
                    style={styles.outlineButton}
                    accessibilityRole="button"
                    accessibilityLabel={formatLabel(labels.packSelectNamed, { name: addOn.name })}
                    onPress={() => onChoose(addOn)}
                  >
                    <Text style={styles.outlineButtonText}>{labels.packSelect}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {multi ? (
        <Pressable
          style={[styles.primaryButton, count === 0 ? styles.buttonDisabled : null]}
          accessibilityRole="button"
          accessibilityState={{ disabled: count === 0 }}
          disabled={count === 0}
          onPress={onContinue}
          testID="packs-continue"
        >
          <Text style={styles.primaryButtonText}>{continueWithPacksLabel(count, labels)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  packs: { gap: 16 },
  group: { gap: 8 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  groupBlurb: { fontSize: 14, color: '#666', lineHeight: 20 },
  packGrid: { gap: 12 },
  packCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    gap: 6,
  },
  packCardSelected: { borderColor: '#007AFF', borderWidth: 2 },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardIcon: { fontSize: 16 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  cardBlurb: { fontSize: 14, color: '#666', lineHeight: 20 },
  cardMeter: { fontSize: 13, color: '#666' },
  cardPrice: { fontSize: 18, fontWeight: '700', color: '#007AFF' },
  cardPriceUnavailable: { fontSize: 14, fontWeight: '500', color: '#999' },
  cardTrial: { fontSize: 13, fontWeight: '600', color: '#166534' },
  cardFeatures: { gap: 2 },
  cardFeature: { fontSize: 13, color: '#333' },
  outlineButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    marginTop: 6,
  },
  outlineButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
