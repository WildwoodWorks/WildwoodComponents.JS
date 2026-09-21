'use client';

// The signup view: an account, a plan, packs and a card, in the order that keeps them consistent.
//
// The card is taken BEFORE the account exists — a declined card then leaves nothing behind, rather
// than an account sitting on a plan nobody paid for — and the packs are bought AFTER the login,
// because they are bought as the user. `useSignupFlow` owns the order and the server calls; this
// file renders whichever step the flow is on.
//
// Every locator the live sites' end-to-end suites use is deliberate: the register form's
// "Continue" / "Create Account", `.ww-tier-grid`, PaymentComponent's own pay button and success
// panel, `.ww-signup-processing` with "Something Went Wrong" / "Try Again" / "Start Over",
// `.ww-signup-disclaimers`, and the "All Set" success panel with "Get Started". A `data-ww-step`
// attribute on the step container names the step for anything that would rather not rely on copy,
// `data-ww-action="signup-retry|signup-start-over|signup-get-started"` names the controls those
// panels offer, and `data-ww-error-message` names the failure text. That vocabulary is shared with
// the Blazor, Razor, React Native and SwiftUI ports, so one spec reads every stack.

import { DisclaimerComponent } from '../../disclaimer/DisclaimerComponent.js';
import { PaymentComponent } from '../../payment/PaymentComponent.js';
import { TokenRegistrationComponent } from '../../registration/TokenRegistrationComponent.js';
import { formatMoney, trialLabel } from '@wildwood/core';
import { ClosedNotice } from '../parts/ClosedNotice.js';
import { PackCheckout } from '../parts/PackCheckout.js';
import { PackGrid } from '../parts/PackGrid.js';
import { PackOutcomeList } from '../parts/PackOutcomeList.js';
import { PlanGrid } from '../parts/PlanGrid.js';
import { PlanSummaryCard } from '../parts/PlanSummaryCard.js';
import { TokenPlanSummary } from '../parts/TokenPlanSummary.js';
import { formatLabel } from '../labels.js';
import type { RegistrationSubscriptionSignupProps } from '../types.js';
import { useSignupFlow, type SignupFlow } from './useSignupFlow.js';

/** The spinner-and-status panel the flow shows while it is working. */
function Working({ heading, detail }: { heading: string; detail?: string }) {
  return (
    <>
      <div className="ww-reg-success-icon">
        <span className="ww-spinner ww-spinner-lg" />
      </div>
      <h3>{heading}</h3>
      {detail ? <p className="ww-text-muted">{detail}</p> : null}
    </>
  );
}

/** What the success panel says, by what actually happened. */
function successMessage(flow: SignupFlow): string {
  const { labels, tokenGrant, plan, subscriptionFailed, trialDays } = flow;
  if (tokenGrant) {
    return formatLabel(labels.signupCompleteToken, { tier: tokenGrant.appTierName ?? 'plan' });
  }
  if (!plan) return labels.signupCompletePlain;
  if (subscriptionFailed) return labels.signupCompletePending;
  if (trialDays > 0) return formatLabel(labels.signupCompleteTrial, { days: trialDays });
  return labels.signupCompleteActive;
}

