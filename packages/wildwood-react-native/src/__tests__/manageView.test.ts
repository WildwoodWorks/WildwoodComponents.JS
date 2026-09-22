/**
 * The native manage view: what somebody already pays for, and every way of changing it.
 *
 * This package has no component renderer under vitest, so the behavioural half drives the exported
 * rules the view is assembled from (`views/manageViewModel.ts`) and the REAL plan-change machine
 * behind `usePlanChangeFlow`, while the source half guards the facts a rule cannot carry: that the
 * card seam is wired the one way that keeps `SupportsPaymentAction` honest, that the confirmation
 * and the card sheet render in every layout, and that no copy with a label key is nailed to the
 * source.
 *
 * The web's equivalents are `RegistrationAndSubscription.manage.test.tsx` and
 * `.planChange.test.tsx`; the cases here are the ones that survive having no DOM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppTierAddOnModel,
  AppTierChangeResultModel,
  AppTierLimitStatusModel,
  AppTierModel,
  TierChangePreviewModel,
} from '@wildwood/core';
import {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as LABELS,
  MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS,
  initialPlanChangeState,
  planChangeTransition,
} from '@wildwood/react-shared';
import type { PaymentActionAdapter, PlanChangeState } from '@wildwood/react-shared';
import { addOnRowRules } from '../components/subscription/AddOnsPanel';
import { planChangeNoticeContent } from '../components/registrationSubscription/parts/PlanChangeNotice';
import { wwTestId } from '../components/registrationSubscription/testIds';
import {
  ALL_MANAGE_SECTIONS,
  availablePacks,
  currentManageTab,
  effectiveLimitStatuses,
  isTabbedLayout,
  manageBodyLayout,
  manageCurrency,
  manageSectionTitle,
  maySendSupportsPaymentAction,
  packSelfServiceOffered,
  planChangeCardSource,
  showsProration,
  visibleManageSections,
} from '../components/registrationSubscription/views/manageViewModel';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PRO_MONTHLY = 79;

function tier(overrides: Partial<AppTierModel>): AppTierModel {
  return {
    id: 'tier-pro',
    appId: 'app-1',
    name: 'Pro',
    description: '',
    status: 'Active',
    displayOrder: 1,
    isFreeTier: false,
    isDefault: false,
    features: [],
    limits: [],
    pricingOptions: [],
    ...overrides,
  } as AppTierModel;
}

function pack(overrides: Partial<AppTierAddOnModel>): AppTierAddOnModel {
  return {
    id: 'pack-docs',
    appId: 'app-1',
    name: 'Documents',
    description: '',
    status: 'Active',
    displayOrder: 1,
    category: 'core',
    features: [],
    limits: [],
    pricingOptions: [],
    bundledInTierIds: [],
    ...overrides,
  } as unknown as AppTierAddOnModel;
}

const limit = (limitCode: string, currentUsage: number): AppTierLimitStatusModel =>
  ({ limitCode, currentUsage, maxValue: 100 }) as AppTierLimitStatusModel;

const handler: PaymentActionAdapter = {
  confirmPayment: async () => ({ status: 'succeeded' }),
};

// ── Sections and layout ────────────────────────────────────────────────────────

describe('visibleManageSections', () => {
  it('offers every section an admin may see, in the shipped order', () => {
    expect(visibleManageSections({ isAdmin: true, showAddOns: true })).toEqual(ALL_MANAGE_SECTIONS);
  });

  it('keeps per-user overrides away from someone who is not an admin', () => {
    expect(visibleManageSections({ isAdmin: false, showAddOns: true })).not.toContain('overrides');
    // Naming it does not let it through either: the filter is about who is looking, not what was asked.
    expect(visibleManageSections({ sections: ['plans', 'overrides'], isAdmin: false, showAddOns: true })).toEqual([
      'plans',
    ]);
  });

  it('drops the packs panel when the host turns packs off', () => {
    expect(visibleManageSections({ isAdmin: true, showAddOns: false })).not.toContain('addOns');
    expect(visibleManageSections({ sections: ['addOns', 'usage'], isAdmin: true, showAddOns: false })).toEqual([
      'usage',
    ]);
  });

  it('renders the host order rather than the shipped one', () => {
    expect(visibleManageSections({ sections: ['usage', 'plans'], isAdmin: false, showAddOns: true })).toEqual([
      'usage',
      'plans',
    ]);
  });
});

describe('manageBodyLayout', () => {
  it('leaves the subscription card in the section list by default', () => {
    const layout = manageBodyLayout(ALL_MANAGE_SECTIONS, false);
    expect(layout.statusAbove).toBe(false);
    expect(layout.body).toContain('subscription');
  });

  it('lifts it out of the list when it is shown above the tabs, so it renders once', () => {
    const layout = manageBodyLayout(ALL_MANAGE_SECTIONS, true);
    expect(layout.statusAbove).toBe(true);
    expect(layout.body).not.toContain('subscription');
  });

  it('lifts nothing when the subscription section is not on offer at all', () => {
    const layout = manageBodyLayout(['plans', 'usage'], true);
    expect(layout.statusAbove).toBe(false);
    expect(layout.body).toEqual(['plans', 'usage']);
  });
});

describe('currentManageTab', () => {
  it('opens the first section when nobody has chosen one', () => {
    expect(currentManageTab(null, ['plans', 'usage'])).toBe('plans');
  });

  it('keeps the chosen section while it is still on offer', () => {
    expect(currentManageTab('usage', ['plans', 'usage'])).toBe('usage');
  });

  it('falls back when the chosen section stops being on offer', () => {
    // `isAdmin` flipping takes `overrides` away with nobody pressing anything; a layout still
    // pointing at it would render an empty panel.
    expect(currentManageTab('overrides', ['plans', 'usage'])).toBe('plans');
  });

  it('has nothing to open when every section was filtered out', () => {
    expect(currentManageTab(null, [])).toBeUndefined();
  });
});

describe('manageSectionTitle', () => {
  it('takes every heading from the shared labels', () => {
    expect(ALL_MANAGE_SECTIONS.map((section) => manageSectionTitle(section, LABELS))).toEqual([
      LABELS.sectionStatus,
      LABELS.sectionPlans,
      LABELS.sectionFeatures,
      LABELS.sectionPacks,
      LABELS.sectionUsage,
      LABELS.sectionOverrides,
    ]);
  });
});

describe('isTabbedLayout', () => {
  it('stacks only when asked to', () => {
    expect(isTabbedLayout('tabs')).toBe(true);
    expect(isTabbedLayout('stacked')).toBe(false);
  });
});

describe('manageCurrency', () => {
  it('quotes what the server quoted', () => {
    expect(manageCurrency(undefined, [tier({ currency: 'CHF' })])).toBe('CHF');
  });

  it('lets the host override it', () => {
    expect(manageCurrency('EUR', [tier({ currency: 'CHF' })])).toBe('EUR');
  });

  it('falls back only when nothing said otherwise', () => {
    expect(manageCurrency(undefined, [])).toBe('USD');
  });
});

describe('effectiveLimitStatuses', () => {
  const fromServer = [limit('DOCS', 10)];
  const merged = [limit('DOCS', 42)];

  it('shows the server statuses when no host merge was wired', () => {
    expect(effectiveLimitStatuses([], fromServer, false)).toBe(fromServer);
  });

  it('shows the merged statuses once the host has answered', () => {
    expect(effectiveLimitStatuses(merged, fromServer, true)).toBe(merged);
  });

  it('does not blank the panel while the host merge is still running', () => {
    expect(effectiveLimitStatuses([], fromServer, true)).toBe(fromServer);
  });
});

// ── Where the card comes from ──────────────────────────────────────────────────

describe('planChangeCardSource', () => {
  const request = { tierId: 'tier-pro', tierName: 'Pro', price: PRO_MONTHLY };

  it('asks for nothing outside the card step', () => {
    for (const step of ['idle', 'previewing', 'confirm', 'changing', 'completing', 'done', 'failed'] as const) {
      expect(
        planChangeCardSource({ step, hasHostHandler: false, paymentRequest: request, collectsPaymentInApp: true }),
      ).toBe('none');
    }
  });

  it('leaves the card to the host when the host brought a modal of its own', () => {
    // The flow drives that handler itself, which is why it hands out no `paymentRequest` for it.
    expect(
      planChangeCardSource({
        step: 'collectingPayment',
        hasHostHandler: true,
        paymentRequest: null,
        collectsPaymentInApp: true,
      }),
    ).toBe('host');
  });

  it('takes the card in the built-in sheet when the surface mounts one', () => {
    expect(
      planChangeCardSource({
        step: 'collectingPayment',
        hasHostHandler: false,
        paymentRequest: request,
        collectsPaymentInApp: true,
      }),
    ).toBe('builtIn');
  });

  it('says where the purchase can be finished when nothing on the surface can take a card', () => {
    expect(
      planChangeCardSource({
        step: 'collectingPayment',
        hasHostHandler: false,
        paymentRequest: request,
        collectsPaymentInApp: false,
      }),
    ).toBe('finishOnWeb');
  });
});

describe('maySendSupportsPaymentAction', () => {
  it('never asks the server to park a change this device could not finish', () => {
    // The whole no-handler rule in one line: no adapter, no `SupportsPaymentAction`, so the server
    // refuses a change that needs a challenge instead of parking one nobody can answer.
    expect(maySendSupportsPaymentAction(undefined)).toBe(false);
    expect(maySendSupportsPaymentAction(null)).toBe(false);
  });

  it('asks for it once a handler can answer the bank', () => {
    expect(maySendSupportsPaymentAction(handler)).toBe(true);
  });
});

describe('the notice and the card sheet do not both speak', () => {
  const request = { tierId: 'tier-pro', tierName: 'Pro', price: PRO_MONTHLY };

  it('stays quiet on a surface that mounts the built-in sheet', () => {
    expect(
      planChangeNoticeContent(
        { step: 'collectingPayment', paymentRequest: request, error: null, canRetry: false },
        LABELS,
        { collectsPaymentInApp: true },
      ).kind,
    ).toBe('none');
  });

  it('still says where to finish on a surface that mounts none', () => {
    expect(
      planChangeNoticeContent(
        { step: 'collectingPayment', paymentRequest: request, error: null, canRetry: false },
        LABELS,
      ),
    ).toMatchObject({ kind: 'payment', message: LABELS.finishOnWeb });
  });

  it('says what the parked change is doing, whichever surface it is on', () => {
    for (const collectsPaymentInApp of [true, false]) {
      expect(
        planChangeNoticeContent(
          { step: 'authenticating', paymentRequest: null, error: null, canRetry: false },
          LABELS,
          {
            collectsPaymentInApp,
          },
        ).message,
      ).toBe(LABELS.authenticatingChange);
      expect(
        planChangeNoticeContent({ step: 'completing', paymentRequest: null, error: null, canRetry: false }, LABELS, {
          collectsPaymentInApp,
        }).message,
      ).toBe(LABELS.applyingChange);
    }
  });
});

// ── The plan change itself, through the real machine ───────────────────────────

const preview = (over: Partial<TierChangePreviewModel> = {}): TierChangePreviewModel =>
  ({
    success: true,
    paymentRequired: true,
    newTierName: 'Pro',
    newPrice: PRO_MONTHLY,
    ...over,
  }) as TierChangePreviewModel;

/** Price a change and confirm it, exactly as the confirmation modal does. */
function priceAndConfirm(over: Partial<TierChangePreviewModel> = {}): PlanChangeState {
  let state = initialPlanChangeState({ appId: 'app-1' });
  state = planChangeTransition(state, {
    type: 'PREVIEW_REQUESTED',
    appId: 'app-1',
    tierId: 'tier-pro',
    pricingId: 'atp-pro-monthly',
  });
  state = planChangeTransition(state, { type: 'PREVIEW_RECEIVED', token: state.token!, preview: preview(over) });
  expect(state.step).toBe('confirm');
  return planChangeTransition(state, { type: 'CONFIRMED', immediate: true });
}

