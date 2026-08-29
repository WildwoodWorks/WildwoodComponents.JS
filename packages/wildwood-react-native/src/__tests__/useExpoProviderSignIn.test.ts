import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  APPLE_AUTH_NOT_INSTALLED_MESSAGE,
  APPLE_UNAVAILABLE_MESSAGE,
  AUTH_SESSION_NOT_INSTALLED_MESSAGE,
  classifyProvider,
  createExpoProviderSignIn,
  type ExpoProviderSignInConfig,
  type ProviderSignInEnvironment,
} from '../hooks/useExpoProviderSignIn';

// The callback is exercised through createExpoProviderSignIn rather than the hook: this package has
// no React renderer (no react-dom / @testing-library), and the hook is a memo over the factory, so
// the browser/native conversation is where the behaviour lives.

const CONFIG: ExpoProviderSignInConfig = {
  scheme: 'gcm',
  google: { iosClientId: 'ios-google-client', androidClientId: 'android-google-client' },
  microsoft: { clientId: 'entra-client' },
  apple: true,
};

/** Records every AuthRequest constructed, and scripts what promptAsync resolves with. */
function createAuthSessionDouble(result: unknown = { type: 'success', params: { id_token: 'google-id-token' } }) {
  const constructed: Array<Record<string, unknown>> = [];
  const prompted: unknown[] = [];
  class AuthRequest {
    constructor(config: Record<string, unknown>) {
      constructed.push(config);
    }
    async promptAsync(discovery: unknown) {
      prompted.push(discovery);
      return typeof result === 'function' ? (result as () => unknown)() : result;
    }
  }
  return {
    constructed,
    prompted,
    mod: {
      AuthRequest,
      ResponseType: { IdToken: 'id_token', Code: 'code' },
      makeRedirectUri: vi.fn((opts: { scheme?: string }) => `${opts?.scheme}://redirect`),
    } as Record<string, unknown>,
  };
}

function createAppleDouble(overrides: Record<string, unknown> = {}) {
  return {
    isAvailableAsync: vi.fn(async () => true),
    signInAsync: vi.fn(async () => ({ identityToken: 'apple-identity-token', user: 'user-1' })),
    AppleAuthenticationScope: { FULL_NAME: 1, EMAIL: 0 },
    ...overrides,
  } as Record<string, unknown>;
}

function environment(
  parts: Partial<ProviderSignInEnvironment> & { authSession?: Record<string, unknown> | null } = {},
): ProviderSignInEnvironment {
  return {
    loadAuthSession: parts.loadAuthSession ?? (async () => parts.authSession ?? null),
    loadWebBrowser: parts.loadWebBrowser ?? (async () => ({ maybeCompleteAuthSession: vi.fn() })),
    loadAppleAuthentication: parts.loadAppleAuthentication ?? (async () => null),
    platformOS: parts.platformOS ?? (() => 'ios'),
  };
}

