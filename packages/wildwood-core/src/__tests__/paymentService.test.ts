import { describe, it, expect, vi } from 'vitest';
import { PaymentService } from '../payment/paymentService.js';
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

describe('PaymentService', () => {
  it('getAppPaymentConfiguration returns null on failure', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('500'));
    const svc = new PaymentService(http);

    expect(await svc.getAppPaymentConfiguration('app-1')).toBeNull();
  });

  it('getAvailableProviders fetches the platform-filtered provider list', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ providers: [{ code: 'stripe' }] }));
    const svc = new PaymentService(http);

    const res = await svc.getAvailableProviders('app-1');

    expect(http.get).toHaveBeenCalledWith('api/payment/providers/app-1');
    expect(res.providers).toHaveLength(1);
  });

  it('initiatePayment posts the request body verbatim', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ transactionId: 'txn-1' }));
    const svc = new PaymentService(http);

    const request = { appId: 'app-1', amount: 1000, currency: 'usd' };
    const res = await svc.initiatePayment(request as never);

    expect(http.post).toHaveBeenCalledWith('api/payment/initiate', request);
    expect(res.transactionId).toBe('txn-1');
  });

  it('requestRefund posts the transaction id with optional amount and reason', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new PaymentService(http);

    await svc.requestRefund('txn-1', 500, 'duplicate charge');

    const [url, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('api/payment/refund');
    expect(body.transactionId).toBe('txn-1');
    expect(body.amount).toBe(500);
    expect(body.reason).toBe('duplicate charge');
  });

  it('deleteSavedPaymentMethod returns true on success and false on error', async () => {
    const http = makeHttp();
    const svc = new PaymentService(http);

    expect(await svc.deleteSavedPaymentMethod('pm-1')).toBe(true);
    expect(http.delete).toHaveBeenCalledWith('api/payment/methods/pm-1');

    http.delete.mockRejectedValueOnce(new Error('boom'));
    expect(await svc.deleteSavedPaymentMethod('pm-1')).toBe(false);
  });

  it('setDefaultPaymentMethod posts to the default endpoint', async () => {
    const http = makeHttp();
    const svc = new PaymentService(http);

    const result = await svc.setDefaultPaymentMethod('pm-9');

    expect(http.post).toHaveBeenCalledWith('api/payment/methods/pm-9/default');
    expect(result).toBe(true);
  });
});