/** The parked change a 3-D Secure challenge produces: `success:false`, and NOT a failure. */
const PARKED = {
  success: false,
  requiresAction: true,
  clientSecret: 'pi_secret',
  pendingChangeId: 'pending-1',
} as unknown as AppTierChangeResultModel;

const processingAgain = {
  success: false,
  processing: true,
  pendingChangeId: 'pending-1',
} as unknown as AppTierChangeResultModel;

/** Take a card in the built-in sheet and post the change. */
function payAndChange(): PlanChangeState {
  const paid = planChangeTransition(priceAndConfirm(), {
    type: 'PAYMENT_COMPLETED',
    paymentTransactionId: 'txn-1',
  });
  expect(paid.step).toBe('changing');
  return paid;
}

describe('the card step', () => {
  it('asks for a card when the preview says the change needs one', () => {
    expect(priceAndConfirm().step).toBe('collectingPayment');
  });

  it('goes straight to the change when the preview wants no money', () => {
    expect(priceAndConfirm({ paymentRequired: false }).step).toBe('changing');
  });

  it('keeps the priced change when the built-in sheet is closed, rather than throwing it away', () => {
    // `providePayment(null)` dispatches PAYMENT_CANCELLED: the sheet is INSIDE this flow, so closing
    // it steps back to the confirmation the customer came from.
    const cancelled = planChangeTransition(priceAndConfirm(), { type: 'PAYMENT_CANCELLED' });
    expect(cancelled.step).toBe('confirm');
    expect(cancelled.preview).not.toBeNull();
  });

  it('abandons the whole change when a host handler answers with nothing', () => {
    // The host owns its own modal, so closing it is walking away from the change - not a step back
    // to a confirmation already dismissed. That is a RESET.
    const reset = planChangeTransition(priceAndConfirm(), { type: 'RESET' });
    expect(reset.step).toBe('idle');
    expect(reset.preview).toBeNull();
  });
});