describe('useExpoProviderSignIn - provider routing', () => {
  it('classifies the operator-configured provider names by substring', () => {
    expect(classifyProvider('Google')).toBe('google');
    expect(classifyProvider('google-workspace')).toBe('google');
    expect(classifyProvider('Microsoft')).toBe('microsoft');
    expect(classifyProvider('MicrosoftAccount')).toBe('microsoft');
    expect(classifyProvider('AzureAD')).toBe('microsoft');
    expect(classifyProvider('Entra ID')).toBe('microsoft');
    expect(classifyProvider('Apple')).toBe('apple');
    expect(classifyProvider('Facebook')).toBe('unsupported');
    expect(classifyProvider('')).toBe('unsupported');
  });

  it('routes Google and Microsoft to their own discovery documents and client ids', async () => {
    const google = createAuthSessionDouble();
    const microsoft = createAuthSessionDouble({ type: 'success', params: { id_token: 'ms-id-token' } });

    const signInGoogle = createExpoProviderSignIn(CONFIG, environment({ authSession: google.mod }));
    await expect(signInGoogle({ name: 'Google' }, null)).resolves.toBe('google-id-token');
    expect(google.constructed[0]).toMatchObject({
      clientId: 'ios-google-client',
      redirectUri: 'gcm://redirect',
      responseType: 'id_token',
      scopes: ['openid', 'profile', 'email'],
      usePKCE: false,
    });
    expect(google.prompted[0]).toMatchObject({
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    // A nonce is mandatory for an implicit id_token at both providers.
    expect((google.constructed[0].extraParams as Record<string, string>).nonce).toMatch(/^[0-9a-f]{32}$/);

    const signInMicrosoft = createExpoProviderSignIn(
      { ...CONFIG, microsoft: { clientId: 'entra-client', tenant: 'contoso.onmicrosoft.com' } },
      environment({ authSession: microsoft.mod }),
    );
    await expect(signInMicrosoft({ name: 'AzureAD' }, null)).resolves.toBe('ms-id-token');
    expect(microsoft.constructed[0]).toMatchObject({ clientId: 'entra-client' });
    expect(microsoft.prompted[0]).toMatchObject({
      authorizationEndpoint: 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize',
    });
    // Entra rejects an implicit id_token delivered on the query string.
    expect(microsoft.constructed[0].extraParams).toMatchObject({ response_mode: 'fragment' });
  });

  it('defaults the Microsoft tenant to common', async () => {
    const ms = createAuthSessionDouble({ type: 'success', params: { id_token: 't' } });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: ms.mod }));
    await signIn({ name: 'Microsoft' }, null);
    expect(ms.prompted[0]).toMatchObject({
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    });
  });

  it('picks the client id for the running platform, falling back to the web one', async () => {
    const android = createAuthSessionDouble();
    const signInAndroid = createExpoProviderSignIn(
      CONFIG,
      environment({ authSession: android.mod, platformOS: () => 'android' }),
    );
    await signInAndroid({ name: 'Google' }, null);
    expect(android.constructed[0]).toMatchObject({ clientId: 'android-google-client' });

    const web = createAuthSessionDouble();
    const signInWeb = createExpoProviderSignIn(
      { scheme: 'gcm', google: { webClientId: 'web-google-client' } },
      environment({ authSession: web.mod, platformOS: () => 'android' }),
    );
    await signInWeb({ name: 'Google' }, null);
    expect(web.constructed[0]).toMatchObject({ clientId: 'web-google-client' });
  });

  it('rejects a provider it does not implement, naming the escape hatch', async () => {
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: createAuthSessionDouble().mod }));
    await expect(signIn({ name: 'Facebook' }, null)).rejects.toThrow(/Facebook.*not handled.*onProviderSignIn/s);
  });
});

