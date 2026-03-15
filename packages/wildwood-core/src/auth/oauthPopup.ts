// OAuth popup management - ported from WildwoodComponents.Blazor/wwwroot/js/wildwood-oauth.js
// Opens provider authorization URLs in a popup window and listens for callback results.

export interface OAuthPopupResult {
  success: boolean;
  type?: string;
  response?: unknown;
  error?: string;
}

/**
 * Opens an OAuth popup window and returns a promise that resolves with the auth result.
 * The popup's callback page must post a message with `{ type: 'wildwood-oauth-callback', success, response?, error? }`.
 */
export function openOAuthPopup(authorizationUrl: string): Promise<OAuthPopupResult> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OAuth popup requires a browser environment'));
  }

  return new Promise<OAuthPopupResult>((resolve, reject) => {
    // Calculate centered popup position
    const width = 500;
    const height = 650;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      authorizationUrl,
      'wildwood-oauth-popup',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      reject(new Error('Popup was blocked by the browser. Please allow popups for this site.'));
      return;
    }

    let resolved = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'wildwood-oauth-callback') {
        resolved = true;
        cleanup();
        resolve(event.data as OAuthPopupResult);
      }
    };

    window.addEventListener('message', onMessage);

    // Poll to detect if the popup was closed without completing
    pollTimer = setInterval(() => {
      if (popup.closed && !resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Login popup was closed' });
      }
    }, 500);
  });
}

/**
 * Checks if popups are likely supported/allowed in the current environment.
 */
export function isPopupSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.open === 'function';
}
