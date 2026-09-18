'use client';

// Stage 19 replaces this stub.
//
// The props are already final (see ../types.ts) so a host can write against them now; only the
// implementation is missing. `SubscriptionAdminComponent` remains the way to manage a subscription
// until this view takes over from it.

import { useEffect, useRef } from 'react';
import { resolveLabels } from '../labels.js';
import type { RegistrationSubscriptionManageProps } from '../types.js';

/** The code `onError` reports while a view has no implementation behind it. */
const NOT_AVAILABLE_CODE = 'view_not_available';

export function RegistrationSubscriptionManage({
  className,
  labels: labelOverrides,
  onError,
}: RegistrationSubscriptionManageProps) {
  const labels = resolveLabels(labelOverrides);
  const message = labels.viewNotAvailable;

  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onError?.({ code: NOT_AVAILABLE_CODE, message });
  }, [onError, message]);

  return (
    <div className={['ww-regsub', 'ww-regsub-manage', className].filter(Boolean).join(' ')} data-ww-view="manage">
      <p className="ww-regsub-notice" role="status">
        {message}
      </p>
    </div>
  );
}
