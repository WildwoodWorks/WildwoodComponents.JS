'use client';

import { useState, useCallback } from 'react';
import type { ThemeName } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseWildwoodComponentReturn {
  loading: boolean;
  error: string | null;
  theme: ThemeName;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  wrapAsync: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Base hook providing common component patterns: loading state, error handling, theme access.
 * Mirrors WildwoodComponents.Blazor/Components/Base/BaseWildwoodComponent.cs
 */
export function useWildwoodComponent(): UseWildwoodComponentReturn {
  const client = useWildwood();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const wrapAsync = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    theme: client.theme.theme,
    setLoading,
    setError,
    clearError,
    wrapAsync,
  };
}