describe('useExpoProviderSignIn - the browser flow', () => {
  it('returns null when the person backs out of the browser session', async () => {
    for (const type of ['cancel', 'dismiss', 'locked']) {
      const session = createAuthSessionDouble({ type });
      const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: session.mod }));
      await expect(signIn({ name: 'Google' }, null)).resolves.toBeNull();
    }
  });

  it('reads the id_token from the authentication object when params has none', async () => {
    const session = createAuthSessionDouble({ type: 'success', authentication: { idToken: 'from-authentication' } });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: session.mod }));
    await expect(signIn({ name: 'Google' }, null)).resolves.toBe('from-authentication');
  });

  it('falls back to the authorization code when the provider returns no id_token', async () => {
    const session = createAuthSessionDouble({ type: 'success', params: { code: 'auth-code-9' } });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: session.mod }));
    await expect(signIn({ name: 'Google' }, null)).resolves.toBe('auth-code-9');
  });

  it('surfaces the provider error rather than looking like a cancel', async () => {
    const session = createAuthSessionDouble({
      type: 'error',
      params: { error: 'invalid_client', error_description: 'Unauthorized client' },
    });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: session.mod }));
    await expect(signIn({ name: 'Google' }, null)).rejects.toThrow(/Google sign-in failed: Unauthorized client/);
  });

  it('explains a success that carried no credential at all', async () => {
    const session = createAuthSessionDouble({ type: 'success', params: {} });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: session.mod }));
    await expect(signIn({ name: 'Google' }, null)).rejects.toThrow(/no id_token or authorization code/);
  });

  it('honours an explicit redirectUri instead of deriving one from the scheme', async () => {
    const session = createAuthSessionDouble();
    const signIn = createExpoProviderSignIn(
      { scheme: 'gcm', google: { iosClientId: 'ios-google-client', redirectUri: 'com.googleusercontent.apps.x:/cb' } },
      environment({ authSession: session.mod }),
    );
    await signIn({ name: 'Google' }, null);
    expect(session.constructed[0]).toMatchObject({ redirectUri: 'com.googleusercontent.apps.x:/cb' });
    expect(session.mod.makeRedirectUri).not.toHaveBeenCalled();
  });

  it('completes the pending web session only on web', async () => {
    const maybeCompleteAuthSession = vi.fn();
    const loadWebBrowser = async () => ({ maybeCompleteAuthSession });

    const native = createAuthSessionDouble();
    await createExpoProviderSignIn(CONFIG, environment({ authSession: native.mod, loadWebBrowser }))(
      { name: 'Google' },
      null,
    );
    expect(maybeCompleteAuthSession).not.toHaveBeenCalled();

    const web = createAuthSessionDouble();
    await createExpoProviderSignIn(
      { scheme: 'gcm', google: { webClientId: 'web-google-client' } },
      environment({ authSession: web.mod, loadWebBrowser, platformOS: () => 'web' }),
    )({ name: 'Google' }, null);
    expect(maybeCompleteAuthSession).toHaveBeenCalled();
  });

  it('still signs in when expo-web-browser is missing on web', async () => {
    const session = createAuthSessionDouble();
    const signIn = createExpoProviderSignIn(
      { scheme: 'gcm', google: { webClientId: 'web-google-client' } },
      environment({
        authSession: session.mod,
        loadWebBrowser: async () => {
          throw new Error("Cannot find module 'expo-web-browser'");
        },
        platformOS: () => 'web',
      }),
    );
    await expect(signIn({ name: 'Google' }, null)).resolves.toBe('google-id-token');
  });
});

describe('useExpoProviderSignIn - Sign in with Apple', () => {
  it('returns the identity token from the native sheet', async () => {
    const apple = createAppleDouble();
    const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => apple }));
    await expect(signIn({ name: 'Apple' }, null)).resolves.toBe('apple-identity-token');
    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [1, 0] });
  });

  it('reads a cancel out of the thrown error code instead of failing the sign-in', async () => {
    for (const code of ['ERR_REQUEST_CANCELED', 'ERR_CANCELED']) {
      const apple = createAppleDouble({
        signInAsync: vi.fn(async () => {
          throw Object.assign(new Error('The user canceled the authorization attempt.'), { code });
        }),
      });
      const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => apple }));
      await expect(signIn({ name: 'Apple' }, null)).resolves.toBeNull();
    }
  });

  it('rethrows a real Apple failure', async () => {
    const apple = createAppleDouble({
      signInAsync: vi.fn(async () => {
        throw Object.assign(new Error('Invalid client.'), { code: 'ERR_INVALID_RESPONSE' });
      }),
    });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => apple }));
    await expect(signIn({ name: 'Apple' }, null)).rejects.toThrow(/Invalid client/);
  });

  it('says so when the device cannot do Sign in with Apple', async () => {
    const apple = createAppleDouble({ isAvailableAsync: vi.fn(async () => false) });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => apple }));
    await expect(signIn({ name: 'Apple' }, null)).rejects.toThrow(APPLE_UNAVAILABLE_MESSAGE);
    expect(apple.signInAsync).not.toHaveBeenCalled();
  });

  it('explains a credential that carried no identity token', async () => {
    const apple = createAppleDouble({ signInAsync: vi.fn(async () => ({ user: 'user-1' })) });
    const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => apple }));
    await expect(signIn({ name: 'Apple' }, null)).rejects.toThrow(/no identity token/);
  });
});

