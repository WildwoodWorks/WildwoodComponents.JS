import { describe, it, expect, vi } from 'vitest';
import { TwoFactorService } from '../security/twoFactorService.js';
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

describe('TwoFactorService', () => {
  it('getConfiguration encodes the appId and returns null on error', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('404'));
    const svc = new TwoFactorService(http);

    expect(await svc.getConfiguration('app/1')).toBeNull();
    expect(http.get).toHaveBeenCalledWith('api/twofactor/configuration/app%2F1', { skipAuth: true });
  });

  it('getStatus returns the user 2FA status', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ isEnabled: true, credentialCount: 2 }));
    const svc = new TwoFactorService(http);

    const status = await svc.getStatus();

    expect(http.get).toHaveBeenCalledWith('api/twofactor/status');
    expect(status.isEnabled).toBe(true);
  });

  it('enrollEmail posts the email to the enrollment endpoint', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ credentialId: 'cred-1' }));
    const svc = new TwoFactorService(http);

    await svc.enrollEmail('user@example.com');

    expect(http.post).toHaveBeenCalledWith('api/twofactor/enroll/email', { email: 'user@example.com' });
  });

  it('verifyEmailEnrollment returns true on success, false on failure', async () => {
    const http = makeHttp();
    const svc = new TwoFactorService(http);

    expect(await svc.verifyEmailEnrollment('cred-1', '123456')).toBe(true);
    expect(http.post).toHaveBeenCalledWith('api/twofactor/enroll/email/verify', {
      credentialId: 'cred-1',
      code: '123456',
    });

    http.post.mockRejectedValueOnce(new Error('bad code'));
    expect(await svc.verifyEmailEnrollment('cred-1', '000000')).toBe(false);
  });

  it('setPrimaryCredential PUTs to the primary endpoint', async () => {
    const http = makeHttp();
    const svc = new TwoFactorService(http);

    expect(await svc.setPrimaryCredential('cred-9')).toBe(true);
    expect(http.put).toHaveBeenCalledWith('api/twofactor/credentials/cred-9/primary');
  });

  it('removeCredential returns false when deletion throws', async () => {
    const http = makeHttp();
    http.delete.mockRejectedValueOnce(new Error('forbidden'));
    const svc = new TwoFactorService(http);

    expect(await svc.removeCredential('cred-9')).toBe(false);
  });

  it('revokeAllTrustedDevices returns the revoked count from the response', async () => {
    const http = makeHttp();
    http.delete.mockResolvedValueOnce(ok({ revokedCount: 3 }));
    const svc = new TwoFactorService(http);

    expect(await svc.revokeAllTrustedDevices()).toBe(3);
    expect(http.delete).toHaveBeenCalledWith('api/twofactor/trusted-devices');
  });
});
