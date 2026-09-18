'use client';

// What a plan change says about itself while it is neither waiting on the customer nor finished.
//
// Two things only, and both matter to somebody holding a card: the bank is being asked (or the
// server is still applying a change that HAS been paid for), and a failure with the way back. A
// failed change is never silent - a customer whose card was declined mid-upgrade would otherwise
// be left looking at the plan they still have.

import type { RegistrationSubscriptionLabels } from '../labels.js';
import type { PlanChangeFlow } from '../views/usePlanChangeFlow.js';

export interface PlanChangeNoticeProps {
  flow: PlanChangeFlow;
  labels: RegistrationSubscriptionLabels;
}

export function PlanChangeNotice({ flow, labels }: PlanChangeNoticeProps) {
  if (flow.step === 'authenticating' || flow.step === 'completing') {
    return (
      <div className="ww-regsub-plan-change" role="status">
        <span className="ww-spinner ww-spinner-sm" />
        <span className="ww-text-muted">
          {flow.step === 'authenticating' ? labels.authenticatingChange : labels.applyingChange}
        </span>
      </div>
    );
  }

  if (flow.step !== 'failed') return null;

  return (
    <div className="ww-alert ww-alert-danger ww-regsub-plan-change-failed" role="alert">
      <span>
        <strong>{labels.planChangeFailed}</strong>
        {flow.error ? <span className="ww-regsub-plan-change-reason">{flow.error}</span> : null}
      </span>
      <span className="ww-regsub-plan-change-actions">
        {flow.canRetry && (
          <button type="button" className="ww-btn ww-btn-sm ww-btn-outline" onClick={flow.retry}>
            {labels.tryAgain}
          </button>
        )}
        <button type="button" className="ww-alert-dismiss" onClick={flow.reset} aria-label={labels.cancel}>
          &times;
        </button>
      </span>
    </div>
  );
}
