'use client';

// The pack grid: what an app sells alongside a plan.
//
// The grouping rules are ProvisionSync's, which had them first and got them right: an EMPTY group
// is dropped rather than rendered as a heading with nothing under it, and a pack whose category
// matches no group is NOT dropped — it lands in a trailing catch-all, because a pack the company
// sells and has priced going silently missing from the page that sells it is the one failure this
// must not have.
//
// Every price is the live one off the catalog. A pack the operator has defined but not priced says
// so instead of implying it is free.

import type { AppTierAddOnModel, AppTierAddOnPricingModel } from '@wildwood/core';
import { formatMoney, resolvePriceOption, trialLabel } from '@wildwood/core';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';
import type { AddOnGroup, AddOnPresentation, PricingPackSelection } from '../types.js';

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
}

/** One rendered heading and the packs under it. */
export interface PackGroupView {
  id: string;
  title?: string;
  blurb?: string;
  addOns: AppTierAddOnModel[];
}

/** The per-period suffix. An unrecognised frequency contributes nothing rather than a guess. */
function billingSuffix(billingFrequency: string | undefined): string {
  switch ((billingFrequency ?? '').trim().toLowerCase()) {
    case 'monthly':
      return '/mo';
    case 'yearly':
    case 'annually':
    case 'annual':
      return '/yr';
    case 'weekly':
      return '/wk';
    case 'daily':
      return '/day';
    // OneTime, Lifetime and anything the platform adds later: the amount stands on its own.
    default:
      return '';
  }
}

/**
 * The packs under the host's headings. Empty groups are dropped; packs matching no group land in a
 * trailing group titled by `morePacksTitle`. With no groups at all, one untitled group.
 */
export function groupAddOns(
  addOns: AppTierAddOnModel[],
  groups: AddOnGroup[] | undefined,
  morePacksTitle: string,
): PackGroupView[] {
  if (!groups || groups.length === 0) {
    return addOns.length > 0 ? [{ id: 'all', addOns }] : [];
  }

  const filed = groups
    .map((group) => ({
      id: group.id,
      title: group.title,
      blurb: group.blurb,
      addOns: addOns.filter((addOn) => group.categories.includes(addOn.category)),
    }))
    .filter((group) => group.addOns.length > 0);

  const known = new Set(groups.flatMap((group) => group.categories));
  const orphans = addOns.filter((addOn) => !known.has(addOn.category));

  return orphans.length > 0 ? [...filed, { id: 'more', title: morePacksTitle, addOns: orphans }] : filed;
}

interface PackCardBodyProps {
  addOn: AppTierAddOnModel;
  pricing: AppTierAddOnPricingModel | undefined;
  currency: string;
  presentation?: AddOnPresentation;
  labels: RegistrationSubscriptionLabels;
}

/**
 * The inside of a pack card. Phrasing content only, so the multi-select variant can make the whole
 * card one button without producing invalid markup.
 */
function PackCardBody({ addOn, pricing, currency, presentation, labels }: PackCardBodyProps) {
  const blurb = presentation?.blurb ?? addOn.description;
  const trial = trialLabel(pricing?.trialDays);

  return (
    <>
      <span className="ww-pack-card-title">
        {presentation?.icon ? <span className="ww-pack-card-icon">{presentation.icon}</span> : null}
        <strong>{addOn.name}</strong>
      </span>

      {blurb ? <span className="ww-pack-card-blurb">{blurb}</span> : null}
      {presentation?.meter ? <span className="ww-pack-card-meter">{presentation.meter}</span> : null}

      {pricing ? (
        <span className="ww-pack-card-price">
          {formatMoney(pricing.price, currency)}
          {billingSuffix(pricing.billingFrequency)}
        </span>
      ) : (
        <span className="ww-pack-card-price ww-pack-card-unavailable">{labels.packUnavailable}</span>
      )}

      {trial ? <span className="ww-pack-card-trial">{trial}</span> : null}

      {addOn.features?.length ? (
        <span className="ww-pack-card-features">
          {addOn.features.map((feature) => (
            <span className="ww-pack-card-feature" key={feature.id}>
              {feature.displayName}
            </span>
          ))}
        </span>
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
}: PackGridProps) {
  const grouped = groupAddOns(addOns, groups, labels.morePacks);
  if (grouped.length === 0) return null;

  const multi = selection === 'multi';
  const selected = new Set(selectedIds);
  const count = selectedIds.length;

  return (
    <div className="ww-regsub-packs">
      {grouped.map((group) => (
        <section className="ww-regsub-pack-group" key={group.id} data-ww-group={group.id}>
          {group.title ? <h3 className="ww-regsub-pack-group-title">{group.title}</h3> : null}
          {group.blurb ? <p className="ww-regsub-pack-group-blurb">{group.blurb}</p> : null}

          <div className="ww-pack-grid">
            {group.addOns.map((addOn) => {
              const pricing = resolvePriceOption(addOn);
              const presentation = describeAddOn?.(addOn);
              const isSelected = selected.has(addOn.id);
              const body = (
                <PackCardBody
                  addOn={addOn}
                  pricing={pricing}
                  currency={currency}
                  presentation={presentation}
                  labels={labels}
                />
              );

              if (multi) {
                return (
                  <button
                    type="button"
                    key={addOn.id}
                    className={`ww-pack-card${isSelected ? ' ww-pack-card--selected' : ''}`}
                    aria-pressed={isSelected}
                    data-ww-pack={addOn.id}
                    onClick={() => onToggle(addOn.id)}
                  >
                    {body}
                  </button>
                );
              }

              return (
                <div className="ww-pack-card" key={addOn.id} data-ww-pack={addOn.id}>
                  {body}
                  <button
                    type="button"
                    className="ww-btn ww-btn-outline ww-btn-block"
                    aria-label={formatLabel(labels.packSelectNamed, { name: addOn.name })}
                    onClick={() => onChoose(addOn)}
                  >
                    {labels.packSelect}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {multi && (
        <div className="ww-regsub-summary">
          <button type="button" className="ww-btn ww-btn-primary" disabled={count === 0} onClick={onContinue}>
            {count === 1 ? labels.continueWithOnePack : formatLabel(labels.continueWithPacks, { count })}
          </button>
        </div>
      )}
    </div>
  );
}
