import { describe, it, expect, vi } from 'vitest';
import { AppTierService, toAppTierActionError } from '../features/appTierService.js';
import { WildwoodError } from '../client/errors.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
    put: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post' | 'put' | 'delete', ReturnType<typeof vi.fn>>;
}

/** A refusal the way the server sends it: the result DTO itself, with the error code on it. */
const refusal = (status: number, body: unknown) => new WildwoodError('Request failed', status, undefined, body);

describe('AppTierService — trial eligibility', () => {
  it('reads the eligibility endpoint', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ tierTrialEligible: false, addOns: { radar: true } }));
    const svc = new AppTierService(http);

    const eligibility = await svc.trialEligibility('app-1');

    expect(http.get).toHaveBeenCalledWith('api/app-tiers/app-1/trial-eligibility');
    expect(eligibility).toEqual({ tierTrialEligible: false, addOns: { radar: true } });
  });

  it('answers "eligible, packs unknown" when the lookup fails, rather than throwing', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new WildwoodError('Not Found', 404));
    const svc = new AppTierService(http);

    expect(await svc.trialEligibility('app-1')).toEqual({ tierTrialEligible: true, addOns: {} });
  });
});

describe('AppTierService — pack checkout', () => {
  it('quotes a basket with a PascalCase item list and maps the answer', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(
      ok({
        success: true,
        checkoutId: 'co-1',
        providerId: 'prov-1',
        currency: 'USD',
        lines: [
          {
            addOnId: 'radar',
            pricingId: 'ap-1',
            name: 'Radar',
            price: 19,
            billingFrequency: 'Monthly',
            trialDays: 14,
            trialEligible: true,
            dueToday: 0,
            trialEnd: '2026-10-01T00:00:00Z',
          },
        ],
        totalDueToday: 0,
        requiresPaymentMethod: false,
        savedCard: { brand: 'visa', last4: '4242' },
      }),
    );
    const svc = new AppTierService(http);

    const quote = await svc.quoteAddOnCheckout('app-1', [
      { addOnId: 'radar' },
      { addOnId: 'vault', pricingId: 'ap-9' },
    ]);

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/app-1/checkout/quote', {
      Items: [
        { AddOnId: 'radar', PricingId: undefined },
        { AddOnId: 'vault', PricingId: 'ap-9' },
      ],
    });
    expect(quote.success).toBe(true);
    expect(quote.checkoutId).toBe('co-1');
    expect(quote.lines[0]?.dueToday).toBe(0);
    expect(quote.savedCard).toEqual({ brand: 'visa', last4: '4242' });
  });

  it('keeps the refused quote the server sent, error code and all', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(
      refusal(400, {
        success: false,
        checkoutId: 'co-2',
        currency: 'USD',
        lines: [],
        totalDueToday: 0,
        requiresPaymentMethod: false,
        errorCode: 'AlreadySubscribed',
        errorMessage: 'You already have that pack',
      }),
    );
    const svc = new AppTierService(http);

    const quote = await svc.quoteAddOnCheckout('app-1', [{ addOnId: 'radar' }]);

    expect(quote.success).toBe(false);
    expect(quote.checkoutId).toBe('co-2');
    expect(quote.errorCode).toBe('AlreadySubscribed');
    expect(quote.errorMessage).toBe('You already have that pack');
  });

  it('reports a server that has no checkout routes as NotSupported, and quotes no currency', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(new WildwoodError('Not Found', 404));
    const svc = new AppTierService(http);

    const quote = await svc.quoteAddOnCheckout('app-1', [{ addOnId: 'radar' }]);

    expect(quote.success).toBe(false);
    expect(quote.errorCode).toBe('NotSupported');
    // Nothing was priced, so nothing names a currency.
    expect(quote.currency).toBe('');
    expect(quote.lines).toEqual([]);
  });

  it('starts card collection for one provider', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(
      ok({ success: true, clientSecret: 'seti_1_secret', setupIntentId: 'seti_1', paymentTransactionId: 'txn-1' }),
    );
    const svc = new AppTierService(http);

    const result = await svc.createCheckoutPaymentMethod('app-1', 'prov-1');

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/app-1/checkout/payment-method', {
      ProviderId: 'prov-1',
    });
    expect(result.clientSecret).toBe('seti_1_secret');
    expect(result.paymentTransactionId).toBe('txn-1');
  });

  it('buys the basket and returns a result per pack', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(
      ok({
        success: true,
        checkoutId: 'co-1',
        results: [
          { addOnId: 'radar', pricingId: 'ap-1', status: 'trialing', subscriptionId: 'sub-1' },
          {
            addOnId: 'vault',
            pricingId: 'ap-2',
            status: 'requires_action',
            clientSecret: 'pi_1_secret',
            paymentTransactionId: 'txn-2',
          },
        ],
      }),
    );
    const svc = new AppTierService(http);

    const result = await svc.checkoutAddOns('app-1', {
      checkoutId: 'co-1',
      providerId: 'prov-1',
      useSavedCard: true,
      items: [{ addOnId: 'radar' }, { addOnId: 'vault', pricingId: 'ap-2' }],
    });

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/app-1/checkout', {
      CheckoutId: 'co-1',
      ProviderId: 'prov-1',
      PaymentTransactionId: undefined,
      UseSavedCard: true,
      Items: [
        { AddOnId: 'radar', PricingId: undefined },
        { AddOnId: 'vault', PricingId: 'ap-2' },
      ],
    });
    expect(result.results.map((r) => r.status)).toEqual(['trialing', 'requires_action']);
  });

  it('defaults UseSavedCard to false and keeps the checkout id on a refusal', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(refusal(400, { error: 'no card' }));
    const svc = new AppTierService(http);

    const result = await svc.checkoutAddOns('app-1', {
      checkoutId: 'co-3',
      providerId: 'prov-1',
      paymentTransactionId: 'txn-1',
      items: [{ addOnId: 'radar' }],
    });

    expect(http.post).toHaveBeenCalledWith(
      'api/app-tier-addons/app-1/checkout',
      expect.objectContaining({ UseSavedCard: false, PaymentTransactionId: 'txn-1' }),
    );
    expect(result).toEqual({
      success: false,
      checkoutId: 'co-3',
      results: [],
      errorCode: 'RequestFailed',
      errorMessage: 'no card',
    });
  });

  it('completes one authenticated pack, and keeps the pack a refusal was about', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(
      ok({ addOnId: 'radar', pricingId: 'ap-1', status: 'active', subscriptionId: 'sub-9' }),
    );
    const svc = new AppTierService(http);

    const result = await svc.completeAddOnCheckout('app-1', 'txn-2');

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/app-1/checkout/complete', {
      PaymentTransactionId: 'txn-2',
    });
    expect(result.status).toBe('active');
    expect(result.subscriptionId).toBe('sub-9');

    http.post.mockRejectedValueOnce(
      refusal(400, {
        addOnId: 'radar',
        pricingId: 'ap-1',
        status: 'failed',
        errorCode: 'PaymentNotVerified',
        errorMessage: 'Payment could not be verified',
      }),
    );
    const failed = await svc.completeAddOnCheckout('app-1', 'txn-2');
    expect(failed).toEqual({
      addOnId: 'radar',
      pricingId: 'ap-1',
      status: 'failed',
      errorCode: 'PaymentNotVerified',
      errorMessage: 'Payment could not be verified',
    });
  });
});

