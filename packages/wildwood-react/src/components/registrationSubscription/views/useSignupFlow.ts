'use client';

// The signup flow lives in `@wildwood/react-shared`, so React Native drives the same order and the
// same server calls rather than a second copy of them. What is left here is the two words only a
// browser can say — the platform a registration was made from and the device it was made on — and
// the props type the view is written against.
//
// The order is untouched: React passes no `paymentOrder`, so it stays pay-first, exactly as it
// shipped.

import { useSignupFlow as useSharedSignupFlow } from '@wildwood/react-shared';
import type { SignupFlow } from '@wildwood/react-shared';
import type { RegistrationSubscriptionSignupProps } from '../types.js';

export type { ResolvedPlan, SignupFlow } from '@wildwood/react-shared';

export function useSignupFlow(props: RegistrationSubscriptionSignupProps): SignupFlow {
  return useSharedSignupFlow({
    ...props,
    platform: 'web',
    // Guarded, because the view renders under a server render too; nothing registers there.
    deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
  });
}
