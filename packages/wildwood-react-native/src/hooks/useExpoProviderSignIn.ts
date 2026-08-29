import { useMemo } from 'react';
import { Platform } from 'react-native';

/* ------------------------------------------------------------------------------------------------
 * Public types
 * ---------------------------------------------------------------------------------------------- */

export interface ExpoGoogleSignInConfig {
  /** The OAuth client id of type "iOS" from the Google Cloud console. */
  iosClientId?: string;
  /** The OAuth client id of type "Android" from the Google Cloud console. */
  androidClientId?: string;
  /** Used on web, and as the fallback when the platform-specific id is not configured. */
  webClientId?: string;
  /**
   * Overrides the redirect uri derived from {@link ExpoProviderSignInConfig.scheme}. Google's iOS
   * clients want the reversed client id (`com.googleusercontent.apps.<id>:/oauthredirect`), which is
   * not the app's own scheme.
   */
  redirectUri?: string;
}

export interface ExpoMicrosoftSignInConfig {
  /** The Entra ID (Azure AD) application (client) id. */
  clientId: string;
  /** Directory to authenticate against: a tenant id, `common`, `organizations`, `consumers`. Default `common`. */
  tenant?: string;
  /** Overrides the redirect uri derived from {@link ExpoProviderSignInConfig.scheme}. */
  redirectUri?: string;
}

export interface ExpoProviderSignInConfig {
  /** The app's `scheme` from app.json — the deep link the browser session returns through. */
  scheme: string;
  google?: ExpoGoogleSignInConfig;
  microsoft?: ExpoMicrosoftSignInConfig;
  /** Enables native Sign in with Apple (requires expo-apple-authentication and an iOS build). */
  apple?: boolean;
}

/**
 * The `onProviderSignIn` shape {@link AuthenticationComponent} expects. Typed structurally on
 * `{ name }` so it satisfies the component's `AuthProvider` parameter without importing core.
 */
export type ExpoProviderSignInCallback = (
  provider: { name: string },
  authorizationUrl: string | null,
) => Promise<string | null>;

/* ------------------------------------------------------------------------------------------------
 * Messages — exported so consumers (and tests) can match on them
 * ---------------------------------------------------------------------------------------------- */

export const AUTH_SESSION_NOT_INSTALLED_MESSAGE =
  'Social sign-in is unavailable: expo-auth-session is not installed. Run `npx expo install expo-auth-session expo-web-browser`.';

export const APPLE_AUTH_NOT_INSTALLED_MESSAGE =
  'Sign in with Apple is unavailable: expo-apple-authentication is not installed. Run `npx expo install expo-apple-authentication` and rebuild the native app.';

export const APPLE_UNAVAILABLE_MESSAGE =
  'Sign in with Apple is not available on this device. It requires iOS 13 or later on a native build.';

/* ------------------------------------------------------------------------------------------------
 * Optional module loading — lazy, never a static top-level import
 * ---------------------------------------------------------------------------------------------- */

/** Expo's surfaces differ across SDK versions, so they are consumed as bags of maybe-members. */
type ModuleBag = Record<string, unknown>;

// `declare` only — this emits nothing, it just types Metro's module-scoped require.
declare const require: ((id: string) => unknown) | undefined;

/**
 * Reads one export off a module. Guarded because a module namespace is not always a plain object:
 * some interop wrappers (and Vitest's mock proxies) THROW on a member that does not exist.
 */
function member(mod: ModuleBag, name: string): unknown {
  try {
    return mod[name];
  } catch {
    return undefined;
  }
}

/** Interop: some bundlers hand back `{ default: module }` for a CJS build. */
function unwrap(mod: ModuleBag, probe: string): ModuleBag {
  const inner = member(mod, 'default') as ModuleBag | undefined;
  if (inner && typeof inner === 'object' && member(mod, probe) === undefined) {
    try {
      // Named re-exports win over the default bag when a bundler provides both.
      return { ...inner, ...mod };
    } catch {
      return inner;
    }
  }
  return mod;
}

/**
 * Loads an optional Expo module without ever making the app depend on it.
 *
 * Both calls are deliberately inside try/catch AND deliberately use a literal specifier. Metro marks
 * a dependency inside a try block as OPTIONAL, so an app that never taps a social provider neither
 * installs these packages nor needs a native rebuild — but only a literal specifier is statically
 * analysable; `import(someVariable)` is a hard Metro BUILD error, not a runtime one. `require` comes
 * first because it is the form Metro's optional-dependency handling is built around; the dynamic
 * import covers runtimes where `require` is not a free variable.
 *
 * The `@ts-ignore`s are load-bearing: these packages are intentionally not installed here, so
 * TypeScript cannot resolve them — and `@ts-expect-error` would break the DTS build for anyone who
 * HAS installed them, because then the error it expects no longer occurs.
 */
