'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWildwood } from './useWildwood.js';

export interface UseTwoFactorEnrollmentRequiredReturn {
  /**
   * The app requires two-factor authentication and the signed-in user has not set it up. While true
   * the API refuses everything but enrollment, so route the user to two-factor setup.
   */
  isRequired: boolean;
  /**
   * Call after the user enrolls. Refreshes the session; resolves true once the restriction is lifted.
   */
  complete: () => Promise<boolean>;
}

/**
 * Tracks the session's "two-factor enrollment required" state (the API's "2FA required" policy).
 * Use it to redirect a restricted user to TwoFactorSettingsComponent from anywhere in the app, e.g.
 * after a stored session is restored or when an API call is refused mid-session.
 */
export function useTwoFactorEnrollmentRequired(): UseTwoFactorEnrollmentRequiredReturn {
  const client = useWildwood();
  const [isRequired, setIsRequired] = useState(client.session.isTwoFactorEnrollmentPending);

  useEffect(() => {
    const sync = () => setIsRequired(client.session.isTwoFactorEnrollmentPending);
    const unsubs = [
      client.events.on('twoFactorEnrollmentRequired', sync),
      client.events.on('twoFactorEnrollmentCompleted', sync),
      client.events.on('authChanged', sync),
      client.events.on('sessionInitialized', sync),
      client.events.on('sessionExpired', sync),
    ];
    sync();
    return () => unsubs.forEach((u) => u());
  }, [client]);

  const complete = useCallback(async () => {
    const lifted = await client.session.completeTwoFactorEnrollment();
    setIsRequired(client.session.isTwoFactorEnrollmentPending);
    return lifted;
  }, [client]);

  return { isRequired, complete };
}
