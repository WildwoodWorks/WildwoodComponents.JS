'use client';

// The signup flow, driven.
//
// The order and every skip live in react-shared's `signupMachine`; this hook is the half that has
// to touch the world — it reads the app's registration mode and catalog, runs the server calls a
// step asks for, and dispatches the result back. The view below it only renders `state.step`.
//
// Two rules keep it honest:
//
//  · Every async step is claimed by the machine's step token before it starts. StrictMode runs
//    mount effects twice, payment SDKs call back twice, and a visitor can double-click anything —
//    all three land on a token that has already been claimed, so nothing registers, charges or
//    buys twice.
//
//  · What the flow does after the card is taken is the wizard's `processSignup`, ported whole:
//    register, log in, link the payment to the new user, subscribe. The completed sub-steps are
//    tracked in refs so "Try Again" resumes instead of registering the same person again.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  AddOnCheckoutItemInput,
  AppTierAddOnModel,
  AppTierModel,
  AppTierPricingModel,
  PaymentCompletionResult,
  PublicCatalog,
  RegistrationFormData,
  RegistrationTokenAppGrant,
} from '@wildwood/core';
import { WildwoodError, parseAddOnIdList, resolvePriceOption } from '@wildwood/core';
import {
  initialSignupState,
  signupTransition,
  useRegistrationSubscription,
  type SignupCatalogNames,
  type SignupPackOutcome,
  type SignupRegistrationMode,
  type SignupState,
  type SignupStep,
  type StepToken,
} from '@wildwood/react-shared';
import { resolveLabels, type RegistrationSubscriptionLabels } from '../labels.js';
import type { PricingBilling, RegistrationSubscriptionError, RegistrationSubscriptionSignupProps } from '../types.js';

/** The plan the signup is buying, resolved against the live catalog. */
export interface ResolvedPlan {
  tier: AppTierModel;
  pricing: AppTierPricingModel | null;
}

/** Everything {@link RegistrationSubscriptionSignup} renders from. */
export interface SignupFlow {
  state: SignupState;
  /** The value of `data-ww-step`: the machine's step, with `done` spelled out for the DOM. */
  stepName: string;
  labels: RegistrationSubscriptionLabels;
  /** Whether the visitor already had a session when the flow started. */
  alreadySignedIn: boolean;

  mode: SignupRegistrationMode;
  catalog: PublicCatalog | null;
  /** The currency every price on screen is quoted in. */
  currency: string;
  /**
   * The plan the signup is carrying: the one a link preselected, the app's default in a `skip`
   * flow, or whatever the visitor last chose in the grid. Null until there is one.
   */
  plan: ResolvedPlan | null;
  /** Whether a plan is still to be chosen, which is what the form's submit button says. */
  planStepAhead: boolean;
  /** The plan the grid opens on when nothing has chosen one. A highlight only: the machine never sees it. */
  defaultTierId: string | undefined;
  /** The grant this app's registration token carries, with the server's display names. */
  tokenGrant: RegistrationTokenAppGrant | null;
  /** A rejected token, shown above the form. */
  tokenMessage: string | null;
  /** Free-trial days on the chosen plan, or 0. */
  trialDays: number;
  /** Set when the account was created but the plan could not be activated. */
  subscriptionFailed: boolean;
  /** What the flow is doing while the account is being created. */
  processingStatus: string;
  /** The form as last submitted, so a step back re-fills it. */
  formData: RegistrationFormData | null;
  /** The registration form's initial values: the previous attempt's, or the invitation's email. */
  initialFormData: RegistrationFormData | undefined;
  /** The packs still to buy after login. */
  checkoutItems: AddOnCheckoutItemInput[];
  /** Pack names from the catalog, for outcomes the quote never priced. */
  packNames: Record<string, string>;
  /** The packs on offer at the pack step: everything the app sells that the token did not grant. */
  availablePacks: AppTierAddOnModel[];
  /** Packs ticked on the pack step. */
  selectedPackIds: string[];
  billing: PricingBilling;

  setBilling: (billing: PricingBilling) => void;
  togglePack: (addOnId: string) => void;
  submitForm: (data: RegistrationFormData) => void;
  choosePlan: (tier: AppTierModel) => void;
  choosePacks: () => void;
  skipPacks: () => void;
  changePlan: () => void;
  back: (step: 'register' | 'plan' | 'packs') => void;
  paymentSucceeded: (result: PaymentCompletionResult) => void;
  disclaimersDone: () => void;
  packsBought: (packs: SignupPackOutcome[]) => void;
  retry: () => void;
  startOver: () => void;
  complete: () => void;
  report: (error: RegistrationSubscriptionError) => void;
}

