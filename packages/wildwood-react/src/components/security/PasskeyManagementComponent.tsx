'use client';

import { useMemo, useState } from 'react';
import { usePasskeyManagement, passkeyDisplayName } from '@wildwood/react-shared';
import type { PasskeyCredentialCreator } from '@wildwood/react-shared';
import type { UserPasskey } from '@wildwood/core';
import { createPasskeyCredential, isWebAuthnSupported } from './webauthn.js';

export interface PasskeyManagementComponentProps {
  /** Defaults to the client's configured appId. */
  appId?: string;
  className?: string;
  /** Called after a passkey is added, renamed or removed. */
  onPasskeysChanged?: () => void;
  /** Replaces the browser's navigator.credentials.create ceremony (tests, custom hosts). */
  createCredential?: PasskeyCredentialCreator;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/**
 * The signed-in user's passkeys: register one on this device or a security key, rename, remove.
 * Port of .NET `PasskeyManagementComponent`; the `data-ww-passkey*` hooks match it.
 */
export function PasskeyManagementComponent({
  appId,
  className,
  onPasskeysChanged,
  createCredential,
}: PasskeyManagementComponentProps) {
  const browserSupported = useMemo(() => !!createCredential || isWebAuthnSupported(), [createCredential]);
  const ceremony = createCredential ?? (browserSupported ? createPasskeyCredential : undefined);
  const { loaded, appEnabled, passkeys, loading, error, successMessage, register, rename, remove } =
    usePasskeyManagement({ appId, createCredential: ceremony, onPasskeysChanged });

  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startRename = (p: UserPasskey) => {
    setConfirmDeleteId(null);
    setRenamingId(p.id);
    setRenameValue(passkeyDisplayName(p));
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className={`ww-passkey-management ${className ?? ''}`} data-ww-passkeys="">
      {error && (
        <div className="ww-alert ww-alert-danger" role="alert" data-ww-passkey-error="">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="ww-alert ww-alert-success" role="status" data-ww-passkey-success="">
          {successMessage}
        </div>
      )}

      {!loaded ? (
        <div className="ww-passkey-loading">
          <span className="ww-spinner ww-spinner-sm" role="status" aria-label="Loading passkeys..." />
        </div>
      ) : !appEnabled ? (
        <p className="ww-text-muted" data-ww-passkey-notice="app-disabled">
          Passkeys are not enabled for this app.
        </p>
      ) : (
        <>
          <p className="ww-text-muted ww-passkey-intro">
            A passkey signs you in with your device&apos;s fingerprint, face or PIN instead of a password. A passkey
            that verifies you counts as two-factor authentication on its own.
          </p>

          {passkeys.length === 0 ? (
            <p data-ww-passkey-empty="">You have no passkeys yet.</p>
          ) : (
            <ul className="ww-passkey-list" data-ww-passkey-list="">
              {passkeys.map((p) => (
                <li key={p.id} className="ww-passkey-item" data-ww-passkey-id={p.id}>
                  {renamingId === p.id ? (
                    <div className="ww-passkey-row">
                      <input
                        className="ww-form-control ww-form-control-sm"
                        maxLength={100}
                        aria-label="Passkey name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        data-ww-passkey-rename-input=""
                      />
                      <button
                        type="button"
                        className="ww-btn ww-btn-sm ww-btn-primary"
                        disabled={loading || !renameValue.trim()}
                        onClick={async () => {
                          if (await rename(p.id, renameValue)) cancelRename();
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="ww-btn ww-btn-sm ww-btn-outline" onClick={cancelRename}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="ww-passkey-row">
                      <div className="ww-passkey-info">
                        <strong data-ww-passkey-name="">{passkeyDisplayName(p)}</strong>
                        <div className="ww-text-muted ww-passkey-meta">
                          Added {formatDate(p.createdAt)}
                          {p.lastUsedAt ? ` · last used ${formatDate(p.lastUsedAt)}` : ' · never used'}
                        </div>
                      </div>
                      <div className="ww-passkey-actions">
                        <button
                          type="button"
                          className="ww-btn ww-btn-sm ww-btn-outline"
                          disabled={loading}
                          onClick={() => startRename(p)}
                          aria-label={`Rename ${passkeyDisplayName(p)}`}
                        >
                          Rename
                        </button>
                        {confirmDeleteId === p.id ? (
                          <>
                            <button
                              type="button"
                              className="ww-btn ww-btn-sm ww-btn-danger"
                              disabled={loading}
                              onClick={async () => {
                                if (await remove(p)) setConfirmDeleteId(null);
                              }}
                              data-ww-passkey-confirm-delete=""
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              className="ww-btn ww-btn-sm ww-btn-outline"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="ww-btn ww-btn-sm ww-btn-outline"
                            disabled={loading}
                            onClick={() => setConfirmDeleteId(p.id)}
                            aria-label={`Remove ${passkeyDisplayName(p)}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {browserSupported ? (
            <div className="ww-passkey-add">
              <div className="ww-form-group ww-passkey-add-name">
                <label className="ww-form-label">
                  Name (optional)
                  <input
                    className="ww-form-control ww-form-control-sm"
                    maxLength={100}
                    placeholder="e.g. Work laptop"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    data-ww-passkey-new-name=""
                  />
                </label>
              </div>
              <button
                type="button"
                className="ww-btn ww-btn-sm ww-btn-primary"
                disabled={loading}
                onClick={async () => {
                  if (await register(newName)) setNewName('');
                }}
                data-ww-passkey-add=""
              >
                Add a passkey
              </button>
            </div>
          ) : (
            <p className="ww-text-muted" data-ww-passkey-notice="browser-unsupported">
              This browser cannot create passkeys.
            </p>
          )}
        </>
      )}
    </div>
  );
}
