'use client';

import { useCallback, useState } from 'react';
import type {
  FeedbackWidgetConfig,
  SubmitFeedbackInput,
  SystemFeedback,
  FeedbackDuplicateCheck,
  FeedbackVoteResult,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseFeedbackReturn {
  config: FeedbackWidgetConfig | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  loadConfig: () => Promise<FeedbackWidgetConfig>;
  submitFeedback: (input: SubmitFeedbackInput) => Promise<SystemFeedback>;
  checkDuplicate: (title: string) => Promise<FeedbackDuplicateCheck>;
  voteFeedback: (id: string) => Promise<FeedbackVoteResult>;
}

/**
 * Hook wrapping the core FeedbackService. Loads the per-app widget config and
 * exposes submit/duplicate-check/vote. Mirrors the other feature hooks
 * (e.g. useDisclaimer) and resolves the appId from the WildwoodProvider config.
 */
export function useFeedback(): UseFeedbackReturn {
  const client = useWildwood();
  const [config, setConfig] = useState<FeedbackWidgetConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.feedback.getWidgetConfig(appId);
      setConfig(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback configuration');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  const submitFeedback = useCallback(
    async (input: SubmitFeedbackInput) => {
      setSubmitting(true);
      setError(null);
      try {
        return await client.feedback.submitFeedback({ ...input, appId: input.appId ?? appId });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit feedback');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [client, appId],
  );

  const checkDuplicate = useCallback((title: string) => client.feedback.checkDuplicate(title, appId), [client, appId]);

  const voteFeedback = useCallback((id: string) => client.feedback.voteFeedback(id), [client]);

  return { config, loading, submitting, error, loadConfig, submitFeedback, checkDuplicate, voteFeedback };
}
