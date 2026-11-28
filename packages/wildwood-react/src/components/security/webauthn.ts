// Browser WebAuthn creation ceremony for passkey registration. Port of the register half of .NET
// WildwoodComponents.Blazor/wwwroot/js/webauthn.js, so both web stacks build the same
// PublicKeyCredentialCreationOptions from the same server options and send back the same JSON.

interface ServerCredentialDescriptor {
  type: string;
  id: string;
  transports?: string[];
}

interface ServerRegistrationOptions {
  challenge: string;
  relyingParty?: { id?: string; name: string };
  rp?: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout?: number;
  attestation?: string;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    requireResidentKey?: boolean;
    residentKey?: string;
    userVerification?: string;
  };
  excludeCredentials?: ServerCredentialDescriptor[];
}

export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when this browser can run a WebAuthn ceremony at all. */
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * Runs `navigator.credentials.create` over the server's registration options and returns the
 * base64url JSON `completePasskeyRegistration` expects. Rejects with a user-facing message.
 */
export async function createPasskeyCredential(options: unknown): Promise<unknown> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const o = options as ServerRegistrationOptions;
  const rp = o.relyingParty ?? o.rp;
  const sel = o.authenticatorSelection;
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToArrayBuffer(o.challenge),
    rp: { id: rp?.id, name: rp?.name ?? '' },
    user: {
      id: base64UrlToArrayBuffer(o.user.id),
      name: o.user.name,
      displayName: o.user.displayName,
    },
    pubKeyCredParams: o.pubKeyCredParams.map((p) => ({ type: p.type as PublicKeyCredentialType, alg: p.alg })),
    timeout: o.timeout || 60000,
    attestation: (o.attestation || 'none') as AttestationConveyancePreference,
    authenticatorSelection: sel
      ? {
          authenticatorAttachment: (sel.authenticatorAttachment || undefined) as AuthenticatorAttachment | undefined,
          requireResidentKey: sel.requireResidentKey || false,
          residentKey: (sel.residentKey || 'preferred') as ResidentKeyRequirement,
          userVerification: (sel.userVerification || 'preferred') as UserVerificationRequirement,
        }
      : undefined,
    excludeCredentials: o.excludeCredentials?.map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64UrlToArrayBuffer(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  let credential: PublicKeyCredential;
  try {
    credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError') throw new Error('Registration was cancelled or timed out.');
    if (name === 'InvalidStateError') throw new Error('This authenticator is already registered.');
    if (name === 'NotSupportedError') throw new Error('This authenticator is not supported.');
    throw e;
  }
  if (!credential) throw new Error('Registration was cancelled or timed out.');

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: arrayBufferToBase64Url(credential.rawId),
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}
