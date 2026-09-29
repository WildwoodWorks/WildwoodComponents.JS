'use client';

// Registration funnel events.
//
// The registration form and the signup flow report the funnel steps (signup_view, signup_start,
// signup_submit, signup_error, plan_selected, checkout_start) through the client's attribution
// service. Core does the gating: nothing is sent while the app has funnel tracking or signup steps off,
// and the one-shot steps go out once per session, so a form and the flow around it can both report the
// same step without counting it twice.
//
// Two rules hold everywhere here: a funnel call never throws into the form, and a label never carries
// what the visitor typed or a server's message. signup_error carries a fixed category only.

import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { FunnelTrackOptions, WildwoodClient } from '@wildwood/core';
import { WildwoodError } from '@wildwood/core';
import { WildwoodContext } from '../provider/WildwoodContext.js';

/** The categories a signup_error label is drawn from. */
export type SignupErrorCategory =
  | 'validation'
  | 'email_taken'
  | 'username_taken'
  | 'password_policy'
  | 'captcha'
  | 'invalid_token'
  | 'registration_closed'
  | 'rate_limited'
  | 'network'
  | 'server'
  | 'unknown';

/** Every {@link SignupErrorCategory}, for callers that report a category directly. */
export const SIGNUP_ERROR_CATEGORIES: readonly SignupErrorCategory[] = [
  'validation',
  'email_taken',
  'username_taken',
  'password_policy',
  'captcha',
  'invalid_token',
  'registration_closed',
  'rate_limited',
  'network',
  'server',
  'unknown',
];

/** Codes compared with case and separators removed ("USERNAME_EXISTS" and "UsernameExists" match). */
const CODE_CATEGORIES: Record<string, SignupErrorCategory> = {
  USERNAMEEXISTS: 'username_taken',
  USERNAMETAKEN: 'username_taken',
  USEREXISTS: 'email_taken',
  EMAILEXISTS: 'email_taken',
  EMAILTAKEN: 'email_taken',
  DUPLICATEEMAIL: 'email_taken',
  PASSWORDINVALID: 'password_policy',
  PASSWORDPOLICY: 'password_policy',
  INVALIDTOKEN: 'invalid_token',
  REGISTRATIONTOKENREJECTED: 'invalid_token',
  VALIDATIONERROR: 'validation',
  VALIDATION: 'validation',
  EMAILREQUIRED: 'validation',
  USERNAMEREQUIRED: 'validation',
  REGISTRATIONNOTALLOWED: 'registration_closed',
  FORBIDDEN: 'registration_closed',
  RATELIMITED: 'rate_limited',
  RATELIMITEXCEEDED: 'rate_limited',
  NETWORKERROR: 'network',
  TIMEOUT: 'network',
  SERVERERROR: 'server',
  INTERNALERROR: 'server',
  DATABASEERROR: 'server',
  EXECUTIONSTRATEGYERROR: 'server',
  USERCREATIONFAILED: 'server',
};

/**
 * The signup_error category for a server or client error code (WildwoodAPI's `errorCode`, a
 * WildwoodError code, or a flow code such as `registration_token_rejected`), falling back on the HTTP
 * status. Unrecognized codes are 'unknown'.
 */
export function signupErrorCategoryFromCode(code: string | null | undefined, status?: number): SignupErrorCategory {
  const key = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length > 0) {
    const known = CODE_CATEGORIES[key];
    if (known) return known;
    if (key.includes('CAPTCHA')) return 'captcha';
    if (key.startsWith('TOKEN')) return 'invalid_token';
    if (key.startsWith('PASSWORD')) return 'password_policy';
    if (key.includes('REGISTRATIONDISABLED') || key.includes('NOTALLOWED')) return 'registration_closed';
  }
  if (typeof status === 'number') {
    if (status === 0) return 'network';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server';
    if (status === 400 || status === 422) return 'validation';
  }
  return 'unknown';
}

/**
 * The signup_error category for anything a registration can throw: a WildwoodError (the server's own
 * `errorCode` first, then the client's code and status), an object carrying a `code` (the flow's
 * refusals and reported errors), or a fetch failure. Messages are never read.
 */
export function signupErrorCategory(error: unknown): SignupErrorCategory {
  try {
    if (error instanceof WildwoodError) {
      const body =
        error.details && typeof error.details === 'object' ? (error.details as Record<string, unknown>) : null;
      const serverCode = typeof body?.errorCode === 'string' ? body.errorCode : '';
      const fromServer = serverCode ? signupErrorCategoryFromCode(serverCode) : 'unknown';
      if (fromServer !== 'unknown') return fromServer;
      return signupErrorCategoryFromCode(error.code, error.status);
    }
    // fetch() rejects with a TypeError when the request never reached the server.
    if (error instanceof TypeError) return 'network';
    if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
      return signupErrorCategoryFromCode((error as { code: string }).code);
    }
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/**
 * A stable plan key for plan_selected / checkout_start: the tier's (or pricing option's) id, else a
 * slug of its name, capped at 100 characters. Null when there is nothing to key it by.
 */
export function signupPlanKey(plan: { id?: string | null; name?: string | null } | null | undefined): string | null {
  if (!plan) return null;
  const id = typeof plan.id === 'string' ? plan.id.trim() : '';
  if (id) return id.slice(0, 100);
  const slug = (plan.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return slug || null;
}

/** Tracks a funnel event on the client, when it has an attribution service. Never throws. */
export function trackSignupFunnel(
  client: WildwoodClient | null | undefined,
  name: string,
  options?: FunnelTrackOptions,
): void {
  try {
    client?.attribution?.track(name, options);
  } catch {
    /* funnel tracking must never break registration */
  }
}

export interface SignupFunnel {
  /** The visitor started filling the form (the first focus or input). Sent once per session. */
  start: () => void;
  /** The account form was submitted. Call before the request goes out. */
  submit: () => void;
  /** Registration failed: pass the error (or a category); only its category is sent. */
  error: (error: unknown) => void;
}

/**
 * The registration form's funnel hook: sends signup_view once when the form mounts and hands back the
 * start / submit / error reporters. Safe outside a provider and with no attribution service.
 */
export function useSignupFunnel(options: { enabled?: boolean } = {}): SignupFunnel {
  const enabled = options.enabled !== false;
  const client = useContext(WildwoodContext);
  const latest = useRef({ client, enabled });
  latest.current = { client, enabled };
  const started = useRef(false);

  useEffect(() => {
    if (enabled) trackSignupFunnel(client, 'signup_view');
  }, [client, enabled]);

  const start = useCallback(() => {
    if (started.current || !latest.current.enabled) return;
    started.current = true;
    trackSignupFunnel(latest.current.client, 'signup_start');
  }, []);

  const submit = useCallback(() => {
    if (!latest.current.enabled) return;
    // A submit without a focus first (autofill, a password manager) still started the form.
    if (!started.current) {
      started.current = true;
      trackSignupFunnel(latest.current.client, 'signup_start');
    }
    trackSignupFunnel(latest.current.client, 'signup_submit');
  }, []);

  const error = useCallback((err: unknown) => {
    if (!latest.current.enabled) return;
    const category =
      typeof err === 'string' && (SIGNUP_ERROR_CATEGORIES as readonly string[]).includes(err)
        ? err
        : signupErrorCategory(err);
    trackSignupFunnel(latest.current.client, 'signup_error', { label: category });
  }, []);

  return useMemo(() => ({ start, submit, error }), [start, submit, error]);
}