/** A registration the server refused, carrying the code it refused it with. */
class RegistrationRefused extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RegistrationRefused';
    this.code = code;
  }
}

/** A failure, as a code a host can branch on and a message it can show. */
function toFailure(err: unknown, fallbackCode: string, fallbackMessage: string): RegistrationSubscriptionError {
  if (err instanceof RegistrationRefused) {
    return { code: err.code, message: err.message || fallbackMessage };
  }
  if (err instanceof WildwoodError) {
    // The server's own error code when it sent one — a 403 `RegistrationNotAllowed` is a different
    // problem from a 403 anything-else, and a host that routes on it needs to see it.
    const body = err.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : null;
    const serverCode = typeof body?.errorCode === 'string' ? body.errorCode.trim() : '';
    return { code: serverCode || err.code, message: err.message || fallbackMessage };
  }
  if (err instanceof Error && err.message) return { code: fallbackCode, message: err.message };
  return { code: fallbackCode, message: fallbackMessage };
}

/** Whether a plan has to be paid for before the account is created. */
function requiresPayment(tier: AppTierModel, pricing: AppTierPricingModel | null): boolean {
  return !tier.isFreeTier && pricing != null && pricing.price > 0;
}

/** The `data-ww-step` name for a machine step. */
function stepNameOf(step: SignupStep): string {
  return step === 'done' ? 'success' : step;
}

