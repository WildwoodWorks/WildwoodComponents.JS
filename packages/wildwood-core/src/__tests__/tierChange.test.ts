import { describe, it, expect } from 'vitest';
import { isTierChangeAllowed } from '../features/tierUtils.js';
import type { AppTierModel } from '../features/types.js';

function tier(id: string, displayOrder: number, allowUpgrades: boolean, allowDowngrades: boolean): AppTierModel {
  return { id, displayOrder, allowUpgrades, allowDowngrades } as AppTierModel;
}

describe('isTierChangeAllowed', () => {
  const free = tier('free', 1, true, false);
  const pro = tier('pro', 2, false, false);
  const business = tier('business', 3, true, true);

  it('follows the CURRENT tier, as the server does: upgrades need allowUpgrades', () => {
    expect(isTierChangeAllowed(free, pro)).toBe(true);
    expect(isTierChangeAllowed(pro, business)).toBe(false);
  });

  it('treats every non-upgrade as a downgrade, needing allowDowngrades', () => {
    expect(isTierChangeAllowed(pro, free)).toBe(false);
    expect(isTierChangeAllowed(business, free)).toBe(true);
    // Same display order is not an upgrade on the server either.
    expect(isTierChangeAllowed(tier('a', 2, true, false), tier('b', 2, true, true))).toBe(false);
  });

  it('allows a first subscription and staying put', () => {
    expect(isTierChangeAllowed(null, pro)).toBe(true);
    expect(isTierChangeAllowed(undefined, pro)).toBe(true);
    expect(isTierChangeAllowed(pro, tier('PRO', 2, false, false))).toBe(true);
  });

  it('allows a change when an older server leaves the flags out', () => {
    const legacy = { id: 'legacy', displayOrder: 2 } as AppTierModel;
    expect(isTierChangeAllowed(legacy, business)).toBe(true);
    expect(isTierChangeAllowed(legacy, free)).toBe(true);
  });
});
