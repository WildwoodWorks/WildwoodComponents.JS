'use client';

// One entry point for everything a customer does with money on this platform: see the price list,
// sign up and buy, and manage what they bought.
//
// It is a thin switch and nothing more. The three views are separate modules with no shared runtime
// state, so a landing page or a prerender that imports `RegistrationSubscriptionPricing` directly
// pulls in the pricing view alone — this component exists for hosts that would rather pass a prop
// than pick an import. There is no provider of its own: like every other component here it reads
// the client out of `WildwoodProvider`.

import { RegistrationSubscriptionPricing } from './views/PricingView.js';
import { RegistrationSubscriptionSignup } from './views/SignupView.js';
import { RegistrationSubscriptionManage } from './views/ManageView.js';
import type { RegistrationAndSubscriptionComponentProps } from './types.js';

export function RegistrationAndSubscriptionComponent(props: RegistrationAndSubscriptionComponentProps) {
  if (props.view === 'signup') {
    const { view, ...rest } = props;
    return <RegistrationSubscriptionSignup {...rest} />;
  }

  if (props.view === 'manage') {
    const { view, ...rest } = props;
    return <RegistrationSubscriptionManage {...rest} />;
  }

  const { view, ...rest } = props;
  return <RegistrationSubscriptionPricing {...rest} />;
}