describe('useExpoProviderSignIn - missing packages and missing config', () => {
  it('names the package to install when expo-auth-session is absent', async () => {
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: null }));
    await expect(signIn({ name: 'Google' }, null)).rejects.toThrow(AUTH_SESSION_NOT_INSTALLED_MESSAGE);
  });

  it('names the package to install when expo-apple-authentication is absent', async () => {
    const signIn = createExpoProviderSignIn(CONFIG, environment({ loadAppleAuthentication: async () => null }));
    await expect(signIn({ name: 'Apple' }, null)).rejects.toThrow(APPLE_AUTH_NOT_INSTALLED_MESSAGE);
  });

  it('says which expo-auth-session member is missing on an old version', async () => {
    const signIn = createExpoProviderSignIn(CONFIG, environment({ authSession: { ResponseType: {} } }));
    await expect(signIn({ name: 'Google' }, null)).rejects.toThrow(/does not export AuthRequest/);
  });

  it('rejects with a configuration message when a tapped provider was never configured', async () => {
    const session = createAuthSessionDouble();
    const bare = createExpoProviderSignIn({ scheme: 'gcm' }, environment({ authSession: session.mod }));

    await expect(bare({ name: 'Google' }, null)).rejects.toThrow(/Google sign-in is not configured/);
    await expect(bare({ name: 'Microsoft' }, null)).rejects.toThrow(/Microsoft sign-in is not configured/);
    await expect(bare({ name: 'Apple' }, null)).rejects.toThrow(/Sign in with Apple is not configured/);
    // Nothing reached the browser — the message is the whole outcome.
    expect(session.constructed).toHaveLength(0);
  });

  it('rejects when Google is configured, but not for the running platform', async () => {
    const session = createAuthSessionDouble();
    const signIn = createExpoProviderSignIn(
      { scheme: 'gcm', google: { iosClientId: 'ios-only' } },
      environment({ authSession: session.mod, platformOS: () => 'android' }),
    );
    await expect(signIn({ name: 'Google' }, null)).rejects.toThrow(/not configured for android.*androidClientId/s);
  });
});

/* ------------------------------------------------------------------------------------------------
 * The real loaders
 *
 * Everything above injects an environment. These drive the shipped `defaultEnvironment` — the
 * lazy load, the CJS `unwrap` interop and the "not installed" catch — against the specifiers
 * themselves, the way useInAppPurchases.test.ts does for expo-iap. All three are optional peers that
 * are deliberately NOT installed here, so `vi.doMock` on the specifier is what stands in for the
 * installed package, and a factory that throws is what "absent" looks like to the loader.
 * ---------------------------------------------------------------------------------------------- */

/** Fresh module graph per test so the lazy loads re-run against the current mock. */
async function loadHook(): Promise<typeof import('../hooks/useExpoProviderSignIn')> {
  return import('../hooks/useExpoProviderSignIn');
}

const notInstalled = (specifier: string) => () => {
  throw new Error(`Cannot find module '${specifier}'`);
};