describe('3-D Secure', () => {
  it('confirms the charge and completes the parked change', () => {
    const changing = payAndChange();
    let state = planChangeTransition(changing, { type: 'CHANGE_RESULT', token: changing.token!, result: PARKED });
    // `requiresAction` arrives with `success: false` and is NOT a refusal.
    expect(state.step).toBe('authenticating');
    expect(state.clientSecret).toBe('pi_secret');
    expect(state.pendingChangeId).toBe('pending-1');

    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });
    expect(state.step).toBe('completing');
    expect(state.completeAttempts).toBe(0);

    state = planChangeTransition(state, {
      type: 'COMPLETE_RESULT',
      token: state.token!,
      result: { success: true } as AppTierChangeResultModel,
    });
    expect(state.step).toBe('done');
  });

  it('says why the bank refused, and offers the step back', () => {
    const changing = payAndChange();
    let state = planChangeTransition(changing, { type: 'CHANGE_RESULT', token: changing.token!, result: PARKED });
    state = planChangeTransition(state, {
      type: 'AUTH_FAILED',
      token: state.token!,
      message: 'Your card was declined.',
    });

    expect(state.step).toBe('failed');
    expect(state.error).toBe('Your card was declined.');
    expect(state.retryFrom).toBe('authenticating');

    const content = planChangeNoticeContent(
      { step: state.step, paymentRequest: null, error: state.error, canRetry: !!state.retryFrom },
      LABELS,
      { collectsPaymentInApp: true },
    );
    expect(content).toMatchObject({ kind: 'failed', title: LABELS.planChangeFailed, canRetry: true });
    expect(content.message).toBe('Your card was declined.');
  });

  it('asks the completion again while the server is still applying it, but not forever', () => {
    const changing = payAndChange();
    let state = planChangeTransition(changing, { type: 'CHANGE_RESULT', token: changing.token!, result: PARKED });
    state = planChangeTransition(state, { type: 'AUTHENTICATED', token: state.token! });

    // `processing` means the money is in and the change is not applied yet: a "not yet", not a
    // failure. The budget is the machine's, and it is finite.
    for (let attempt = 1; attempt < MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS; attempt += 1) {
      state = planChangeTransition(state, {
        type: 'COMPLETE_RESULT',
        token: state.token!,
        result: processingAgain,
      });
      expect(state.step).toBe('completing');
      expect(state.completeAttempts).toBe(attempt);
    }

    state = planChangeTransition(state, { type: 'COMPLETE_RESULT', token: state.token!, result: processingAgain });
    expect(state.step).toBe('failed');
    expect(state.retryFrom).toBe('completing');

    // A manual Try Again starts the budget over: it belongs to one automatic run.
    const retried = planChangeTransition(state, { type: 'RETRY' });
    expect(retried.step).toBe('completing');
    expect(retried.completeAttempts).toBe(0);
  });
});