async function loadAuthSessionModule(): Promise<ModuleBag | null> {
  try {
    if (typeof require === 'function') {
      const required = require('expo-auth-session') as ModuleBag | undefined;
      if (required) return unwrap(required, 'AuthRequest');
    }
  } catch {
    /* not installed under this bundler — fall through to the dynamic import */
  }
  try {
    // @ts-ignore -- optional peer: resolves when the consumer installs expo-auth-session, errors when absent; ts-ignore tolerates both states where ts-expect-error cannot
    const imported = (await import('expo-auth-session')) as ModuleBag;
    return imported ? unwrap(imported, 'AuthRequest') : null;
  } catch {
    return null;
  }
}

async function loadWebBrowserModule(): Promise<ModuleBag | null> {
  try {
    if (typeof require === 'function') {
      const required = require('expo-web-browser') as ModuleBag | undefined;
      if (required) return unwrap(required, 'maybeCompleteAuthSession');
    }
  } catch {
    /* not installed under this bundler — fall through to the dynamic import */
  }
  try {
    // @ts-ignore -- optional peer: resolves when the consumer installs expo-web-browser, errors when absent; ts-ignore tolerates both states where ts-expect-error cannot
    const imported = (await import('expo-web-browser')) as ModuleBag;
    return imported ? unwrap(imported, 'maybeCompleteAuthSession') : null;
  } catch {
    return null;
  }
}

async function loadAppleAuthenticationModule(): Promise<ModuleBag | null> {
  try {
    if (typeof require === 'function') {
      const required = require('expo-apple-authentication') as ModuleBag | undefined;
      if (required) return unwrap(required, 'signInAsync');
    }
  } catch {
    /* not installed under this bundler — fall through to the dynamic import */
  }
  try {
    // @ts-ignore -- optional peer: resolves when the consumer installs expo-apple-authentication, errors when absent; ts-ignore tolerates both states where ts-expect-error cannot
    const imported = (await import('expo-apple-authentication')) as ModuleBag;
    return imported ? unwrap(imported, 'signInAsync') : null;
  } catch {
    return null;
  }
}

/**
 * The environment the sign-in flow runs against. Injected so the flow can be tested without a
 * device, a browser, or any of the optional peers installed.
 *
 * @internal Consumers use {@link useExpoProviderSignIn}, which supplies the real modules.
 */
export interface ProviderSignInEnvironment {
  loadAuthSession(): Promise<ModuleBag | null>;
  loadWebBrowser(): Promise<ModuleBag | null>;
  loadAppleAuthentication(): Promise<ModuleBag | null>;
  /** `Platform.OS` — picks the platform's client id and gates the web-only browser handoff. */
  platformOS(): string;
}

/**
 * The real environment: the lazy loaders above plus React Native's `Platform`.
 *
 * @internal Exported for tests, which drive the loaders against a mocked specifier. Deliberately not
 * re-exported from the package entry point.
 */
export const defaultEnvironment: ProviderSignInEnvironment = {
  loadAuthSession: loadAuthSessionModule,
  loadWebBrowser: loadWebBrowserModule,
  loadAppleAuthentication: loadAppleAuthenticationModule,
  platformOS: () => Platform.OS as string,
};

/* ------------------------------------------------------------------------------------------------
 * Provider identification
 * ---------------------------------------------------------------------------------------------- */

export type ExpoSignInProviderKind = 'google' | 'microsoft' | 'apple' | 'unsupported';

/**
 * Wildwood provider names are operator-configured, so match the way the component's icon mapping
 * does: normalized, by substring. 'Microsoft', 'MicrosoftAccount', 'AzureAD' and 'Entra' are all
 * the same identity provider.
 *
 * @internal Exported for tests.
 */
