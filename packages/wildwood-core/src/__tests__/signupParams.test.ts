import { describe, it, expect } from 'vitest';
import { parseSignupParams } from '../features/signupParams.js';
import { buildPublicCatalog } from '../features/catalog.js';
import type { AppTierAddOnModel } from '../features/types.js';

function addOn(id: string, displayOrder = 0): AppTierAddOnModel {
  return {
    id,
    appId: 'app-1',
    name: id,
    description: '',
    category: '',
    status: 'Active',
    displayOrder,
    iconClass: '',
    badgeColor: '',
    features: [],
    pricingOptions: [],
    bundledInTierIds: [],
  };
}

describe('parseSignupParams', () => {
  it('reads the selection and the identity hints a signup link carries', () => {
    const params = parseSignupParams(
      '?tier=tier-1&pricing=price-1&addons=radar,vault&token=TK-1&invite=inv-9&email=someone%40example.test',
    );

    expect(params).toEqual({
      tierId: 'tier-1',
      pricingId: 'price-1',
      addOnIds: ['radar', 'vault'],
      token: 'TK-1',
      invite: 'inv-9',
      email: 'someone@example.test',
    });
  });

  it('trims values and drops empty ones', () => {
    expect(parseSignupParams('tier=%20tier-1%20&pricing=&token=%20&email=%20me%40example.test%20')).toEqual({
      tierId: 'tier-1',
      pricingId: undefined,
      addOnIds: [],
      token: undefined,
      invite: undefined,
      email: 'me@example.test',
    });
  });

  it('returns an empty selection for a query with nothing in it', () => {
    expect(parseSignupParams('')).toEqual({
      tierId: undefined,
      pricingId: undefined,
      addOnIds: [],
      token: undefined,
      invite: undefined,
      email: undefined,
    });
  });

  it('accepts a full URL and already-parsed params', () => {
    expect(parseSignupParams('https://example.test/signup?tier=t1&addons=a%20b').addOnIds).toEqual(['a', 'b']);
    expect(parseSignupParams(new URLSearchParams({ token: 'TK-2' })).token).toBe('TK-2');
  });

  it('drops add-on ids the app does not sell once the catalog is known', () => {
    const catalog = buildPublicCatalog({ appId: 'app-1', addOns: [addOn('radar'), addOn('vault', 1)] });

    expect(parseSignupParams('?addons=radar,smuggled,vault').addOnIds).toEqual(['radar', 'smuggled', 'vault']);
    expect(parseSignupParams('?addons=radar,smuggled,vault', catalog).addOnIds).toEqual(['radar', 'vault']);
  });
});