// ── Packs ──────────────────────────────────────────────────────────────────────

describe('availablePacks', () => {
  const packs = [pack({ id: 'pack-docs' }), pack({ id: 'pack-ai', name: 'AI' })];
  const owned = (status: string) => [{ appTierAddOnId: 'pack-docs', status }] as never[];

  it('offers everything the account does not have', () => {
    expect(availablePacks(packs, []).map((addOn) => addOn.id)).toEqual(['pack-docs', 'pack-ai']);
  });

  it('does not sell a pack the account already has twice', () => {
    for (const status of ['Active', 'Trialing', 'PendingCancellation']) {
      expect(availablePacks(packs, owned(status)).map((addOn) => addOn.id)).toEqual(['pack-ai']);
    }
  });

  it('puts a lapsed pack back on offer', () => {
    for (const status of ['Cancelled', 'Expired']) {
      expect(availablePacks(packs, owned(status)).map((addOn) => addOn.id)).toEqual(['pack-docs', 'pack-ai']);
    }
  });
});

describe('packSelfServiceOffered', () => {
  it('offers "Add packs" when the host allows it and the panel is on screen', () => {
    expect(packSelfServiceOffered({ allowPackSelfService: true, showAddOns: true, storeOnly: false })).toBe(true);
  });

  it('offers nothing the host did not ask for, or on a panel that is not rendered', () => {
    expect(packSelfServiceOffered({ allowPackSelfService: false, showAddOns: true, storeOnly: false })).toBe(false);
    expect(packSelfServiceOffered({ allowPackSelfService: true, showAddOns: false, storeOnly: false })).toBe(false);
  });

  it('hides the purchase on a device the store must bill', () => {
    // Pack checkout is a card purchase and there is no store product behind an add-on, so offering
    // it would open a sheet the store would refuse. Owned rows still render - see below.
    expect(packSelfServiceOffered({ allowPackSelfService: true, showAddOns: true, storeOnly: true })).toBe(false);
  });
});