export function classifyProvider(providerName: string): ExpoSignInProviderKind {
  const name = String(providerName ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (name.includes('google')) return 'google';
  if (name.includes('microsoft') || name.includes('azure') || name.includes('entra')) return 'microsoft';
  if (name.includes('apple')) return 'apple';
  return 'unsupported';
}

/* ------------------------------------------------------------------------------------------------
 * Discovery documents
 *
 * expo-auth-session's `useAutoDiscovery` is a HOOK, and the callback runs on a tap — it cannot call
 * one. Both providers' endpoints are stable and public, so they are constants instead, which also
 * spares the flow a network round-trip before the browser opens.
 * ---------------------------------------------------------------------------------------------- */

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

function microsoftDiscovery(tenant: string) {
  const t = encodeURIComponent(tenant);
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
    endSessionEndpoint: `https://login.microsoftonline.com/${t}/oauth2/v2.0/logout`,
  };
}

const OIDC_SCOPES = ['openid', 'profile', 'email'];

/* ------------------------------------------------------------------------------------------------
 * Result reading — expo-auth-session's result shape varies with responseType and SDK version
 * ---------------------------------------------------------------------------------------------- */

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bag(value: unknown): ModuleBag {
  return value && typeof value === 'object' ? (value as ModuleBag) : {};
}

/**
 * The credential Wildwood's `loginWithProvider` is handed. An id_token is preferred (the server
 * validates it directly); an authorization code is the fallback for providers configured to return
 * one, which the server exchanges with its own client secret.
 */
function extractCredential(result: ModuleBag): string | null {
  const params = bag(member(result, 'params'));
  const authentication = bag(member(result, 'authentication'));
  return (
    str(member(params, 'id_token')) ??
    str(member(params, 'idToken')) ??
    str(member(authentication, 'idToken')) ??
    str(member(authentication, 'id_token')) ??
    str(member(params, 'code')) ??
    str(member(result, 'code')) ??
    null
  );
}

/** Cancel, dismiss and locked all mean "the person backed out" — not an error worth a banner. */
function isCancelled(type: string): boolean {
  return type === 'cancel' || type === 'dismiss' || type === 'locked';
}

function errorMessageFrom(result: ModuleBag, providerLabel: string): string {
  const params = bag(member(result, 'params'));
  const error = bag(member(result, 'error'));
  const detail =
    str(member(params, 'error_description')) ??
    str(member(error, 'message')) ??
    str(member(error, 'description')) ??
    str(member(params, 'error')) ??
    str(member(result, 'errorCode'));
  return detail ? `${providerLabel} sign-in failed: ${detail}` : `${providerLabel} sign-in failed.`;
}

/** A nonce is mandatory for an implicit id_token at both Google and Microsoft. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => unknown } }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    // No CSPRNG in this runtime. The nonce only has to be unguessable-enough per request, and the
    // authorization response is bound to it by the provider either way.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------------------------------------
 * The flow — a plain async function with no React in it, so it is testable without a renderer
 * ---------------------------------------------------------------------------------------------- */

interface OAuthPromptOptions {
  providerLabel: string;
  clientId: string;
  redirectUri?: string;
  discovery: Record<string, string>;
  extraParams: Record<string, string>;
}

interface AuthRequestInstance {
  promptAsync(discovery: unknown, options?: unknown): Promise<unknown>;
}

async function promptForCredential(env: ProviderSignInEnvironment, scheme: string, options: OAuthPromptOptions) {
  const authSession = await env.loadAuthSession();
  if (!authSession) throw new Error(AUTH_SESSION_NOT_INSTALLED_MESSAGE);

  // Web only: completes the redirect in the popup that expo-web-browser opened. It is a no-op —
  // and on some versions a throw — anywhere else, and the module is optional, so both are tolerated.
  if (env.platformOS() === 'web') {
    try {
      const webBrowser = await env.loadWebBrowser();
      const maybeComplete = webBrowser && member(webBrowser, 'maybeCompleteAuthSession');
      if (typeof maybeComplete === 'function') (maybeComplete as () => unknown)();
    } catch {
      /* the auth session still completes through the redirect itself */
    }
  }

  const AuthRequest = member(authSession, 'AuthRequest');
  if (typeof AuthRequest !== 'function') {
    throw new Error(
      'Social sign-in is unavailable: the installed expo-auth-session version does not export AuthRequest. Upgrade expo-auth-session.',
    );
  }

  let redirectUri = options.redirectUri;
  if (!redirectUri) {
    const makeRedirectUri = member(authSession, 'makeRedirectUri');
    if (typeof makeRedirectUri !== 'function') {
      throw new Error(
        'Social sign-in is unavailable: the installed expo-auth-session version does not export makeRedirectUri. Pass an explicit redirectUri, or upgrade expo-auth-session.',
      );
    }
    redirectUri = String((makeRedirectUri as (opts: unknown) => unknown)({ scheme }) ?? '');
  }

  // Ask for the id_token directly: Wildwood's loginWithProvider validates it server-side, so there
  // is nothing for the app to exchange. PKCE is deliberately off — a verifier held by the app is
  // meaningless for an implicit id_token, and would be unusable by the server if a code came back.
  const responseTypes = bag(member(authSession, 'ResponseType'));
  const responseType = str(member(responseTypes, 'IdToken')) ?? 'id_token';

  const request = new (AuthRequest as new (config: unknown) => AuthRequestInstance)({
    clientId: options.clientId,
    scopes: OIDC_SCOPES,
    redirectUri,
    responseType,
    usePKCE: false,
    extraParams: { nonce: randomNonce(), ...options.extraParams },
  });

  const result = bag(await request.promptAsync(options.discovery));
  const type = String(member(result, 'type') ?? '');
  if (isCancelled(type)) return null;
  if (type !== 'success') throw new Error(errorMessageFrom(result, options.providerLabel));

  const credential = extractCredential(result);
  if (!credential) {
    throw new Error(
      `${options.providerLabel} sign-in returned no id_token or authorization code. Check that the client id is configured for this platform and that the redirect uri is registered.`,
    );
  }
  return credential;
}