export function RegistrationSubscriptionSignup(props: RegistrationSubscriptionSignupProps) {
  const { className, contactUrl, requireBillingAddress, renderClosed, onCancel } = props;
  const flow = useSignupFlow(props);
  const { state, labels, mode, catalog, currency, plan } = flow;

  const rootClasses = ['ww-regsub', 'ww-regsub-signup', className].filter(Boolean).join(' ');

  // A visitor who is already signed in is the host's problem, not this component's: it says so
  // through `onAlreadySignedIn` and renders nothing rather than offering a second account.
  if (flow.alreadySignedIn) {
    return (
      <div className={rootClasses} data-ww-view="signup">
        <p className="ww-regsub-notice" role="status">
          {labels.alreadySignedIn}
        </p>
      </div>
    );
  }

  let body;

  if (state.step === 'closed') {
    body = (
      <div className="ww-signup-step" data-ww-step="closed">
        {renderClosed?.({ message: labels.registrationClosed, contactUrl }) ?? (
          <ClosedNotice message={labels.registrationClosed} contactUrl={contactUrl} contactLabel={labels.contactUs} />
        )}
      </div>
    );
  } else if (state.step === 'loading') {
    body = (
      <div className="ww-signup-step ww-signup-processing" data-ww-step="loading">
        <Working heading={labels.loadingSignup} />
      </div>
    );
  } else if (state.step === 'register') {
    body = (
      <div className="ww-signup-step" data-ww-step="register">
        {/* Whatever plan the flow is carrying right now: the link's, the app's default, or the one
            the visitor just picked through "change plan". */}
        {!flow.tokenGrant && plan ? (
          <PlanSummaryCard
            tier={plan.tier}
            pricing={plan.pricing}
            currency={currency}
            labels={labels}
            onChangePlan={props.planSelection === 'skip' ? undefined : flow.changePlan}
          />
        ) : null}

        {flow.tokenMessage ? (
          <div className="ww-alert ww-alert-danger" role="alert">
            {flow.tokenMessage}
          </div>
        ) : null}

        <TokenRegistrationComponent
          appId={props.appId}
          registrationToken={props.registrationToken}
          requireToken={mode.requireToken}
          allowOpenRegistration={mode.allowOpenRegistration}
          showOptionalTokenEntry={mode.showOptionalTokenEntry}
          deferSubmission
          onFormDataCollected={flow.submitForm}
          initialFormData={flow.initialFormData}
          hideStepIndicator
          // "Create Account" when this form is the last thing between them and an account.
          submitButtonText={flow.planStepAhead ? 'Continue' : 'Create Account'}
          onCancel={onCancel}
        />
      </div>
    );
  } else if (state.step === 'token') {
    body = (
      <div className="ww-signup-step ww-signup-processing" data-ww-step="token">
        <Working heading={labels.checkingToken} />
      </div>
    );
  } else if (state.step === 'plan') {
    body = (
      <div className="ww-signup-step" data-ww-step="plan">
        <h3 className="ww-regsub-step-title">{labels.choosePlan}</h3>
        {/* `defaultTierId` sits ahead of the link's plan on purpose: a stale or hand-edited `?tier=`
            is an id the flow already refused, so the grid opens on the host's default rather than
            on nothing at all. */}
        <PlanGrid
          tiers={catalog?.tiers ?? []}
          currency={currency}
          billing={flow.billing}
          onBillingChange={flow.setBilling}
          highlightTierId={state.selection.tierId ?? flow.defaultTierId ?? props.preSelectedTierId}
          contactUrl={contactUrl}
          labels={labels}
          onSelectTier={flow.choosePlan}
        />
        <div className="ww-signup-step-nav">
          <button type="button" className="ww-btn ww-btn-link" onClick={() => flow.back('register')}>
            {labels.back}
          </button>
          {onCancel ? (
            <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
              {labels.cancel}
            </button>
          ) : null}
        </div>
      </div>
    );
  } else if (state.step === 'packs') {
    body = (
      <div className="ww-signup-step" data-ww-step="packs">
        <h3 className="ww-regsub-step-title">{labels.choosePacks}</h3>
        <PackGrid
          addOns={flow.availablePacks}
          currency={currency}
          selection="multi"
          selectedIds={flow.selectedPackIds}
          onToggle={flow.togglePack}
          onChoose={() => flow.choosePacks()}
          onContinue={flow.choosePacks}
          labels={labels}
        />
        <div className="ww-signup-step-nav">
          <button type="button" className="ww-btn ww-btn-link" onClick={() => flow.back('register')}>
            {labels.back}
          </button>
          <button type="button" className="ww-btn ww-btn-link" onClick={flow.skipPacks}>
            {labels.skipForNow}
          </button>
        </div>
      </div>
    );
  } else if (state.step === 'payment' && plan && state.formSubmitted) {
    // A card is only ever asked for once there is a plan to charge for AND a form behind it: a
    // payment taken without one would be a charge with no account to attach it to.
    const pricing = plan.pricing;
    body = (
      <div className="ww-signup-step" data-ww-step="payment">
        <div className="ww-payment-summary">
          <div className="ww-payment-summary-header">
            <h4>{labels.orderSummary}</h4>
          </div>
          <div className="ww-payment-summary-row">
            <span>{plan.tier.name}</span>
            <span className="ww-payment-summary-price">
              {pricing ? formatMoney(pricing.price, currency) : ''}
              <span className="ww-payment-summary-period">/{(pricing?.billingFrequency ?? '').toLowerCase()}</span>
            </span>
          </div>
          {flow.trialDays > 0 && (
            <div className="ww-order-summary-trial">
              {trialLabel(flow.trialDays)}. {labels.dueToday}: {formatMoney(0, currency)}
            </div>
          )}
        </div>

        <PaymentComponent
          appId={props.appId}
          amount={pricing?.price ?? 0}
          currency={currency}
          description={plan.tier.name}
          pricingModelId={pricing?.pricingModelId}
          isSubscription
          trialDays={flow.trialDays || undefined}
          showAmount={false}
          customerEmail={state.email}
          requireBillingAddress={requireBillingAddress}
          onPaymentSuccess={flow.paymentSucceeded}
          onPaymentFailure={() => {
            /* PaymentComponent shows its own message; the step stays put. */
          }}
          onCancel={() => flow.back(state.options.planSelection === 'skip' ? 'register' : 'plan')}
        />
      </div>
    );
  } else if (state.step === 'creating') {
    body = (
      <div className="ww-signup-step ww-signup-processing" data-ww-step="creating">
        <Working heading={flow.processingStatus || labels.statusCreatingAccount} detail={labels.processingWait} />
      </div>
    );
  } else if (state.step === 'disclaimers') {
    body = (
      <div className="ww-signup-step ww-signup-disclaimers" data-ww-step="disclaimers">
        <h3 className="ww-signup-disclaimers-title">{labels.disclaimersTitle}</h3>
        <p className="ww-text-muted">{labels.disclaimersIntro}</p>
        <DisclaimerComponent
          autoLoad
          appId={props.appId}
          onAllAccepted={flow.disclaimersDone}
          // Nothing pending after all (accepted meanwhile, or none configured): do not strand them.
          onLoaded={(count) => {
            if (count === 0) flow.disclaimersDone();
          }}
        />
      </div>
    );
  } else if (state.step === 'packCheckout') {
    body = (
      <div className="ww-signup-step" data-ww-step="packCheckout">
        <PackCheckout
          appId={props.appId ?? catalog?.appId ?? ''}
          items={flow.checkoutItems}
          names={flow.packNames}
          labels={labels}
          onFinished={flow.packsBought}
          onError={flow.report}
        />
      </div>
    );
  } else if (state.step === 'failed') {
    body = (
      <div className="ww-signup-step ww-signup-processing" data-ww-step="failed">
        <div className="ww-reg-success-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ww-danger, #dc3545)"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h3>{labels.signupFailed}</h3>
        {/* `data-ww-error-message` names the failure text: `.ww-text-muted` is shared with the
            processing steps' "please wait", which a stack that keeps every panel in the DOM would
            report as the cause of the failure. */}
        <p className="ww-text-muted" data-ww-error-message>
          {state.error}
        </p>
        <div className="ww-signup-processing-actions">
          <button type="button" className="ww-btn ww-btn-primary" data-ww-action="signup-retry" onClick={flow.retry}>
            {labels.tryAgain}
          </button>
          <button
            type="button"
            className="ww-btn ww-btn-link"
            data-ww-action="signup-start-over"
            onClick={flow.startOver}
          >
            {labels.startOver}
          </button>
        </div>
      </div>
    );
  } else if (state.step === 'done') {
    body = (
      <div className="ww-signup-step ww-signup-success" data-ww-step="success">
        <div className="ww-reg-success-icon">
          {/* Integer coordinates on purpose: the dynamic-pricing guard reads a decimal as a price. */}
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="17 9 11 16 7 12" />
          </svg>
        </div>
        <h3>{labels.signupCompleteTitle}</h3>
        <p className="ww-text-muted">{successMessage(flow)}</p>
        <PackOutcomeList packs={state.outcome?.packs ?? []} labels={labels} />
        <button
          type="button"
          className="ww-btn ww-btn-primary ww-btn-lg"
          data-ww-action="signup-get-started"
          onClick={flow.complete}
        >
          {labels.getStarted}
        </button>
      </div>
    );
  } else {
    // 'payment' with nothing to charge for: no plan left in the catalog, or a form that was never
    // submitted. There is no card form to show, and `useSignupFlow` has already dispatched the way
    // back to the form — this is the frame in between, not a resting state.
    body = (
      <div className="ww-signup-step ww-signup-processing" data-ww-step={flow.stepName}>
        <Working heading={labels.loadingSignup} />
      </div>
    );
  }

  return (
    <div className={rootClasses} data-ww-view="signup">
      {/* What the token set up, from the token check onwards: the visitor is not paying for it. */}
      {flow.tokenGrant ? <TokenPlanSummary grant={flow.tokenGrant} labels={labels} /> : null}
      {body}
    </div>
  );
}
