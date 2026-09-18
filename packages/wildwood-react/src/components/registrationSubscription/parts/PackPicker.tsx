'use client';

// Buying packs from the manage view: tick what you want, pay once, see what happened.
//
// It is the signup flow's pack step and the signup flow's checkout, reused whole - the same grid a
// pricing page shows and the same one-quote-one-card purchase - because a pack bought a month
// after signing up is the same transaction as a pack bought during it. The outcome list is shown
// rather than swallowed: one pack failing must not look like all of them failing.

import { useState } from 'react';
import type { AddOnCheckoutItemInput, AppTierAddOnModel } from '@wildwood/core';
import type { SignupPackOutcome } from '@wildwood/react-shared';
import type { RegistrationSubscriptionLabels } from '../labels.js';
import type { RegistrationSubscriptionError } from '../types.js';
import { PackCheckout } from './PackCheckout.js';
import { PackGrid } from './PackGrid.js';
import { PackOutcomeList } from './PackOutcomeList.js';

export interface PackPickerProps {
  appId: string;
  /** The packs on offer: everything the app sells that this account does not already have. */
  addOns: AppTierAddOnModel[];
  /** The currency every price in the grid is quoted in. */
  currency: string;
  labels: RegistrationSubscriptionLabels;
  /**
   * Called as soon as the purchase finishes, with one outcome per pack that was asked for. The
   * picker stays on screen showing them - the host refreshes behind it.
   */
  onFinished: (packs: SignupPackOutcome[]) => void;
  /** The customer closed the picker, whether or not anything was bought. */
  onClose: () => void;
  onError?: (error: RegistrationSubscriptionError) => void;
}

export function PackPicker({ appId, addOns, currency, labels, onFinished, onClose, onError }: PackPickerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<AddOnCheckoutItemInput[] | null>(null);
  const [outcomes, setOutcomes] = useState<SignupPackOutcome[] | null>(null);

  const toggle = (addOnId: string) =>
    setSelectedIds((current) =>
      current.includes(addOnId) ? current.filter((id) => id !== addOnId) : [...current, addOnId],
    );

  const names = Object.fromEntries(addOns.map((addOn) => [addOn.id, addOn.name]));

  // A plain overlay: the picker is opened from the packs panel, never over another modal.
  return (
    <div className="ww-modal-overlay" onClick={outcomes || !items ? onClose : undefined} data-ww-modal="packs">
      <div className="ww-modal ww-regsub-pack-picker" onClick={(event) => event.stopPropagation()}>
        <div className="ww-modal-header">
          <h3 className="ww-modal-title">{labels.addPacksTitle}</h3>
          <button type="button" className="ww-modal-close" onClick={onClose} aria-label={labels.cancel}>
            &times;
          </button>
        </div>

        <div className="ww-modal-body">
          {outcomes ? (
            <PackOutcomeList packs={outcomes} labels={labels} />
          ) : items ? (
            <PackCheckout
              appId={appId}
              items={items}
              names={names}
              labels={labels}
              onFinished={(packs) => {
                setOutcomes(packs);
                onFinished(packs);
              }}
              onError={onError}
            />
          ) : (
            <PackGrid
              addOns={addOns}
              currency={currency}
              selection="multi"
              selectedIds={selectedIds}
              onToggle={toggle}
              onChoose={(addOn) => setItems([{ addOnId: addOn.id }])}
              onContinue={() => setItems(selectedIds.map((addOnId) => ({ addOnId })))}
              labels={labels}
            />
          )}
        </div>

        {outcomes ? (
          <div className="ww-modal-footer">
            <button type="button" className="ww-btn ww-btn-primary" onClick={onClose}>
              {labels.continueLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