async function signInWithApple(env: ProviderSignInEnvironment): Promise<string | null> {
  const apple = await env.loadAppleAuthentication();
  if (!apple) throw new Error(APPLE_AUTH_NOT_INSTALLED_MESSAGE);

  const isAvailableAsync = member(apple, 'isAvailableAsync');
  if (typeof isAvailableAsync === 'function') {
    const available = await (isAvailableAsync as () => unknown)();
    if (!available) throw new Error(APPLE_UNAVAILABLE_MESSAGE);
  }

  const signInAsync = member(apple, 'signInAsync');
  if (typeof signInAsync !== 'function') {
    throw new Error(
      'Sign in with Apple is unavailable: the installed expo-apple-authentication version does not export signInAsync. Upgrade expo-apple-authentication.',
    );
  }

  const scopes = bag(member(apple, 'AppleAuthenticationScope'));
  const requestedScopes = [member(scopes, 'FULL_NAME') ?? 1, member(scopes, 'EMAIL') ?? 0];

  let credential: ModuleBag;
  try {
    credential = bag(await (signInAsync as (options: unknown) => unknown)({ requestedScopes }));
  } catch (err) {
    // ERR_REQUEST_CANCELED / ERR_CANCELED, depending on the module version.
    const code = String(member(bag(err), 'code') ?? '').toLowerCase();
    if (code.includes('cancel')) return null;
    throw err instanceof Error ? err : new Error('Sign in with Apple failed.');
  }

  const identityToken = str(member(credential, 'identityToken'));
  if (!identityToken) {
    throw new Error('Sign in with Apple returned no identity token.');
  }
  return identityToken;
}

/**
 * Builds the `onProviderSignIn` callback. Pure: the browser, the store and the platform all arrive
 * through `env`.
 *
 * Errors are thrown rather than swallowed — `AuthenticationComponent` wraps the callback in a
 * try/catch and renders the message in its error banner, which is exactly where a missing package
 * or an unconfigured client id needs to be read. `null` is reserved for "the person cancelled".
 *
 * @internal Exported for tests. Consumers use {@link useExpoProviderSignIn}.
 */
