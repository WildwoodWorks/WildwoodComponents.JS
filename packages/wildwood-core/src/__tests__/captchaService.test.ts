import { describe, it, expect, vi, afterEach } from 'vitest';
import { CaptchaService } from '../security/captchaService.js';
import type { CaptchaConfiguration } from '../auth/types.js';

function config(overrides: Partial<CaptchaConfiguration> = {}): CaptchaConfiguration {
  return {
    isEnabled: true,
    providerType: 'reCAPTCHA',
    siteKey: 'site-key',
    minimumScore: 0.5,
    requireForLogin: false,
    requireForRegistration: false,
    requireForPasswordReset: false,
    ...overrides,
  };
}

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g.grecaptcha;
  delete g.hcaptcha;
});

describe('CaptchaService', () => {
  it('execute returns null when no configuration has been set', async () => {
    const svc = new CaptchaService();
    expect(await svc.execute()).toBeNull();
  });

  it('execute returns null when captcha is disabled', async () => {
    const svc = new CaptchaService();
    svc.setConfiguration(config({ isEnabled: false }));
    expect(await svc.execute()).toBeNull();
  });

  it('execute returns null when enabled but no site key is configured', async () => {
    const svc = new CaptchaService();
    svc.setConfiguration(config({ siteKey: undefined }));
    expect(await svc.execute()).toBeNull();
  });

  it('loadScript is a no-op (resolves) when captcha is disabled', async () => {
    const svc = new CaptchaService();
    svc.setConfiguration(config({ isEnabled: false }));
    await expect(svc.loadScript()).resolves.toBeUndefined();
  });

  it('execute drives the reCAPTCHA global and returns its token', async () => {
    const execute = vi.fn(async () => 'recaptcha-token');
    g.grecaptcha = { ready: (cb: () => void) => cb(), execute };
    const svc = new CaptchaService();
    svc.setConfiguration(config({ providerType: 'reCAPTCHA' }));

    const token = await svc.execute();

    expect(token).toBe('recaptcha-token');
    expect(execute).toHaveBeenCalledWith('site-key', { action: 'submit' });
  });

  it('execute drives the hCaptcha global and unwraps the response', async () => {
    const execute = vi.fn(async () => ({ response: 'hcaptcha-token' }));
    g.hcaptcha = { execute };
    const svc = new CaptchaService();
    svc.setConfiguration(config({ providerType: 'hCaptcha' }));

    const token = await svc.execute();

    expect(token).toBe('hcaptcha-token');
    expect(execute).toHaveBeenCalledWith('site-key', { async: true });
  });

  it('execute resolves to null when the provider global is absent', async () => {
    const svc = new CaptchaService();
    svc.setConfiguration(config({ providerType: 'reCAPTCHA' }));

    // No grecaptcha on globalThis → executeReCaptcha returns null.
    expect(await svc.execute()).toBeNull();
  });
});
