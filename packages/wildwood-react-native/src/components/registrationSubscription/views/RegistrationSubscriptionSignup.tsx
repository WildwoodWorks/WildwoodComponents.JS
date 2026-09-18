// The signup view: an account, a plan, packs and a card, in the order that keeps them consistent.
//
// The order, every skip and every server call are the shared `useSignupFlow` - the same hook the web
// view renders from - so the two stacks cannot drift on what a registration token grants, when a
// plan is skipped or what the outcome says. This file renders whichever step the flow is on, in
// React Native primitives.
//
// One deliberate difference from the web, and it is the reason `paymentOrder` exists: this view
// defaults to ACCOUNT-FIRST. The web takes the card before the account, because a card that fails
// then leaves nothing behind. A phone may be billed through a store, and a store purchase that
// succeeds before a registration that then fails strands a paid subscription with nobody to attach
// it to - which is a support ticket, not a void. An account with no plan is the cheaper and the
// recoverable failure, so it is the one this stack risks. A customer who walks away from the card is
// not thrown away with it: the signup finishes, and the success panel says activation is pending.
//
// Two more native rules, both from the platform rather than from taste:
//
//  · A store-billed app (`requiresAppStorePayment`) buys its plan from the store, through this
//    package's existing `useInAppPurchases` / `InAppPurchaseSheet` path, and does not offer pack
//    PURCHASE at all - there is no store product behind an add-on. Packs a registration token
//    granted are unaffected; nothing is being charged for them.
//  · A card challenge needs a payment SDK this package does not ship. With no handler wired, packs
//    are bought against a card already on file or reported as not bought, never silently dropped.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Platform } from 'react-native';
import type { IapProductMapping } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import {
  resolveRegistrationSubscriptionLabels,
  useSignupFlow,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood';
import { useInAppPurchases } from '../../../hooks/useInAppPurchases';
import { DisclaimerComponent } from '../../DisclaimerComponent';
import { InAppPurchaseSheet } from '../../InAppPurchaseSheet';
import { PaymentComponent } from '../../PaymentComponent';
import { TokenRegistrationComponent } from '../../TokenRegistrationComponent';
import { ClosedNotice } from '../parts/ClosedNotice';
import { PackCheckout } from '../parts/PackCheckout';
import { PackGrid } from '../parts/PackGrid';
import { PackOutcomeList } from '../parts/PackOutcomeList';
import { PlanGrid } from '../parts/PlanGrid';
import { PlanSummaryCard } from '../parts/PlanSummaryCard';
import { TokenPlanSummary } from '../parts/TokenPlanSummary';
import { wwTestId } from '../testIds';
import type { RegistrationSubscriptionSignupProps } from '../types';
import {
  cappedPreSelectedPackIds,
  packPurchaseOffered,
  planPeriodSuffix,
  signupBody,
  signupPaymentOrder,
  signupPaymentProps,
  signupSuccessMessage,
  showsTokenPlanSummary,
  unbuyablePackOutcomes,
} from './signupViewModel';

/** The spinner-and-status panel the flow shows while it is working. */
function Working({ heading, detail }: { heading: string; detail?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.heading}>{heading}</Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </View>
  );
}

interface StorePlanPurchaseProps {
  products: IapProductMapping[];
  tierId: string;
  pricingId?: string;
  tierName: string;
  /** The Wildwood transaction the validated receipt became. */
  onPurchased: (transactionId: string) => void;
  onClose: () => void;
}

/**
 * The store's own purchase sheet, mounted only when the plan is actually being bought that way.
 *
 * Its own component because {@link useInAppPurchases} opens a store connection on mount: an app that
 * is not store-billed, or one whose plan has no product mapped to it, never gets one.
 */
function StorePlanPurchase({ products, tierId, pricingId, tierName, onPurchased, onClose }: StorePlanPurchaseProps) {
  const iap = useInAppPurchases({ products });
  return (
    <InAppPurchaseSheet
      visible
      tierId={tierId}
      pricingId={pricingId}
      tierName={tierName}
      iap={iap}
      onClose={onClose}
      onPurchased={onPurchased}
    />
  );
}

