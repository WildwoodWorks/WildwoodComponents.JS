/**
 * `planDefault` on the SHARED signup flow.
 *
 * The rendered rule is asserted in `RegistrationAndSubscription.signup.test.tsx`, through the web
 * view. This file asserts the same rule one layer down, on `useSignupFlow` as `@wildwood/react-shared`
 * exports it, because React is no longer the only caller: React Native drives the same hook and
 * highlights its own grid from the same `defaultTierId`. A rule proven only through web markup is a
 * rule the native stack could lose without a single test going red.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { clearPublicCatalogCache, useSignupFlow, type SignupFlowOptions } from '@wildwood/react-shared';
import { createWrapper } from './testUtils.js';
import { signupClient, proTier, freeTier, type SignupStubs } from './signupHarness.js';

// The catalog is cached per app across instances, so one test's tiers would otherwise be the next
// one's — and "this app sells no free plan" is exactly the case that cache would hide.
beforeEach(() => {
  clearPublicCatalogCache();
});

afterEach(() => {
  cleanup();
});

function renderFlow(options: SignupFlowOptions = {}, stubs: SignupStubs = signupClient()) {
  const view = renderHook(() => useSignupFlow({ appId: 'test-app-id', ...options }), {
    wrapper: createWrapper(stubs.client),
  });
  return { ...view, stubs };
}

describe("the shared flow's defaultTierId", () => {
  it("names the app's free plan when the host asks for one", async () => {
    const { result } = renderFlow({ planDefault: 'free' });

    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.defaultTierId).toBe(freeTier.id);
  });

  it('suggests nothing by default', async () => {
    const { result } = renderFlow();

    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.defaultTierId).toBeUndefined();
  });

  it('suggests nothing when the app sells no free plan', async () => {
    const { result } = renderFlow({ planDefault: 'free' }, signupClient({ tiers: [proTier] }));

    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.defaultTierId).toBeUndefined();
  });

  it('suggests nothing while an invite is being redeemed', async () => {
    // An invite's plan comes from its token, so there is nothing for a default to open on.
    const { result } = renderFlow({ planDefault: 'free', tokenMode: 'required', registrationToken: 'INVITE-1' });

    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.defaultTierId).toBeUndefined();
  });

  it('is a highlight and nothing more: the machine never sees it', async () => {
    const { result } = renderFlow({ planDefault: 'free' });

    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    // No plan has been chosen and the plan step is still ahead — exactly as with no default at all.
    expect(result.current.state.selection.tierId).toBeUndefined();
    expect(result.current.plan).toBeNull();
    expect(result.current.planStepAhead).toBe(true);
  });
});