describe('showsProration', () => {
  it('quotes the server preview on a card-billed device', () => {
    expect(showsProration(false)).toBe(true);
  });

  it('names the store instead of a charge it will not honour', () => {
    expect(showsProration(true)).toBe(false);
    expect(LABELS.storeManagesBilling).toBeTruthy();
  });
});

describe('a pack nobody paid for', () => {
  const complimentary = {
    status: 'Active',
    isBundled: false,
    paymentTransactionId: undefined,
    endDate: '2027-01-01T00:00:00Z',
    appTierAddOnId: 'pack-docs',
  };

  it('says it is included, promises no renewal and offers nothing to reactivate', () => {
    const rules = addOnRowRules(complimentary, { canCancel: true, canReactivate: true });
    expect(rules.complimentary).toBe(true);
    expect(rules.dateLine).toBe('none');
    expect(rules.offersReactivate).toBe(false);
    expect(rules.offersCancel).toBe(true);
  });

  it('is cancelled in its own words, the ones the manage view hands the panel', () => {
    const labels = { cancelIncluded: LABELS.packCancelIncluded, cancelBilled: LABELS.packCancelBilled };
    expect(addOnRowRules(complimentary, { canCancel: true, labels }).cancelMessage).toBe(LABELS.packCancelIncluded);
    expect(
      addOnRowRules({ ...complimentary, paymentTransactionId: 'txn-1' }, { canCancel: true, labels }).cancelMessage,
    ).toBe(LABELS.packCancelBilled);
  });
});

// ── Test hooks ─────────────────────────────────────────────────────────────────

describe('the manage view names itself the way the web does', () => {
  it('carries the view name at rest and the plan-change step while one runs', () => {
    expect(wwTestId('manage', '')).toBe('manage');
    expect(wwTestId('manage', 'collectingPayment')).toBe('collectingPayment');
  });
});

