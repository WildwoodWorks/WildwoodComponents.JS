// Pure decisions for the React Native PasskeyManagementComponent, kept out of the component so they
// are testable without a renderer (the same split as signupViewModel / manageView).

/** Which body the screen shows. Mirrors the branches of .NET PasskeyManagementComponent. */
export type PasskeyManagementBody = 'loading' | 'app-disabled' | 'list';

export function passkeyManagementBody(state: { loaded: boolean; appEnabled: boolean }): PasskeyManagementBody {
  if (!state.loaded) return 'loading';
  if (!state.appEnabled) return 'app-disabled';
  return 'list';
}

/** "Added 11/1/2026 · last used 11/3/2026" / "… · never used". Dates the device cannot parse are dropped. */
export function passkeyMetaLine(
  passkey: { createdAt?: string | null; lastUsedAt?: string | null },
  formatDate: (d: Date) => string = (d) => d.toLocaleDateString(),
): string {
  const fmt = (v?: string | null) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : formatDate(d);
  };
  const added = fmt(passkey.createdAt);
  const used = fmt(passkey.lastUsedAt);
  return `Added ${added}${used ? ` · last used ${used}` : ' · never used'}`;
}

/**
 * React Native and SwiftUI carry the web's `data-ww-passkey*` hooks as identifiers. The flat
 * namespace uses the attribute's own name as the prefix, as the other native identifiers do.
 */
export const PASSKEY_TEST_IDS = {
  root: 'passkeys',
  list: 'passkey-list',
  empty: 'passkey-empty',
  error: 'passkey-error',
  success: 'passkey-success',
  add: 'passkey-add',
  newName: 'passkey-new-name',
  renameInput: 'passkey-rename-input',
  confirmDelete: 'passkey-confirm-delete',
  noticeAppDisabled: 'passkey-notice:app-disabled',
  noticeUnsupported: 'passkey-notice:unsupported',
  row: (id: string) => `passkey-id:${id}`,
} as const;
