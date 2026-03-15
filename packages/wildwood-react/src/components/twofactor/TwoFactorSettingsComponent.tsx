import type { FormEvent } from 'react';
import { useTwoFactorLogic } from '@wildwood/react-shared';

export interface TwoFactorSettingsComponentProps {
  className?: string;
  onStatusChange?: (enabled: boolean) => void;
}

export function TwoFactorSettingsComponent({ className, onStatusChange }: TwoFactorSettingsComponentProps) {
  const {
    view,
    emailCode,
    authenticatorCode,
    authenticatorQrUri,
    authenticatorSecret,
    recoveryCodes,
    recoveryCodeCount,
    successMessage,
    status,
    credentials,
    trustedDevices,
    loading,
    error,
    handleEnrollEmail,
    handleVerifyEmail,
    handleBeginAuthenticator,
    handleCompleteAuthenticator,
    handleRemoveCredential,
    handleViewRecoveryCodes,
    handleRegenerateCodes,
    handleViewTrustedDevices,
    handleRevokeAllDevices,
    revokeTrustedDevice,
    cancelView,
    setEmailCode,
    setAuthenticatorCode,
  } = useTwoFactorLogic({
    onStatusChange,
    confirmAction: (title, msg) => Promise.resolve(window.confirm(msg)),
  });

  return (
    <div className={`ww-twofactor-settings ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}
      {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}

      {/* OVERVIEW */}
      {view === 'overview' && (
        <div className="ww-twofactor-overview">
          <div className="ww-twofactor-status">
            <span className={`ww-badge ${status?.isEnabled ? 'ww-badge-success' : 'ww-badge-warning'}`}>
              {status?.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <h4>Enrolled Methods</h4>
          {credentials.length === 0 ? (
            <p className="ww-text-muted">No two-factor methods enrolled.</p>
          ) : (
            <div className="ww-credential-list">
              {credentials.map((cred) => (
                <div key={cred.id} className="ww-credential-item">
                  <div className="ww-credential-info">
                    <strong>{cred.providerType}</strong>
                    {cred.displayName && <span className="ww-text-muted"> - {cred.displayName}</span>}
                  </div>
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-danger"
                    onClick={() => handleRemoveCredential(cred.id)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ww-twofactor-actions">
            <button type="button" className="ww-btn ww-btn-outline" onClick={handleEnrollEmail} disabled={loading}>
              Add Email
            </button>
            <button
              type="button"
              className="ww-btn ww-btn-outline"
              onClick={handleBeginAuthenticator}
              disabled={loading}
            >
              Add Authenticator
            </button>
            {status?.isEnabled && (
              <>
                <button
                  type="button"
                  className="ww-btn ww-btn-outline"
                  onClick={handleViewRecoveryCodes}
                  disabled={loading}
                >
                  Recovery Codes
                </button>
                <button
                  type="button"
                  className="ww-btn ww-btn-outline"
                  onClick={handleViewTrustedDevices}
                  disabled={loading}
                >
                  Trusted Devices
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ENROLL EMAIL */}
      {view === 'enrollEmail' && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            handleVerifyEmail();
          }}
          className="ww-twofactor-enroll"
        >
          <h4>Verify Email</h4>
          <p className="ww-text-muted">Enter the code sent to your email address.</p>
          <div className="ww-form-group">
            <input
              type="text"
              className="ww-form-control ww-code-input"
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              placeholder="000000"
              required
              disabled={loading}
            />
          </div>
          <div className="ww-twofactor-actions">
            <button type="submit" className="ww-btn ww-btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" className="ww-btn ww-btn-outline" onClick={cancelView}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ENROLL AUTHENTICATOR */}
      {view === 'enrollAuthenticator' && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            handleCompleteAuthenticator();
          }}
          className="ww-twofactor-enroll"
        >
          <h4>Setup Authenticator</h4>
          <p className="ww-text-muted">Scan the QR code with your authenticator app, or enter the key manually.</p>
          {authenticatorQrUri && (
            <div className="ww-qr-code">
              <img src={authenticatorQrUri} alt="QR Code" />
            </div>
          )}
          {authenticatorSecret && (
            <div className="ww-manual-key">
              <label>Manual Key:</label>
              <code>{authenticatorSecret}</code>
            </div>
          )}
          <div className="ww-form-group">
            <label>Verification Code</label>
            <input
              type="text"
              className="ww-form-control ww-code-input"
              value={authenticatorCode}
              onChange={(e) => setAuthenticatorCode(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              placeholder="000000"
              required
              disabled={loading}
            />
          </div>
          <div className="ww-twofactor-actions">
            <button type="submit" className="ww-btn ww-btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
            <button type="button" className="ww-btn ww-btn-outline" onClick={cancelView}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* RECOVERY CODES */}
      {view === 'recoveryCodes' && (
        <div className="ww-recovery-codes">
          <h4>Recovery Codes</h4>
          {recoveryCodes.length > 0 ? (
            <>
              <p className="ww-text-muted">Save these codes in a safe place. Each code can only be used once.</p>
              <div className="ww-code-grid">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="ww-recovery-code">
                    {code}
                  </code>
                ))}
              </div>
            </>
          ) : (
            <p className="ww-text-muted">
              You have {recoveryCodeCount} recovery code{recoveryCodeCount !== 1 ? 's' : ''} remaining.
            </p>
          )}
          <div className="ww-twofactor-actions">
            <button type="button" className="ww-btn ww-btn-warning" onClick={handleRegenerateCodes} disabled={loading}>
              {loading ? 'Generating...' : 'Regenerate Codes'}
            </button>
            <button type="button" className="ww-btn ww-btn-outline" onClick={cancelView}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* TRUSTED DEVICES */}
      {view === 'trustedDevices' && (
        <div className="ww-trusted-devices">
          <h4>Trusted Devices</h4>
          {trustedDevices.length === 0 ? (
            <p className="ww-text-muted">No trusted devices.</p>
          ) : (
            <div className="ww-device-list">
              {trustedDevices.map((device) => (
                <div key={device.id} className="ww-device-item">
                  <div className="ww-device-info">
                    <strong>{device.deviceName ?? 'Unknown Device'}</strong>
                    {device.lastUsedAt && (
                      <span className="ww-text-muted">
                        {' '}
                        - Last used: {new Date(device.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-danger"
                    onClick={() => revokeTrustedDevice(device.id)}
                    disabled={loading}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="ww-twofactor-actions">
            {trustedDevices.length > 0 && (
              <button
                type="button"
                className="ww-btn ww-btn-danger"
                onClick={handleRevokeAllDevices}
                disabled={loading}
              >
                Revoke All
              </button>
            )}
            <button type="button" className="ww-btn ww-btn-outline" onClick={cancelView}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