describe('AppTierService — pack lifecycle', () => {
  it('subscribeToAddOnDetailed returns the subscription, or a structured refusal', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'sub-1', userId: 'u-1', appId: 'app-1', appTierAddOnId: 'radar' }));
    const svc = new AppTierService(http);

    const created = await svc.subscribeToAddOnDetailed('app-1', 'radar', 'ap-1', 'txn-1');

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/app-1/subscribe', {
      AppId: 'app-1',
      AppTierAddOnId: 'radar',
      AppTierAddOnPricingId: 'ap-1',
      PaymentTransactionId: 'txn-1',
    });
    expect(created).toEqual({
      success: true,
      subscription: { id: 'sub-1', userId: 'u-1', appId: 'app-1', appTierAddOnId: 'radar' },
    });

    http.post.mockRejectedValueOnce(refusal(400, { errorCode: 'BundledInTier', errorMessage: 'Already in your plan' }));
    const refused = await svc.subscribeToAddOnDetailed('app-1', 'radar');
    expect(refused).toEqual({
      success: false,
      error: { code: 'BundledInTier', message: 'Already in your plan', status: 400 },
    });
  });

  it('cancelAddOnDetailed passes the immediate flag and surfaces the schedule', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ isScheduled: true, status: 'Active', effectiveDate: '2026-10-01T00:00:00Z' }));
    const svc = new AppTierService(http);

    const scheduled = await svc.cancelAddOnDetailed('sub-1');

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/subscriptions/sub-1/cancel?immediate=false');
    expect(scheduled).toEqual({
      success: true,
      isScheduled: true,
      status: 'Active',
      effectiveDate: '2026-10-01T00:00:00Z',
    });

    await svc.cancelAddOnDetailed('sub-1', true);
    expect(http.post).toHaveBeenLastCalledWith('api/app-tier-addons/subscriptions/sub-1/cancel?immediate=true');
  });

  it('cancelAddOnDetailed keeps the server error code on a 404 that carries one', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(
      refusal(404, { error: 'Add-on subscription not found', errorCode: 'addon_subscription_not_found' }),
    );
    const svc = new AppTierService(http);

    expect(await svc.cancelAddOnDetailed('sub-nope')).toEqual({
      success: false,
      errorCode: 'addon_subscription_not_found',
      errorMessage: 'Add-on subscription not found',
    });
  });

  it('reactivateAddOn returns the restored subscription', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'sub-1', userId: 'u-1', appId: 'app-1', status: 'Active' }));
    const svc = new AppTierService(http);

    const result = await svc.reactivateAddOn('sub-1');

    expect(http.post).toHaveBeenCalledWith('api/app-tier-addons/subscriptions/sub-1/reactivate');
    expect(result.success).toBe(true);
    expect(result.status).toBe('Active');
    expect(result.subscription?.id).toBe('sub-1');

    http.post.mockRejectedValueOnce(
      refusal(400, { error: 'Not scheduled to cancel', errorCode: 'addon_subscription_not_pending_cancellation' }),
    );
    const refused = await svc.reactivateAddOn('sub-1');
    expect(refused.success).toBe(false);
    expect(refused.errorCode).toBe('addon_subscription_not_pending_cancellation');
  });

  it('a network failure becomes RequestFailed, not NotSupported', async () => {
    const http = makeHttp();
    // This is exactly what HttpClient raises when fetch never reaches the server.
    http.post.mockRejectedValueOnce(new WildwoodError('fetch failed', 0, 'NetworkError'));
    const svc = new AppTierService(http);

    expect(await svc.cancelAddOnDetailed('sub-1')).toEqual({
      success: false,
      errorCode: 'RequestFailed',
      errorMessage: 'fetch failed',
    });
  });

  it('the deprecated boolean wrappers still answer true/false', async () => {
    const http = makeHttp();
    const svc = new AppTierService(http);

    http.post.mockResolvedValueOnce(ok({ id: 'sub-1' }));
    expect(await svc.subscribeToAddOn('app-1', 'radar')).toBe(true);

    http.post.mockRejectedValueOnce(refusal(400, { errorCode: 'TierTooLow' }));
    expect(await svc.subscribeToAddOn('app-1', 'radar')).toBe(false);

    http.post.mockResolvedValueOnce(ok({ isScheduled: true }));
    expect(await svc.cancelAddOnSubscription('sub-1')).toBe(true);

    http.post.mockRejectedValueOnce(new WildwoodError('Not Found', 404));
    expect(await svc.cancelAddOnSubscription('sub-1')).toBe(false);
  });
});