export function createExpoProviderSignIn(
  config: ExpoProviderSignInConfig,
  env: ProviderSignInEnvironment = defaultEnvironment,
): ExpoProviderSignInCallback {
  return async (provider) => {
    const kind = classifyProvider(provider?.name ?? '');

    switch (kind) {
      case 'google': {
        const google = config.google;
        if (!google) {
          throw new Error(
            'Google sign-in is not configured: pass `google: { iosClientId, androidClientId, webClientId }` to useExpoProviderSignIn, or disable the Google provider for this app.',
          );
        }
        const os = env.platformOS();
        const clientId =
          (os === 'ios' ? google.iosClientId : os === 'android' ? google.androidClientId : google.webClientId) ??
          google.webClientId;
        if (!clientId) {
          throw new Error(
            `Google sign-in is not configured for ${os}: set ${
              os === 'android' ? 'androidClientId' : os === 'ios' ? 'iosClientId' : 'webClientId'
            } (or webClientId) in the google config.`,
          );
        }
        return promptForCredential(env, config.scheme, {
          providerLabel: 'Google',
          clientId,
          ...(google.redirectUri !== undefined ? { redirectUri: google.redirectUri } : {}),
          discovery: GOOGLE_DISCOVERY,
          extraParams: {},
        });
      }

      case 'microsoft': {
        const microsoft = config.microsoft;
        if (!microsoft?.clientId) {
          throw new Error(
            'Microsoft sign-in is not configured: pass `microsoft: { clientId }` to useExpoProviderSignIn, or disable the Microsoft provider for this app.',
          );
        }
        return promptForCredential(env, config.scheme, {
          providerLabel: 'Microsoft',
          clientId: microsoft.clientId,
          ...(microsoft.redirectUri !== undefined ? { redirectUri: microsoft.redirectUri } : {}),
          discovery: microsoftDiscovery(microsoft.tenant ?? 'common'),
          // Entra ID rejects an implicit id_token delivered on the query string.
          extraParams: { response_mode: 'fragment' },
        });
      }

      case 'apple': {
        if (!config.apple) {
          throw new Error(
            'Sign in with Apple is not configured: pass `apple: true` to useExpoProviderSignIn, or disable the Apple provider for this app.',
          );
        }
        return signInWithApple(env);
      }

      default:
        throw new Error(
          `"${provider?.name ?? 'This provider'}" is not handled by useExpoProviderSignIn (it covers Google, Microsoft and Apple). Pass your own onProviderSignIn for it.`,
        );
    }
  };
}

/* ------------------------------------------------------------------------------------------------
 * The hook
 * ---------------------------------------------------------------------------------------------- */

/**
 * The Expo half of social sign-in, as one callback for `AuthenticationComponent`'s
 * `onProviderSignIn`.
 *
 * ```tsx
 * const onProviderSignIn = useExpoProviderSignIn({
 *   scheme: 'gcm',
 *   google: { iosClientId: '...', androidClientId: '...' },
 *   microsoft: { clientId: '...' },
 *   apple: true,
 * });
 *
 * <AuthenticationComponent appId={APP_ID} onProviderSignIn={onProviderSignIn} />
 * ```
 *
 * Google and Microsoft run through expo-auth-session (an `AuthRequest` against the provider's
 * static discovery document, returning an id_token); Apple runs through the native
 * expo-apple-authentication sheet. All three packages are OPTIONAL peers loaded lazily, so an app
 * with no social providers installs none of them and needs no native rebuild.
 *
 * The callback resolves the credential Wildwood exchanges for a session, `null` when the person
 * cancels, and rejects with a message the component shows in its banner when a package is missing
 * or a client id is not configured. The component's `authorizationUrl` argument is ignored: the
 * native flow needs a native redirect uri and the platform's own client id, which the server-issued
 * web authorization url does not carry.
 */
export function useExpoProviderSignIn(config: ExpoProviderSignInConfig): ExpoProviderSignInCallback {
  // The config is almost always an inline literal, so key the callback on its content rather than
  // its identity — otherwise every parent render would hand the component a new callback.
  const configKey = JSON.stringify([
    config.scheme,
    config.google?.iosClientId ?? null,
    config.google?.androidClientId ?? null,
    config.google?.webClientId ?? null,
    config.google?.redirectUri ?? null,
    config.google ? 1 : 0,
    config.microsoft?.clientId ?? null,
    config.microsoft?.tenant ?? null,
    config.microsoft?.redirectUri ?? null,
    config.apple ?? false,
  ]);

  return useMemo(() => {
    const [
      scheme,
      iosClientId,
      androidClientId,
      webClientId,
      googleRedirectUri,
      hasGoogle,
      microsoftClientId,
      tenant,
      microsoftRedirectUri,
      apple,
    ] = JSON.parse(configKey) as [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      number,
      string | null,
      string | null,
      string | null,
      boolean,
    ];

    return createExpoProviderSignIn({
      scheme,
      ...(hasGoogle
        ? {
            google: {
              ...(iosClientId !== null ? { iosClientId } : {}),
              ...(androidClientId !== null ? { androidClientId } : {}),
              ...(webClientId !== null ? { webClientId } : {}),
              ...(googleRedirectUri !== null ? { redirectUri: googleRedirectUri } : {}),
            },
          }
        : {}),
      ...(microsoftClientId !== null
        ? {
            microsoft: {
              clientId: microsoftClientId,
              ...(tenant !== null ? { tenant } : {}),
              ...(microsoftRedirectUri !== null ? { redirectUri: microsoftRedirectUri } : {}),
            },
          }
        : {}),
      apple,
    });
  }, [configKey]);
}
