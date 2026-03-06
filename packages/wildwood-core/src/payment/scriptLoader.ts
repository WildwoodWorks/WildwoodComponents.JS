// Script loader - dynamic injection of payment provider scripts (Stripe, PayPal, etc.)
// Mirrors WildwoodComponents.Blazor script injection patterns

const loadedScripts = new Map<string, Promise<void>>();

export interface ScriptLoadOptions {
  async?: boolean;
  defer?: boolean;
  attributes?: Record<string, string>;
}

/**
 * Dynamically load an external script into the page.
 * Returns a promise that resolves when the script is loaded.
 * Deduplicates by URL - calling with the same URL returns the same promise.
 */
export function loadScript(url: string, options?: ScriptLoadOptions): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('loadScript requires a browser environment'));
  }

  const existing = loadedScripts.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = options?.async ?? true;
    if (options?.defer) script.defer = true;

    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        script.setAttribute(key, value);
      }
    }

    script.onload = () => resolve();
    script.onerror = () => {
      loadedScripts.delete(url);
      reject(new Error(`Failed to load script: ${url}`));
    };

    document.head.appendChild(script);
  });

  loadedScripts.set(url, promise);
  return promise;
}

/** Load the Stripe.js script */
export function loadStripe(): Promise<void> {
  return loadScript('https://js.stripe.com/v3/');
}

/** Load the PayPal SDK script */
export function loadPayPal(clientId: string, currency = 'USD'): Promise<void> {
  return loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}`);
}

/** Load the Apple Pay JS SDK */
export function loadApplePay(): Promise<void> {
  return loadScript('https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js');
}

/** Load the Google Pay JS SDK */
export function loadGooglePay(): Promise<void> {
  return loadScript('https://pay.google.com/gp/p/js/pay.js');
}

/** Check if a script has been loaded */
export function isScriptLoaded(url: string): boolean {
  return loadedScripts.has(url);
}
