'use client';

// The plan-change flow lives in `@wildwood/react-shared`, so the manage view, the older
// `SubscriptionAdminComponent` and React Native all drive one implementation.
//
// What React adds is the Stripe.js adapter the shared flow needs to put a 3-D Secure challenge in
// front of the customer. It is always supplied, so the wire is exactly what it was: the change is
// still posted through the options form with `supportsPaymentAction: true`, and a parked change is
// still confirmed and completed here.

import { usePlanChangeFlow as useSharedPlanChangeFlow } from '@wildwood/react-shared';
import type { PlanChangeFlow, PlanChangeFlowOptions } from '@wildwood/react-shared';
import { stripePaymentActions } from '../stripePaymentActions.js';

export { COMPLETE_RETRY_DELAY_MS } from '@wildwood/react-shared';
export type { PlanChangeFlow, PlanChangeFlowOptions } from '@wildwood/react-shared';

export function usePlanChangeFlow(options: PlanChangeFlowOptions): PlanChangeFlow {
  return useSharedPlanChangeFlow({
    ...options,
    // A host may bring its own, but on the web there is always one.
    paymentActions: options.paymentActions ?? stripePaymentActions,
  });
}
