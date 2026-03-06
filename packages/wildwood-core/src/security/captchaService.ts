// Captcha service - reCAPTCHA/hCaptcha script injection and token retrieval
// Mirrors WildwoodComponents.Blazor captcha integration

import type { CaptchaConfiguration } from '../auth/types.js';

export class CaptchaService {
  private scriptLoaded = false;
  private config: CaptchaConfiguration | null = null;

  /** Initialize with captcha configuration */
  setConfiguration(config: CaptchaConfiguration): void {
    this.config = config;
  }

  /** Load the captcha provider script into the page */
  async loadScript(): Promise<void> {
    if (this.scriptLoaded || !this.config?.isEnabled || typeof document === 'undefined') return;

    const scriptUrl = this.config.providerType === 'hCaptcha'
      ? 'https://js.hcaptcha.com/1/api.js'
      : `https://www.google.com/recaptcha/api.js?render=${this.config.siteKey}`;

    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load captcha script: ${scriptUrl}`));
      document.head.appendChild(script);
    });
  }

  /** Execute captcha and get response token */
  async execute(): Promise<string | null> {
    if (!this.config?.isEnabled || !this.config.siteKey) return null;

    try {
      await this.loadScript();

      if (this.config.providerType === 'hCaptcha') {
        return this.executeHCaptcha();
      }
      return this.executeReCaptcha();
    } catch {
      return null;
    }
  }

  private executeReCaptcha(): Promise<string | null> {
    const grecaptcha = (globalThis as Record<string, unknown>).grecaptcha as {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    } | undefined;

    if (!grecaptcha) return Promise.resolve(null);

    return new Promise((resolve) => {
      grecaptcha.ready(() => {
        grecaptcha
          .execute(this.config!.siteKey!, { action: 'submit' })
          .then(resolve)
          .catch(() => resolve(null));
      });
    });
  }

  private executeHCaptcha(): Promise<string | null> {
    const hcaptcha = (globalThis as Record<string, unknown>).hcaptcha as {
      execute: (siteKey: string, opts?: { async: boolean }) => Promise<{ response: string }>;
    } | undefined;

    if (!hcaptcha) return Promise.resolve(null);

    return hcaptcha
      .execute(this.config!.siteKey!, { async: true })
      .then((result) => result.response)
      .catch(() => null);
  }
}