export function RegistrationSubscriptionSignup(props: RegistrationSubscriptionSignupProps) {
  const { appId, contactUrl, style, testID, iapProducts, paymentActionHandler, renderClosed, onCancel } = props;

  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const labels: RegistrationSubscriptionLabels = useMemo(
    () => resolveRegistrationSubscriptionLabels(props.labels),
    [props.labels],
  );

  // A host usually writes `preSelectedAddOnIds={['pack-a']}`, a fresh array every render, so the
  // capped list is memoised on the ids themselves rather than on the array's identity.
  const packIdsKey = (props.preSelectedAddOnIds ?? []).join(',');
  const preSelectedAddOnIds = useMemo(
    () => cappedPreSelectedPackIds(packIdsKey ? packIdsKey.split(',') : []),
    [packIdsKey],
  );

  const flow = useSignupFlow({
    ...props,
    preSelectedAddOnIds,
    paymentOrder: signupPaymentOrder(props.paymentOrder),
    platform: Platform.OS,
    deviceInfo: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(),
  });
  const { state, mode, catalog, currency, plan } = flow;

  /* Whether this device has to pay through its store. The server answers per platform, so it is
     asked rather than guessed, and an unanswerable question is read as "no": refusing to sell
     because a lookup failed would be worse than offering the card the app is configured for. */
  const [storeOnly, setStoreOnly] = useState(false);
  useEffect(() => {
    if (!resolvedAppId) return undefined;
    let live = true;
    void client.payment
      .getAvailableProviders(resolvedAppId)
      .then((providers) => {
        if (live) setStoreOnly(providers?.requiresAppStorePayment === true);
      })
      .catch(() => {
        /* Not answerable: the card path the app is configured for stands. */
      });
    return () => {
      live = false;
    };
  }, [client, resolvedAppId]);

  /* A plan can only be bought from the store when the host mapped it to a store product. That is the
     mapping it supplied, not the store's answer, so the question is settled before any connection. */
  const storeProducts = useMemo(() => iapProducts ?? [], [iapProducts]);
  const hasStoreProduct = plan != null && storeProducts.some((product) => product.tierId === plan.tier.id);

  const packsOffered = packPurchaseOffered(storeOnly);

  const body = signupBody({
    step: state.step,
    alreadySignedIn: flow.alreadySignedIn,
    hasPlan: plan != null,
    formSubmitted: state.formSubmitted,
    storeOnly,
    hasStoreProduct,
  });

  /* A store-billed device has no way to buy a pack, so the basket is reported rather than quoted:
     every pack the visitor asked for is named, with the reason it was not bought. `packsBought`
     carries the step's own token, so a repeated run is a no-op inside the machine. */
  const { checkoutItems, packNames, packsBought, skipPacks } = flow;
  useEffect(() => {
    if (state.step !== 'packCheckout' || packsOffered) return;
    packsBought(unbuyablePackOutcomes(checkoutItems, packNames, labels.finishOnWeb));
  }, [state.step, packsOffered, packsBought, checkoutItems, packNames, labels.finishOnWeb]);

  // The pack step has nothing to offer when packs cannot be bought here; skipping it is honest, and
  // the flow's own "skip" is exactly what the visitor would have pressed.
  useEffect(() => {
    if (state.step === 'packs' && !packsOffered) skipPacks();
  }, [state.step, packsOffered, skipPacks]);

  /* What the token set up, from the token check onwards: the visitor is not paying for it. Built
     once, here, and rendered by every frame this component returns - the disclaimers step returns a
     frame of its own, and a summary written into the outer one alone is a summary that step drops.
     `showsTokenPlanSummary` owns which bodies it belongs to. */
  const tokenSummary: ReactNode = showsTokenPlanSummary(body, flow.tokenGrant) ? (
    <TokenPlanSummary grant={flow.tokenGrant} labels={labels} />
  ) : null;

  let content: ReactNode;

  if (body === 'signedIn') {
    // A visitor who already has a session is the host's problem, not this component's: it says so
    // through `onAlreadySignedIn` and offers no second account.
    content = (
      <Text style={styles.notice} accessibilityRole="alert">
        {labels.alreadySignedIn}
      </Text>
    );
  } else if (body === 'closed') {
    content = renderClosed?.({ message: labels.registrationClosed, contactUrl }) ?? (
      <ClosedNotice message={labels.registrationClosed} contactUrl={contactUrl} contactLabel={labels.contactUs} />
    );
  } else if (body === 'register') {
    content = (
      <View style={styles.step}>
        {/* Whatever plan the flow is carrying: the link's, the app's default, or the one the visitor
            just picked through "change plan". A token's grant replaces it entirely. */}
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
          <View style={styles.alertDanger} accessibilityRole="alert">
            <Text style={styles.alertDangerText}>{flow.tokenMessage}</Text>
          </View>
        ) : null}

        <TokenRegistrationComponent
          appId={appId}
          registrationToken={props.registrationToken}
          requireToken={mode.requireToken}
          allowOpenRegistration={mode.allowOpenRegistration}
          showOptionalTokenEntry={mode.showOptionalTokenEntry}
          deferSubmission
          onFormDataCollected={flow.submitForm}
          initialFormData={flow.initialFormData}
          hideStepIndicator
          /* Byte-for-byte the web's two submit texts: "Create Account" when this form is the last
             thing between them and an account, "Continue" when a plan is still ahead. */
          submitButtonText={flow.planStepAhead ? labels.continueLabel : 'Create Account'}
          onCancel={onCancel}
        />
      </View>
    );
  } else if (body === 'token') {
    content = <Working heading={labels.checkingToken} />;
  } else if (body === 'plan') {
    content = (
      <View style={styles.step}>
        <Text style={styles.stepTitle}>{labels.choosePlan}</Text>
        <PlanGrid
          tiers={catalog?.tiers ?? []}
          currency={currency}
          billing={flow.billing}
          onBillingChange={flow.setBilling}
          highlightTierId={state.selection.tierId ?? props.preSelectedTierId}
          contactUrl={contactUrl}
          labels={labels}
          onSelectTier={flow.choosePlan}
        />
        <View style={styles.nav}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.back} onPress={() => flow.back('register')}>
            <Text style={styles.linkText}>{labels.back}</Text>
          </Pressable>
          {onCancel ? (
            <Pressable accessibilityRole="button" accessibilityLabel={labels.cancel} onPress={onCancel}>
              <Text style={styles.linkText}>{labels.cancel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  } else if (body === 'packs') {
    content = (
      <View style={styles.step}>
        <Text style={styles.stepTitle}>{labels.choosePacks}</Text>
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
        <View style={styles.nav}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.back} onPress={() => flow.back('register')}>
            <Text style={styles.linkText}>{labels.back}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.skipForNow} onPress={flow.skipPacks}>
            <Text style={styles.linkText}>{labels.skipForNow}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else if (plan && (body === 'payment' || body === 'storePayment' || body === 'storeUnavailable')) {
    const payment = signupPaymentProps(plan.tier, plan.pricing, currency, flow.trialDays);
    /* Account-first: the account already exists, so backing out of the card finishes the signup with
       the plan pending rather than stepping back to a form that is behind them. */
    const leavePayment = flow.paymentAfterAccount
      ? flow.paymentAbandoned
      : () => flow.back(state.options.planSelection === 'skip' ? 'register' : 'plan');
    const leaveLabel = flow.paymentAfterAccount ? labels.skipForNow : labels.back;

    content = (
      <View style={styles.step}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{labels.orderSummary}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryName}>{plan.tier.name}</Text>
            <Text style={styles.summaryPrice}>
              {plan.pricing ? formatMoney(plan.pricing.price, currency) : ''}
              <Text style={styles.summaryPeriod}>{planPeriodSuffix(plan.pricing?.billingFrequency)}</Text>
            </Text>
          </View>
          {flow.trialDays > 0 ? (
            <Text style={styles.summaryTrial}>
              {`${trialLabel(flow.trialDays)}. ${labels.dueToday}: ${formatMoney(0, currency)}`}
            </Text>
          ) : null}
        </View>

        {body === 'payment' ? (
          <PaymentComponent
            appId={appId}
            amount={payment.amount}
            currency={payment.currency}
            description={payment.description}
            pricingModelId={payment.pricingModelId}
            isSubscription
            trialDays={payment.trialDays}
            paymentActionHandler={paymentActionHandler}
            onPaymentSuccess={flow.paymentSucceeded}
            onPaymentFailure={() => {
              /* PaymentComponent shows its own message; the step stays put. */
            }}
          />
        ) : body === 'storePayment' ? (
          // The store owns the money on this device, so its own sheet takes it and hands back the
          // Wildwood transaction the validated receipt became.
          <StorePlanPurchase
            products={storeProducts}
            tierId={plan.tier.id}
            pricingId={plan.pricing?.id}
            tierName={plan.tier.name}
            onClose={leavePayment}
            onPurchased={(transactionId) => flow.paymentSucceeded({ success: true, transactionId })}
          />
        ) : (
          // Store-billed, but nothing maps this plan to a store product, so there is no way to take
          // the money here. Said plainly rather than offering a card the store would refuse.
          <View style={styles.alertInfo} accessibilityRole="alert">
            <Text style={styles.alertInfoText}>{labels.finishOnWeb}</Text>
          </View>
        )}

        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={leaveLabel}
            onPress={leavePayment}
            testID="payment-leave"
          >
            <Text style={styles.linkText}>{leaveLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else if (body === 'creating') {
    content = (
      <Working heading={flow.processingStatus || labels.statusCreatingAccount} detail={labels.processingWait} />
    );
  } else if (body === 'disclaimers') {
    // Rendered outside the outer ScrollView, the way the wizard does it: DisclaimerComponent has its
    // own flex:1 ScrollView, which collapses when nested inside another one. The frame is this
    // step's own, so it renders `tokenSummary` itself - the same element the outer frame renders.
    return (
      <View style={[styles.container, style]} testID={testID ?? wwTestId('signup', 'disclaimers')}>
        {tokenSummary ? <View style={styles.disclaimersSummary}>{tokenSummary}</View> : null}
        <View style={styles.disclaimersHeader}>
          <Text style={styles.stepTitle}>{labels.disclaimersTitle}</Text>
          <Text style={styles.muted}>{labels.disclaimersIntro}</Text>
        </View>
        <DisclaimerComponent
          autoLoad
          appId={resolvedAppId}
          onAllAccepted={flow.disclaimersDone}
          // Nothing pending after all (accepted meanwhile, or none configured): do not strand them.
          onLoaded={(count) => {
            if (count === 0) flow.disclaimersDone();
          }}
        />
      </View>
    );
  } else if (body === 'packCheckout') {
    content = packsOffered ? (
      <PackCheckout
        appId={resolvedAppId || (catalog?.appId ?? '')}
        items={flow.checkoutItems}
        names={flow.packNames}
        labels={labels}
        paymentActionHandler={paymentActionHandler}
        onFinished={flow.packsBought}
        onError={flow.report}
      />
    ) : (
      <Working heading={labels.buyingPacks} />
    );
  } else if (body === 'failed') {
    content = (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>{'✗'}</Text>
        <Text style={styles.heading}>{labels.signupFailed}</Text>
        <Text style={styles.muted}>{state.error}</Text>
        <View style={styles.processingActions}>
          <Pressable
            style={styles.primaryButton}
            accessibilityRole="button"
            accessibilityLabel={labels.tryAgain}
            onPress={flow.retry}
            testID="signup-retry"
          >
            <Text style={styles.primaryButtonText}>{labels.tryAgain}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.startOver}
            onPress={flow.startOver}
            testID="signup-start-over"
          >
            <Text style={styles.linkText}>{labels.startOver}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else if (body === 'success') {
    content = (
      <View style={styles.centered}>
        <Text style={styles.successIcon}>{'✓'}</Text>
        <Text style={styles.heading}>{labels.signupCompleteTitle}</Text>
        <Text style={styles.muted}>
          {signupSuccessMessage({
            labels,
            tokenPlanName: flow.tokenGrant?.appTierName,
            hasTokenGrant: flow.tokenGrant != null,
            hasPlan: plan != null,
            subscriptionFailed: flow.subscriptionFailed,
            planActivationPending: state.outcome?.planActivationPending === true,
            trialDays: flow.trialDays,
          })}
        </Text>
        <PackOutcomeList packs={state.outcome?.packs ?? []} labels={labels} />
        <Pressable
          style={styles.primaryButtonLg}
          accessibilityRole="button"
          accessibilityLabel={labels.getStarted}
          onPress={flow.complete}
          testID="signup-get-started"
        >
          <Text style={styles.primaryButtonText}>{labels.getStarted}</Text>
        </Pressable>
      </View>
    );
  } else {
    // `loading`, and the frame in which a payment step with nothing to charge for is on its way back
    // to the form. Never a resting state.
    content = <Working heading={labels.loadingSignup} />;
  }

  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
      testID={testID ?? wwTestId('signup', body === 'signedIn' ? '' : body)}
    >
      {tokenSummary}
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  step: { gap: 12 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  centered: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  muted: { fontSize: 14, color: '#666', textAlign: 'center' },
  notice: { fontSize: 15, color: '#1a1a1a', paddingVertical: 24, textAlign: 'center' },
  disclaimersHeader: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8, gap: 4, alignItems: 'center' },
  /* The disclaimers frame is not the padded ScrollView, so the summary is inset here instead. */
  disclaimersSummary: { paddingHorizontal: 16, paddingTop: 16 },

  alertDanger: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  alertDangerText: { color: '#991B1B', fontSize: 14 },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },

  summary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryName: { fontSize: 14, color: '#333' },
  summaryPrice: { fontSize: 16, fontWeight: '700', color: '#007AFF' },
  summaryPeriod: { fontSize: 13, fontWeight: '400', color: '#666' },
  summaryTrial: { fontSize: 13, fontWeight: '600', color: '#166534' },

  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  linkText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  errorIcon: { fontSize: 48, color: '#EF4444', fontWeight: '700' },
  successIcon: { fontSize: 48, color: '#22C55E', fontWeight: '700' },
  processingActions: { gap: 12, alignItems: 'center', marginTop: 8, alignSelf: 'stretch' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    alignSelf: 'stretch',
  },
  primaryButtonLg: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