describe('AppTierService — 3-D Secure plan change', () => {
  it('the options overload posts SupportsPaymentAction', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(
      ok({
        success: false,
        requiresAction: true,
        clientSecret: 'pi_1_secret',
        pendingChangeId: 'pc-1',
        amountDue: 20,
        currency: 'USD',
      }),
    );
    const svc = new AppTierService(http);

    const result = await svc.changeTier('app-1', {
      newTierId: 'tier-2',
      newPricingId: 'pricing-7',
      supportsPaymentAction: true,
    });

    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/change', {
      NewAppTierId: 'tier-2',
      NewAppTierPricingId: 'pricing-7',
      Immediate: true,
      PaymentTransactionId: undefined,
      SupportsPaymentAction: true,
    });
    expect(result.requiresAction).toBe(true);
    expect(result.pendingChangeId).toBe('pc-1');
  });

  it('the positional overload posts exactly what it always did — no new property', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new AppTierService(http);

    await svc.changeTier('app-1', 'tier-2', 'pricing-7', true, 'txn-9');

    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/change', {
      NewAppTierId: 'tier-2',
      NewAppTierPricingId: 'pricing-7',
      Immediate: true,
      PaymentTransactionId: 'txn-9',
    });
    const [, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect('SupportsPaymentAction' in body).toBe(false);
  });

  it('completeTierChange posts the parked change id and reports refusals structurally', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, isScheduled: false, subscription: { id: 'sub-1' } }));
    const svc = new AppTierService(http);

    const done = await svc.completeTierChange('app-1', 'pc-1');
    expect(http.post).toHaveBeenCalledWith('api/app-tiers/app-1/my-subscription/change/pc-1/complete');
    expect(done.success).toBe(true);

    http.post.mockRejectedValueOnce(refusal(400, { errorCode: 'pending_change_expired', error: 'That change lapsed' }));
    const expired = await svc.completeTierChange('app-1', 'pc-1');
    expect(expired).toEqual({
      success: false,
      isScheduled: false,
      errorCode: 'pending_change_expired',
      errorMessage: 'That change lapsed',
    });
  });
});

describe('toAppTierActionError', () => {
  it('prefers the server code, names a bare 404 NotSupported, and falls back to RequestFailed', () => {
    expect(
      toAppTierActionError(refusal(404, { errorCode: 'addon_subscription_not_found', error: 'nope' }), 'fallback'),
    ).toEqual({ code: 'addon_subscription_not_found', message: 'nope', status: 404 });

    // A 404 with no code at all is the route itself being absent — a server older than this SDK.
    expect(toAppTierActionError(new WildwoodError('Not Found', 404), 'fallback')).toEqual({
      code: 'NotSupported',
      message: 'Not Found',
      status: 404,
    });

    expect(toAppTierActionError(new WildwoodError('Server Error', 500), 'fallback')).toEqual({
      code: 'RequestFailed',
      message: 'Server Error',
      status: 500,
    });

    expect(toAppTierActionError(new Error('boom'), 'fallback')).toEqual({ code: 'RequestFailed', message: 'boom' });
    expect(toAppTierActionError({}, 'fallback')).toEqual({ code: 'RequestFailed', message: 'fallback' });
  });
});
