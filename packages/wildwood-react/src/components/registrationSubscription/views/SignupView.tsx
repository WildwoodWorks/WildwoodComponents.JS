'use client';

// Stage 18 replaces this stub.
//
// The props are already final (see ../types.ts) so a host can write against them now; only the
// implementation is missing. Until it lands the view says so and reports it once, rather than
// rendering a half-signup a visitor could get stuck in.

import { useEffect, useRef } from 'react';
import { resolveLabels } from '../labels.js';
import type { RegistrationSubscriptionSignupProps } from '../types.js';

/** The code `onError` reports while a view has no implementation behind it. */
const NOT_AVAILABLE_CODE = 'view_not_available';

export function RegistrationSubscriptionSignup({
  className,
  labels: labelOverrides,
  onError,
}: RegistrationSubscriptionSignupProps) {
  const labels = resolveLabels(labelOverrides);
  const message = labels.viewNotAvailable;

  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onError?.({ code: NOT_AVAILABLE_CODE, message });
  }, [onError, message]);

  return (
    <div className={['ww-regsub', 'ww-regsub-signup', className].filter(Boolean).join(' ')} data-ww-view="signup">
      <p className="ww-regsub-notice" role="status">
        {message}
      </p>
    </div>
  );
}