export function useSignupFlow(props: RegistrationSubscriptionSignupProps): SignupFlow {
  const {
    appId,
    currency,
    labels: labelOverrides,
    onError,
    preSelectedTierId,
    preSelectedPricingId,
    preSelectedAddOnIds,
    registrationToken,
    prefillEmail,
    planSelection = 'choose',
    planDefault = 'none',
    packSelection = 'none',
    tokenMode = 'auto',
    onAlreadySignedIn,
    onSignupComplete,
    onEntitlementsChanged,
    initialCatalog,
  } = props;

  const labels = useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);
  const invite = tokenMode === 'required';

  const {
    catalog,
    catalogLoading,
    catalogError,
    refreshCatalog,
    mode,
    modeLoading,
    client,
    notifyEntitlementsChanged,
  } = useRegistrationSubscription({ appId, currency, initialCatalog, tokenMode });
  const resolvedAppId = appId ?? client.config.appId ?? '';

  const [state, dispatch] = useReducer(signupTransition, undefined, () =>
    initialSignupState({
      tokenMode,
      planSelection,
      packSelection: packSelection === 'multi' ? 'choose' : 'none',
    }),
  );

  const [formData, setFormData] = useState<RegistrationFormData | null>(null);
  const [tokenGrant, setTokenGrant] = useState<RegistrationTokenAppGrant | null>(null);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const [billing, setBilling] = useState<PricingBilling>('monthly');
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [chosenPlan, setChosenPlan] = useState<ResolvedPlan | null>(null);

  // Completed sub-steps, so Try Again resumes rather than registering the same person again.
  const registered = useRef(false);
  const loggedIn = useRef(false);
  const disclaimersPending = useRef(false);
  // The plan's payment: the id to subscribe with, and the provider's own id, which is what the
  // server looks a transaction up by when it is linked to the new user.
  const paymentTxn = useRef<{ transactionId?: string; externalId?: string }>({});
  // One run per step token.
  const runs = useRef<Record<string, StepToken | null>>({});
  const claim = (key: string, token: StepToken | null): boolean => {
    if (!token || runs.current[key] === token) return false;
    runs.current[key] = token;
    return true;
  };
  const signedInNotified = useRef(false);
  const entitlementsNotified = useRef(false);
  // The pack checkout reports back with the token its step was entered on.
  const stepToken = useRef<StepToken | null>(null);
  stepToken.current = state.token;

  const displayCurrency = currency ?? catalog?.currency ?? '';

  const report = useCallback(
    (error: RegistrationSubscriptionError) => {
      onError?.(error);
    },
    [onError],
  );

  const names = useMemo<SignupCatalogNames>(
    () => ({
      tiers: Object.fromEntries((catalog?.tiers ?? []).map((tier) => [tier.id, tier.name])),
      addOns: Object.fromEntries((catalog?.addOns ?? []).map((addOn) => [addOn.id, addOn.name])),
    }),
    [catalog],
  );

  /** The plan the flow starts with: a link's, or the app's default when the host skips the step. */
  const presetPlan = useMemo<ResolvedPlan | null>(() => {
    // An invite's plan comes from its token, not from the link or the app's default.
    if (!catalog || invite) return null;
    const tiers = catalog.tiers;

    if (planSelection === 'skip') {
      // The URL never picks a plan in a skip flow: the app has one, and this is it.
      const tier = tiers.find((candidate) => candidate.isDefault) ?? tiers.find((candidate) => candidate.isFreeTier);
      return tier ? { tier, pricing: resolvePriceOption(tier) ?? null } : null;
    }

    if (!preSelectedTierId) return null;
    const wanted = preSelectedTierId.toLowerCase();
    // A plan the app does not sell is ignored rather than honoured: the link is stale or edited.
    const tier = tiers.find((candidate) => candidate.id?.toLowerCase() === wanted);
    return tier ? { tier, pricing: resolvePriceOption(tier, { pricingId: preSelectedPricingId }) ?? null } : null;
  }, [catalog, invite, planSelection, preSelectedTierId, preSelectedPricingId]);

  /** The plan the grid opens on when nothing has chosen one: highlighted, still confirmed by a click. */
  const defaultTierId = useMemo(() => {
    // An invite's plan comes from its token, so there is nothing to suggest.
    if (planDefault !== 'free' || invite) return undefined;
    return catalog?.tiers.find((candidate) => candidate.isFreeTier)?.id;
  }, [planDefault, invite, catalog]);

  // A host that writes `preSelectedAddOnIds={['pack-a']}` hands over a new array on every render,
  // so the ids are compared by value here: a memo keyed on the array itself would recompute
  // forever, and the effect that seeds the pack step from it would re-run forever with it.
  const packIdsKey = (preSelectedAddOnIds ?? []).join(',');

  /** The packs the link asked for, kept to what the app actually sells and capped by core. */
  const presetPackIds = useMemo(
    () => (catalog && !invite ? parseAddOnIdList(packIdsKey, catalog) : []),
    [catalog, invite, packIdsKey],
  );

  // ── Loading: the mode, the catalog, and what the link already chose ──────────

  useEffect(() => {
    // Latched on the first pass only: a login later in this very flow must not look like "you were
    // already signed in".
    dispatch({ type: 'INIT', signedIn: client.session.isAuthenticated });
    if (state.step !== 'loading') return;

    if (!modeLoading && !state.modeReady) dispatch({ type: 'MODE_LOADED', mode });

    if (catalog) {
      if (!state.catalogReady) {
        dispatch({
          type: 'SELECTION_RESOLVED',
          tierId: presetPlan?.tier.id,
          pricingId: presetPlan?.pricing?.id ?? undefined,
          addOnIds: presetPackIds,
          requiresPayment: presetPlan ? requiresPayment(presetPlan.tier, presetPlan.pricing) : false,
        });
        dispatch({ type: 'CATALOG_LOADED', names });
      }
    } else if (catalogError && !catalogLoading) {
      dispatch({ type: 'LOAD_FAILED', message: catalogError });
    }
  }, [state, client, mode, modeLoading, catalog, catalogError, catalogLoading, names, presetPlan, presetPackIds]);

  // The plan the machine is carrying, named from the catalog.
  const plan = useMemo<ResolvedPlan | null>(() => {
    if (chosenPlan) return chosenPlan;
    if (!catalog || !state.selection.tierId) return null;
    const tier = catalog.tiers.find((candidate) => candidate.id === state.selection.tierId);
    if (!tier) return null;
    return { tier, pricing: resolvePriceOption(tier, { pricingId: state.selection.pricingId }) ?? null };
  }, [chosenPlan, catalog, state.selection.tierId, state.selection.pricingId]);

  const trialDays = plan && requiresPayment(plan.tier, plan.pricing) ? (plan.pricing?.trialDays ?? 0) : 0;

  // Seed the pack step with whatever the link chose, once the catalog has vetted the ids.
  useEffect(() => {
    if (presetPackIds.length > 0) setSelectedPackIds(presetPackIds);
  }, [presetPackIds]);

  /** The packs still worth offering: a pack the token already granted is not one of them. */
  const availablePacks = useMemo(() => {
    const granted = new Set(state.tokenGrant?.addOnIds ?? []);
    return (catalog?.addOns ?? []).filter((addOn) => !granted.has(addOn.id));
  }, [catalog, state.tokenGrant]);

  // Drop a granted pack from the selection too, so it is neither charged for nor shown as chosen.
  useEffect(() => {
    const granted = state.tokenGrant?.addOnIds ?? [];
    if (granted.length === 0) return;
    setSelectedPackIds((current) => {
      const kept = current.filter((id) => !granted.includes(id));
      return kept.length === current.length ? current : kept;
    });
  }, [state.tokenGrant]);

  const alreadySignedIn = state.initialized && state.alreadySignedInLatched;

  useEffect(() => {
    if (!alreadySignedIn || signedInNotified.current) return;
    signedInNotified.current = true;
    onAlreadySignedIn?.();
  }, [alreadySignedIn, onAlreadySignedIn]);

  // ── The registration token ──────────────────────────────────────────────────

  const latest = useRef({ formData, plan, tokenGrant, labels, report, onSignupComplete, onEntitlementsChanged });
  latest.current = { formData, plan, tokenGrant, labels, report, onSignupComplete, onEntitlementsChanged };

  useEffect(() => {
    // A rejected token is handled below; re-checking it here would ask the same question forever.
    if (state.step !== 'token' || state.tokenChecking || state.tokenError) return;
    const data = latest.current.formData;
    if (data?.useToken && data.registrationToken) dispatch({ type: 'TOKEN_CHECK_STARTED' });
    else dispatch({ type: 'TOKEN_SKIPPED' });
  }, [state.step, state.tokenChecking, state.tokenError]);

  useEffect(() => {
    if (state.step !== 'token' || !state.tokenChecking) return;
    const token = state.token;
    if (!claim('token', token)) return;

    void (async () => {
      const value = latest.current.formData?.registrationToken ?? '';
      // A null answer is "the details could not be read", not "invalid": the token still grants
      // app access, so the signup carries on as an ordinary one.
      const details = await client.auth.getRegistrationTokenDetails(value);
      if (details && !details.isValid) {
        const message = details.errorMessage ?? 'Invalid or expired registration token';
        latest.current.report({ code: 'registration_token_rejected', message });
        setTokenMessage(message);
        dispatch({ type: 'TOKEN_REJECTED', token: token as StepToken, message });
        return;
      }
      const grant = details?.appGrants.find(
        (candidate) => candidate.appId?.toLowerCase() === resolvedAppId.toLowerCase(),
      );
      setTokenGrant(grant ?? null);
      dispatch({
        type: 'TOKEN_ACCEPTED',
        token: token as StepToken,
        value,
        grant: grant
          ? {
              tierId: grant.appTierId,
              pricingId: grant.appTierPricingId,
              addOnIds: grant.addOnIds ?? [],
              featureCodes: grant.featureCodes ?? [],
            }
          : undefined,
      });
    })();
  }, [state.step, state.tokenChecking, state.token, client, resolvedAppId]);

  // A rejected token is a form error: back to the form, with the server's words above it.
  useEffect(() => {
    if (state.step === 'token' && state.tokenError) dispatch({ type: 'GO_TO', step: 'register' });
  }, [state.step, state.tokenError]);

  // ── Creating the account (the wizard's processSignup, ported) ────────────────

  const runSignup = useCallback(
    async (token: StepToken) => {
      const data = latest.current.formData;
      if (!data) {
        // Nothing to register with. The machine gates this on the submitted form, so it should be
        // unreachable — and if it ever is reached, the way out is the form, not a failure the
        // visitor can only retry into the same emptiness.
        dispatch({ type: 'GO_TO', step: 'register' });
        return;
      }
      const grant = latest.current.tokenGrant;
      const chosen = latest.current.plan;
      const copy = latest.current.labels;

      try {
        if (!registered.current) {
          setProcessingStatus(copy.statusCreatingAccount);
          if (data.useToken && data.registrationToken) {
            const response = await client.auth.registerWithToken({
              registrationToken: data.registrationToken,
              firstName: data.firstName,
              lastName: data.lastName,
              username: data.username,
              email: data.email,
              password: data.password,
              appId: resolvedAppId,
              platform: 'web',
              deviceInfo: navigator.userAgent,
            });
            registered.current = true;
            // Some token registrations answer with tokens; use them rather than logging in again.
            if (response.jwtToken) {
              await client.session.login(response);
              loggedIn.current = true;
              if (response.requiresDisclaimerAcceptance && response.pendingDisclaimers?.length) {
                disclaimersPending.current = true;
              }
            }
          } else {
            const result = await client.auth.registerOpen({
              firstName: data.firstName,
              lastName: data.lastName,
              username: data.username,
              email: data.email,
              password: data.password,
              appId: resolvedAppId,
              platform: 'web',
              deviceInfo: navigator.userAgent,
            });
            if (!result.success) {
              throw new RegistrationRefused(
                result.message || 'Registration failed. Please try again.',
                result.errorCode || 'registration_refused',
              );
            }
            registered.current = true;
          }
        }

        if (!loggedIn.current) {
          setProcessingStatus(copy.statusSigningIn);
          const loginResponse = await client.auth.login({
            username: data.username || data.email,
            email: data.email,
            password: data.password ?? '',
            appId: resolvedAppId,
            platform: 'web',
            deviceInfo: navigator.userAgent,
          });
          if (loginResponse.jwtToken) {
            await client.session.login(loginResponse);
            // Only once a session is really stored: the disclaimer step's accepts are authenticated.
            if (loginResponse.requiresDisclaimerAcceptance && loginResponse.pendingDisclaimers?.length) {
              disclaimersPending.current = true;
            }
          }
          loggedIn.current = true;
        }

        const userId = client.session.userId ?? '';

        // The plan's card was taken before the account existed, so the transaction belongs to
        // nobody until now. The server looks it up by the provider's own id.
        const linkId = paymentTxn.current.externalId ?? paymentTxn.current.transactionId;
        if (linkId && userId) {
          try {
            await client.payment.linkTransactionToUser(linkId, userId);
          } catch {
            // Non-fatal: the payment succeeded and the link can be repaired later.
          }
        }

        // A granted plan is already subscribed by the token's registration; subscribing over it
        // would replace what the token issuer is paying for.
        if (chosen && !grant) {
          setProcessingStatus(copy.statusActivatingPlan);
          const subscribeResult = await client.appTier
            .selfSubscribe(resolvedAppId, chosen.tier.id, chosen.pricing?.id, paymentTxn.current.transactionId)
            .catch((err: unknown) => ({
              success: false,
              errorMessage: err instanceof Error ? err.message : String(err),
            }));
          if (!subscribeResult.success) {
            // Never fatal: the account exists, and a plan can be activated from the dashboard.
            setSubscriptionFailed(true);
          }
        }

        dispatch({
          type: 'ACCOUNT_CREATED',
          token,
          userId,
          requiresDisclaimers: disclaimersPending.current,
        });
      } catch (err) {
        const failure = toFailure(err, 'signup_failed', 'Signup failed. Please try again.');
        latest.current.report(failure);
        dispatch({ type: 'ACCOUNT_FAILED', token, message: failure.message });
      }
    },
    [client, resolvedAppId],
  );

  useEffect(() => {
    if (state.step !== 'creating') return;
    // Belt and braces over the machine's own gate: an account is never created from no details.
    if (!latest.current.formData) {
      dispatch({ type: 'GO_TO', step: 'register' });
      return;
    }
    const token = state.token;
    if (!claim('creating', token)) return;
    void runSignup(token as StepToken);
  }, [state.step, state.token, runSignup]);

  // A payment step with nothing to charge for — no plan left in the catalog, or a form that was
  // never submitted — cannot be paid, and a card taken there would be stranded. Back to the form.
  useEffect(() => {
    if (state.step !== 'payment') return;
    if (state.formSubmitted && plan) return;
    dispatch({ type: 'GO_TO', step: 'register' });
  }, [state.step, state.formSubmitted, plan]);

  // ── Done ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.step !== 'done' || entitlementsNotified.current) return;
    entitlementsNotified.current = true;
    // The gates in the rest of the app are holding the anonymous answer; drop it and say why.
    notifyEntitlementsChanged('signup');
    latest.current.onEntitlementsChanged?.('signup');
  }, [state.step, notifyEntitlementsChanged]);

  // ── What the view calls ─────────────────────────────────────────────────────

  const submitForm = useCallback((data: RegistrationFormData) => {
    setFormData(data);
    setTokenMessage(null);
    dispatch({ type: 'REGISTER_SUBMITTED', email: data.email });
  }, []);

  const choosePlan = useCallback(
    (tier: AppTierModel) => {
      const pricing = resolvePriceOption(tier, { billing }) ?? null;
      setChosenPlan({ tier, pricing });
      dispatch({
        type: 'PLAN_CHOSEN',
        tierId: tier.id,
        pricingId: pricing?.id,
        requiresPayment: requiresPayment(tier, pricing),
      });
    },
    [billing],
  );

  const togglePack = useCallback((addOnId: string) => {
    setSelectedPackIds((current) =>
      current.includes(addOnId) ? current.filter((id) => id !== addOnId) : [...current, addOnId],
    );
  }, []);

  const choosePacks = useCallback(() => {
    dispatch({ type: 'PACKS_CHOSEN', addOnIds: selectedPackIds });
  }, [selectedPackIds]);

  const skipPacks = useCallback(() => {
    setSelectedPackIds([]);
    dispatch({ type: 'PACKS_CHOSEN', addOnIds: [] });
  }, []);

  const changePlan = useCallback(() => {
    dispatch({ type: 'GO_TO', step: 'plan' });
  }, []);

  const back = useCallback((step: 'register' | 'plan' | 'packs') => {
    dispatch({ type: 'GO_TO', step });
  }, []);

  const paymentSucceeded = useCallback((result: PaymentCompletionResult) => {
    paymentTxn.current = {
      transactionId: result.transactionId ?? result.paymentIntentId,
      externalId: result.paymentIntentId,
    };
    dispatch({
      type: 'PAYMENT_COMPLETED',
      paymentTransactionId: result.transactionId ?? result.paymentIntentId ?? '',
    });
  }, []);

  const disclaimersDone = useCallback(() => {
    dispatch({ type: 'DISCLAIMERS_ACCEPTED' });
  }, []);

  const packsBought = useCallback((packs: SignupPackOutcome[]) => {
    dispatch({ type: 'PACK_CHECKOUT_FINISHED', token: stepToken.current as StepToken, packs });
  }, []);

  const retry = useCallback(() => {
    if (state.retryFrom === 'loading') void refreshCatalog();
    dispatch({ type: 'RETRY' });
  }, [state.retryFrom, refreshCatalog]);

  const startOver = useCallback(() => {
    registered.current = false;
    loggedIn.current = false;
    disclaimersPending.current = false;
    paymentTxn.current = {};
    runs.current = {};
    setSubscriptionFailed(false);
    setTokenGrant(null);
    setTokenMessage(null);
    setChosenPlan(null);
    setProcessingStatus('');
    dispatch({ type: 'RESET' });
  }, []);

  const complete = useCallback(() => {
    if (state.outcome) latest.current.onSignupComplete?.(state.outcome);
  }, [state.outcome]);

  const checkoutItems = useMemo<AddOnCheckoutItemInput[]>(
    () => state.packsToBuy.map((addOnId) => ({ addOnId })),
    [state.packsToBuy],
  );

  const initialFormData = useMemo<RegistrationFormData | undefined>(() => {
    if (formData) return formData;
    if (!prefillEmail) return undefined;
    // SDB's convention: an invitation's email is the username too, so the visitor types neither.
    return {
      firstName: '',
      lastName: '',
      username: prefillEmail,
      email: prefillEmail,
      password: '',
      useToken: Boolean(registrationToken),
      registrationToken,
    };
  }, [formData, prefillEmail, registrationToken]);

  return {
    state,
    stepName: stepNameOf(state.step),
    labels,
    alreadySignedIn,
    mode,
    catalog,
    currency: displayCurrency,
    plan,
    // A token's grant is not known while the form is on screen, so this is what the flow knows then.
    planStepAhead: planSelection === 'choose' && !invite && !state.planPreset,
    defaultTierId,
    tokenGrant,
    tokenMessage,
    trialDays,
    subscriptionFailed,
    processingStatus,
    formData,
    initialFormData,
    checkoutItems,
    packNames: names.addOns ?? {},
    availablePacks,
    selectedPackIds,
    billing,
    setBilling,
    togglePack,
    submitForm,
    choosePlan,
    choosePacks,
    skipPacks,
    changePlan,
    back,
    paymentSucceeded,
    disclaimersDone,
    packsBought,
    retry,
    startOver,
    complete,
    report,
  };
}
