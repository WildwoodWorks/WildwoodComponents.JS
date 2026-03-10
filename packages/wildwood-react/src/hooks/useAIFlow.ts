import { useState, useCallback } from 'react';
import type { FlowDefinition, FlowExecution, FlowExecuteRequest } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAIFlowReturn {
  definitions: FlowDefinition[];
  executions: FlowExecution[];
  loading: boolean;
  error: string | null;
  getFlowDefinitions: () => Promise<FlowDefinition[]>;
  getFlowDefinition: (flowId: string) => Promise<FlowDefinition | null>;
  executeFlow: (request: FlowExecuteRequest) => Promise<FlowExecution>;
  cancelFlowExecution: (executionId: string) => Promise<boolean>;
  getFlowExecution: (executionId: string) => Promise<FlowExecution | null>;
  getFlowExecutions: (flowId?: string) => Promise<FlowExecution[]>;
}

export function useAIFlow(): UseAIFlowReturn {
  const client = useWildwood();
  const [definitions, setDefinitions] = useState<FlowDefinition[]>([]);
  const [executions, setExecutions] = useState<FlowExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFlowDefinitions = useCallback(async () => {
    const result = await client.ai.getFlowDefinitions();
    setDefinitions(result);
    return result;
  }, [client]);

  const getFlowDefinition = useCallback(
    async (flowId: string) => {
      return client.ai.getFlowDefinition(flowId);
    },
    [client],
  );

  const executeFlow = useCallback(
    async (request: FlowExecuteRequest) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.ai.executeFlow(request);
        await getFlowExecutions();
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Flow execution failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const cancelFlowExecution = useCallback(
    async (executionId: string) => {
      return client.ai.cancelFlowExecution(executionId);
    },
    [client],
  );

  const getFlowExecution = useCallback(
    async (executionId: string) => {
      return client.ai.getFlowExecution(executionId);
    },
    [client],
  );

  const getFlowExecutions = useCallback(
    async (flowId?: string) => {
      const result = await client.ai.getFlowExecutions(flowId);
      setExecutions(result);
      return result;
    },
    [client],
  );

  return {
    definitions,
    executions,
    loading,
    error,
    getFlowDefinitions,
    getFlowDefinition,
    executeFlow,
    cancelFlowExecution,
    getFlowExecution,
    getFlowExecutions,
  };
}
