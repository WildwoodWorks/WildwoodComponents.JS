'use client';

import { useState, useCallback } from 'react';
import type { CaptchaConfiguration } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseCaptchaReturn {
  isLoaded: boolean;
  isEnabled: boolean;
  configure: (config: CaptchaConfiguration) => void;
  execute: () => Promise<string | null>;
  loadScript: () => Promise<void>;
}

export function useCaptcha(): UseCaptchaReturn {
  const client = useWildwood();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const configure = useCallback(
    (config: CaptchaConfiguration) => {
      client.captcha.setConfiguration(config);
      setIsEnabled(config.isEnabled ?? false);
    },
    [client],
  );

  const loadScript = useCallback(async () => {
    await client.captcha.loadScript();
    setIsLoaded(true);
  }, [client]);

  const execute = useCallback(async () => {
    return client.captcha.execute();
  }, [client]);

  return { isLoaded, isEnabled, configure, execute, loadScript };
}
