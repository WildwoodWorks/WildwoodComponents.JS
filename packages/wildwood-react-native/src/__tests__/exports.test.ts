import { describe, it, expect } from 'vitest';

// Individual hooks that only depend on react + @wildwood/core.
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { useWildwoodComponent } from '../hooks/useWildwoodComponent';
import { useFeedback } from '../hooks/useFeedback';
import { useAttribution } from '../hooks/useAttribution';

// The package entry itself — react-native resolves to the mock under vitest, so what a host would
// import is what is asserted here.
import * as reactNative from '../index';

// Test theme/styles (no react-native dependency)
import { defaultTheme, resolveTheme, themes } from '../styles/theme';

describe('@wildwood/react-native hooks', () => {
  it('usePlatformDetection is a function', () => {
    expect(typeof usePlatformDetection).toBe('function');
  });

  it('useWildwoodComponent is a function', () => {
    expect(typeof useWildwoodComponent).toBe('function');
  });

  it('useFeedback is a function', () => {
    expect(typeof useFeedback).toBe('function');
  });

  it('useAttribution is a function', () => {
    expect(typeof useAttribution).toBe('function');
  });
});

describe('@wildwood/react-native registration & subscription exports', () => {
  // The DOM-free logic layer lives in @wildwood/react-shared and @wildwood/core. React Native hosts
  // build their own screens over it, so the package entry has to hand it out rather than leaving
  // them to depend on the shared package directly.
  it.each([
    'usePublicCatalog',
    'invalidatePublicCatalog',
    'seedPublicCatalog',
    'clearPublicCatalogCache',
    'useRegistrationMode',
    'useRegistrationSubscription',
    'resolveSignupRegistrationMode',
    'usePaymentActionHandler',
    'signupTransition',
    'initialSignupState',
    'signupPlanNeedsPayment',
    'packCheckoutTransition',
    'initialPackCheckoutState',
    'currentPackCheckoutItem',
    'planChangeTransition',
    'initialPlanChangeState',
    'issueStepToken',
    'isCurrentStep',
    'grantsAccess',
    'formatRegistrationSubscriptionLabel',
    'resolveRegistrationSubscriptionLabels',
    'buildPublicCatalog',
    'resolvePriceOption',
    'formatMoney',
    'trialLabel',
    'parseAddOnIdList',
    'selectPacks',
    'encodeCatalogSelection',
    'decodeCatalogSelection',
  ])('exports %s as a function', (name) => {
    expect(typeof (reactNative as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports the pricing view, and only the parts the web package exports too', () => {
    // The view a host renders. `PlanGrid`, `PackGrid` and `PricingSkeleton` are internal in
    // @wildwood/react as well — a host builds its own grid from the catalog helpers above.
    expect(typeof reactNative.RegistrationSubscriptionPricing).toBe('function');
    for (const internal of ['PlanGrid', 'PackGrid', 'PricingSkeleton']) {
      expect((reactNative as Record<string, unknown>)[internal]).toBeUndefined();
    }
  });

  it('exports the signup view and the one part the web exports beside it', () => {
    expect(typeof reactNative.RegistrationSubscriptionSignup).toBe('function');
    // `ClosedNotice` is public on both stacks: a host may want to say "registration is closed" on a
    // screen of its own without mounting the flow. Everything else the signup is built from stays
    // internal, exactly as it is in @wildwood/react.
    expect(typeof reactNative.ClosedNotice).toBe('function');
    for (const internal of [
      'PlanSummaryCard',
      'TokenPlanSummary',
      'OrderSummary',
      'PackCheckout',
      'PackOutcomeList',
      'PackPicker',
    ]) {
      expect((reactNative as Record<string, unknown>)[internal]).toBeUndefined();
    }
  });

  it('exports the component and all three of its views', () => {
    // A host either passes `view` to the one component or imports the view it wants; both are
    // supported, exactly as they are in @wildwood/react.
    expect(typeof reactNative.RegistrationAndSubscriptionComponent).toBe('function');
    expect(typeof reactNative.RegistrationSubscriptionPricing).toBe('function');
    expect(typeof reactNative.RegistrationSubscriptionSignup).toBe('function');
    expect(typeof reactNative.RegistrationSubscriptionManage).toBe('function');
  });

  it('exports the manage view parts the web package exports too, and no more', () => {
    // `PaymentModal`, `PlanChangeNotice`, `CancelResultNotice` and `usePlanChangeFlow` are public on
    // the web package, so a host can build its own subscription screen on the same pieces.
    expect(typeof reactNative.PaymentModal).toBe('function');
    expect(typeof reactNative.PlanChangeNotice).toBe('function');
    expect(typeof reactNative.CancelResultNotice).toBe('function');
    expect(typeof reactNative.usePlanChangeFlow).toBe('function');
    // The pack picker stays internal on both stacks.
    expect((reactNative as Record<string, unknown>).PackPicker).toBeUndefined();
  });

  it('exports the shared constants', () => {
    expect(reactNative.ACCESS_GRANTING_STATUSES).toEqual(['Active', 'Trialing', 'PendingCancellation']);
    expect(reactNative.MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS).toBeGreaterThan(0);
    expect(reactNative.MAX_ADDON_SELECTION).toBe(25);
    expect(reactNative.CATALOG_QUERY_KEYS).toBeDefined();
    expect(reactNative.DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS).toBeDefined();
  });

  it('keeps the money the components format with in one place', () => {
    // Same function the components call, so a host's own screen quotes what the SDK's screens quote.
    expect(reactNative.formatMoney(79, 'CHF')).not.toContain('$');
    expect(reactNative.trialLabel(14)).toBe('14-day free trial');
    expect(reactNative.grantsAccess('PendingCancellation')).toBe(true);
    expect(reactNative.grantsAccess('Expired')).toBe(false);
  });
});

describe('@wildwood/react-native styles', () => {
  it('defaultTheme has expected properties', () => {
    expect(defaultTheme).toBeDefined();
    expect(defaultTheme.primary).toBeDefined();
    expect(defaultTheme.textPrimary).toBeDefined();
    expect(defaultTheme.borderRadius).toBeTypeOf('number');
  });

  it('themes contains the built-in themes the web names', () => {
    expect(themes).toBeDefined();
    expect(Object.keys(themes)).toEqual(expect.arrayContaining(['woodland-warm', 'cool-blue', 'fall-colors']));
  });

  it('resolveTheme layers a partial over the default rather than replacing it', () => {
    const resolved = resolveTheme({ primary: '#0b1f3a' });
    expect(resolved.primary).toBe('#0b1f3a');
    // Every other token survives — the point of mirroring how :root overrides behave on the web.
    expect(resolved.textPrimary).toBe(defaultTheme.textPrimary);
    expect(resolved.borderRadius).toBe(defaultTheme.borderRadius);
  });

  it('resolveTheme accepts a built-in theme name', () => {
    expect(resolveTheme('cool-blue').primary).toBe('#3B7EA1');
    expect(resolveTheme('fall-colors').primary).toBe('#B8452A');
    expect(resolveTheme(undefined)).toEqual(defaultTheme);
  });

  it('resolveTheme falls back to the default for an unknown name', () => {
    // core's ThemeName widens to `string`, so a typo typechecks — it must not silently produce a
    // half-applied theme.
    expect(resolveTheme('no-such-theme')).toEqual(defaultTheme);
  });

  it('the variant themes keep a readable muted text on light surfaces', () => {
    // The web sets --ww-text-muted light in these themes because they recolour its DARK chrome.
    // React Native uses textMuted on the white bgPrimary, so carrying that over would render
    // secondary text at ~1.4:1. The variants must inherit the default's dark muted instead.
    for (const name of ['cool-blue', 'fall-colors']) {
      expect(resolveTheme(name).textMuted).toBe(defaultTheme.textMuted);
    }
  });
});