// ── Source guards ──────────────────────────────────────────────────────────────

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The code, without the comments - which name the seam and the web's attributes on purpose. */
const readCode = (relative: string) =>
  readFileSync(resolve(SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the manage view source', () => {
  const source = readCode('components/registrationSubscription/views/RegistrationSubscriptionManage.tsx');

  it('drives the change through the shared flow', () => {
    expect(source).toContain('usePlanChangeFlow');
    expect(source).toContain('onTierSelected={flow.selectTier}');
  });

  it('passes the adapter it was given, and only that, as the 3-D Secure seam', () => {
    // `usePaymentActionHandler` answers undefined when neither the prop nor the provider wired one,
    // and the shared flow reads exactly that to decide whether `SupportsPaymentAction` goes out.
    expect(source).toContain('const handler = usePaymentActionHandler(paymentActionHandler)');
    expect(source).toContain('paymentActions: handler');
    expect(source).not.toContain('supportsPaymentAction: true');
  });

  it('confirms in every layout, not only the tabbed one', () => {
    // The confirmation and the card sheet are rendered after the layout branch, so a stacked layout
    // cannot preview a change and then show nothing.
    expect(source.match(/<TierChangeConfirmationModal/g)).toHaveLength(1);
    expect(source.match(/<PaymentModal/g)).toHaveLength(1);
    expect(source).toContain('isTabbedLayout(layout) ? (');
  });

  it('answers the built-in sheet through the flow, so closing it returns to the confirmation', () => {
    expect(source).toContain("cardSource === 'builtIn'");
    expect(source).toContain('onSettled={flow.providePayment}');
  });

  it('keeps the notice out of the card step it mounts a sheet for', () => {
    expect(source).toContain('<PlanChangeNotice flow={flow} labels={labels} collectsPaymentInApp />');
  });

  it('says a failure once: the data-layer alert stands down while the notice speaks', () => {
    expect(source).toContain("admin.error && flow.step !== 'failed'");
  });

  it('tells the mutations apart when it reports what changed', () => {
    for (const reason of ['cancel', 'reactivate', 'addOn']) {
      expect(source).toContain(`onEntitlementsChanged?.('${reason}')`);
    }
    // The tier change's own reason is the flow's, which reports 'tierChange' once it lands.
    expect(source).toContain('onEntitlementsChanged,');
  });

  it('asks the server whether this device is store-billed rather than guessing', () => {
    expect(source).toContain('getAvailableProviders(resolvedAppId)');
    expect(source).toContain('requiresAppStorePayment === true');
    expect(source).toContain('storeBilled={!showsProration(storeOnly)}');
    expect(source).toContain('storeNotice={labels.storeManagesBilling}');
  });

  it('offers pack self-service through the picker, and never a one-click Subscribe', () => {
    expect(source).toContain('packSelfService ? () => setPickingPacks(true) : undefined');
    expect(source).not.toContain('onSubscribe=');
  });
});

describe('SubscriptionAdminComponent follows the same composition', () => {
  const source = readCode('components/subscription/SubscriptionAdminComponent.tsx');

  it('gains the adapter, on the same rule', () => {
    expect(source).toContain('const handler = usePaymentActionHandler(paymentActionHandler)');
    expect(source).toContain('paymentActions: handler');
  });

  it('takes the card in the built-in sheet when the host wired no callback', () => {
    expect(source).toContain("cardSource === 'builtIn'");
    expect(source).toContain('onSettled={flow.providePayment}');
    expect(source.match(/\{paymentModal\}/g)).toHaveLength(2);
    expect(source.match(/\{confirmationModal\}/g)).toHaveLength(2);
  });

  it('never throws the old missing-callback error', () => {
    expect(source).not.toContain('PAYMENT_CALLBACK_MISSING_MESSAGE');
  });
});

describe('the shell', () => {
  const source = readCode('components/registrationSubscription/RegistrationAndSubscriptionComponent.tsx');

  it('is a switch on `view` and nothing else - no state, no provider of its own', () => {
    expect(source).toContain("props.view === 'signup'");
    expect(source).toContain("props.view === 'manage'");
    expect(source).toContain('<RegistrationSubscriptionPricing');
    expect(source).not.toContain('useState');
    expect(source).not.toContain('useEffect');
  });
});
