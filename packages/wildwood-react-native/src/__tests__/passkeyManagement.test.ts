import { describe, it, expect } from 'vitest';
import { passkeyManagementBody, passkeyMetaLine, PASSKEY_TEST_IDS } from '../components/security/passkeyManagementView';
import * as reactNative from '../index';

describe('passkeyManagementBody', () => {
  it('follows the .NET component’s branches', () => {
    expect(passkeyManagementBody({ loaded: false, appEnabled: true })).toBe('loading');
    expect(passkeyManagementBody({ loaded: true, appEnabled: false })).toBe('app-disabled');
    expect(passkeyManagementBody({ loaded: true, appEnabled: true })).toBe('list');
  });
});

describe('passkeyMetaLine', () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  it('reports never-used passkeys', () => {
    expect(passkeyMetaLine({ createdAt: '2026-11-01T00:00:00Z', lastUsedAt: null }, fmt)).toBe(
      'Added 2026-11-01 · never used',
    );
  });

  it('reports the last use', () => {
    expect(passkeyMetaLine({ createdAt: '2026-11-01T00:00:00Z', lastUsedAt: '2026-11-03T00:00:00Z' }, fmt)).toBe(
      'Added 2026-11-01 · last used 2026-11-03',
    );
  });

  it('drops an unparseable date rather than printing Invalid Date', () => {
    expect(passkeyMetaLine({ createdAt: 'nope', lastUsedAt: 'nope' }, fmt)).toBe('Added  · never used');
  });
});

describe('passkey identifiers', () => {
  it('are prefixed with the web attribute’s own name', () => {
    expect(PASSKEY_TEST_IDS.row('pk-1')).toBe('passkey-id:pk-1');
    expect(PASSKEY_TEST_IDS.noticeAppDisabled).toBe('passkey-notice:app-disabled');
  });
});

describe('exports', () => {
  it('exports the component, the hook and the display-name rule', () => {
    expect(typeof reactNative.PasskeyManagementComponent).toBe('function');
    expect(typeof reactNative.usePasskeyManagement).toBe('function');
    expect(reactNative.passkeyDisplayName({ friendlyName: '  ', isPlatformAuthenticator: false })).toBe('Security key');
  });
});