describe('useExpoProviderSignIn - the real optional-module loaders', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('expo-auth-session');
    vi.doUnmock('expo-web-browser');
    vi.doUnmock('expo-apple-authentication');
  });

  it('loads the installed expo-auth-session and signs in through it', async () => {
    const session = createAuthSessionDouble();
    vi.doMock('expo-auth-session', () => session.mod);
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    // No environment argument: this is the code path every consumer app runs.
    await expect(create(CONFIG)({ name: 'Google' }, null)).resolves.toBe('google-id-token');
    expect(session.constructed[0]).toMatchObject({ clientId: 'ios-google-client', redirectUri: 'gcm://redirect' });
    expect(session.prompted).toHaveLength(1);

    await expect(defaultEnvironment.loadAuthSession()).resolves.toBeTruthy();
    // Platform.OS from the react-native mock.
    expect(defaultEnvironment.platformOS()).toBe('ios');
  });

  it('unwraps a CJS build that arrives as { default: module }', async () => {
    const session = createAuthSessionDouble();
    vi.doMock('expo-auth-session', () => ({ default: session.mod }));
    const { createExpoProviderSignIn: create } = await loadHook();

    await expect(create(CONFIG)({ name: 'Google' }, null)).resolves.toBe('google-id-token');
    expect(session.prompted).toHaveLength(1);
  });

  it('lets a named re-export win over the same member on the default bag', async () => {
    const session = createAuthSessionDouble();
    const namedRedirectUri = vi.fn(() => 'named://redirect');
    vi.doMock('expo-auth-session', () => ({
      default: { ...session.mod, makeRedirectUri: () => 'default-bag://redirect' },
      makeRedirectUri: namedRedirectUri,
    }));
    const { createExpoProviderSignIn: create } = await loadHook();

    await expect(create(CONFIG)({ name: 'Google' }, null)).resolves.toBe('google-id-token');
    expect(namedRedirectUri).toHaveBeenCalled();
    expect(session.constructed[0]).toMatchObject({ redirectUri: 'named://redirect' });
  });

  it('names the package to install when expo-auth-session really is absent', async () => {
    vi.doMock('expo-auth-session', notInstalled('expo-auth-session'));
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    await expect(defaultEnvironment.loadAuthSession()).resolves.toBeNull();
    await expect(create(CONFIG)({ name: 'Google' }, null)).rejects.toThrow(AUTH_SESSION_NOT_INSTALLED_MESSAGE);
  });

  it('loads expo-web-browser and completes the pending session on web', async () => {
    const session = createAuthSessionDouble();
    const maybeCompleteAuthSession = vi.fn();
    vi.doMock('expo-auth-session', () => session.mod);
    vi.doMock('expo-web-browser', () => ({ maybeCompleteAuthSession }));
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    // Only the platform is faked - both modules still come from the real loaders.
    const signIn = create(
      { scheme: 'gcm', google: { webClientId: 'web-google-client' } },
      {
        ...defaultEnvironment,
        platformOS: () => 'web',
      },
    );
    await expect(signIn({ name: 'Google' }, null)).resolves.toBe('google-id-token');
    expect(maybeCompleteAuthSession).toHaveBeenCalled();
  });

  it('signs in on web even when expo-web-browser is absent', async () => {
    const session = createAuthSessionDouble();
    vi.doMock('expo-auth-session', () => session.mod);
    vi.doMock('expo-web-browser', notInstalled('expo-web-browser'));
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    await expect(defaultEnvironment.loadWebBrowser()).resolves.toBeNull();
    const signIn = create(
      { scheme: 'gcm', google: { webClientId: 'web-google-client' } },
      {
        ...defaultEnvironment,
        platformOS: () => 'web',
      },
    );
    await expect(signIn({ name: 'Google' }, null)).resolves.toBe('google-id-token');
  });

  it('loads the installed expo-apple-authentication and returns its identity token', async () => {
    const apple = createAppleDouble();
    vi.doMock('expo-apple-authentication', () => apple);
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    await expect(create(CONFIG)({ name: 'Apple' }, null)).resolves.toBe('apple-identity-token');
    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [1, 0] });
    await expect(defaultEnvironment.loadAppleAuthentication()).resolves.toBeTruthy();
  });

  it('unwraps a CJS expo-apple-authentication build', async () => {
    const apple = createAppleDouble();
    vi.doMock('expo-apple-authentication', () => ({ default: apple }));
    const { createExpoProviderSignIn: create } = await loadHook();

    await expect(create(CONFIG)({ name: 'Apple' }, null)).resolves.toBe('apple-identity-token');
  });

  it('names the package to install when expo-apple-authentication really is absent', async () => {
    vi.doMock('expo-apple-authentication', notInstalled('expo-apple-authentication'));
    const { createExpoProviderSignIn: create, defaultEnvironment } = await loadHook();

    await expect(defaultEnvironment.loadAppleAuthentication()).resolves.toBeNull();
    await expect(create(CONFIG)({ name: 'Apple' }, null)).rejects.toThrow(APPLE_AUTH_NOT_INSTALLED_MESSAGE);
  });
});
