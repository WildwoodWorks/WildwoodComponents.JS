'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FlowDefinition, FlowExecution } from '@wildwood/core';
import { useAIFlow } from './useAIFlow.js';
import { useWildwood } from './useWildwood.js';

export interface UseAIFlowLogicOptions {
  flowId?: string;
  autoLoad?: boolean;
  showHistory?: boolean;
  pollingIntervalMs?: number;
  outputKeyFilter?: string[];
  onFlowCompleted?: (execution: FlowExecution) => void;
  onFlowFailed?: (execution: FlowExecution) => void;
  onAuthenticationFailed?: () => void;
}

export const TERMINAL_STATUSES = ['Completed', 'Failed', 'Cancelled', 'TimedOut'];

export function getInputType(fieldType: string): string {
  switch (fieldType.toLowerCase()) {
    case 'number':
    case 'integer':
    case 'float':
    case 'decimal':
      return 'number';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'date':
      return 'date';
    case 'datetime':
    case 'datetime-local':
      return 'datetime';
    case 'boolean':
      return 'checkbox';
    case 'textarea':
    case 'text_area':
    case 'longtext':
      return 'textarea';
    default:
      return 'text';
  }
}

export function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export interface UseAIFlowLogicReturn {
  // State
  selectedFlow: FlowDefinition | null;
  inputValues: Record<string, string>;
  activeExecution: FlowExecution | null;
  executionError: string | null;
  executing: boolean;
  cancelling: boolean;

  // Handlers
  handleSelectFlow: (flow: FlowDefinition) => void;
  handleInputChange: (fieldName: string, value: string) => void;
  handleExecute: () => Promise<void>;
  handleCancel: () => Promise<void>;
  handleReset: () => void;
  clearSelectedFlow: () => void;
  clearActiveExecution: () => void;
  setActiveExecutionFromHistory: (exec: FlowExecution) => void;
  dismissError: () => void;

  // From useAIFlow
  definitions: FlowDefinition[];
  executions: FlowExecution[];
  loading: boolean;
  error: string | null;
}

export function useAIFlowLogic(options: UseAIFlowLogicOptions = {}): UseAIFlowLogicReturn {
  const {
    flowId,
    autoLoad = false,
    showHistory = false,
    pollingIntervalMs = 2000,
    onFlowCompleted,
    onFlowFailed,
    onAuthenticationFailed,
  } = options;

  const client = useWildwood();
  const {
    definitions,
    executions,
    loading,
    error,
    getFlowDefinitions,
    getFlowDefinition,
    executeFlow,
    getFlowExecution,
    getFlowExecutions,
    cancelFlowExecution,
  } = useAIFlow();

  const [selectedFlow, setSelectedFlow] = useState<FlowDefinition | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [activeExecution, setActiveExecution] = useState<FlowExecution | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initializeInputs = useCallback((flow: FlowDefinition) => {
    const defaults: Record<string, string> = {};
    for (const field of flow.inputFields) {
      defaults[field.name] = field.defaultValue ?? '';
    }
    setInputValues(defaults);
  }, []);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // useEffect 1: autoLoad
  useEffect(() => {
    if (!autoLoad) return;

    const load = async () => {
      if (flowId) {
        const flow = await getFlowDefinition(flowId);
        if (flow) {
          setSelectedFlow(flow);
          initializeInputs(flow);
        }
      } else {
        await getFlowDefinitions();
      }

      if (showHistory) {
        await getFlowExecutions(flowId);
      }
    };

    load();
  }, [autoLoad, flowId, showHistory, getFlowDefinition, getFlowDefinitions, getFlowExecutions, initializeInputs]);

  // useEffect 2: polling
  useEffect(() => {
    if (!activeExecution || TERMINAL_STATUSES.includes(activeExecution.status)) {
      clearPolling();
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await getFlowExecution(activeExecution.id);
        if (!updated) return;

        setActiveExecution(updated);

        if (updated.status === 'Completed') {
          clearPolling();
          onFlowCompleted?.(updated);
        } else if (TERMINAL_STATUSES.includes(updated.status)) {
          clearPolling();
          onFlowFailed?.(updated);
        }
      } catch (err: unknown) {
        const errObj = err as { status?: number; message?: string } | undefined;
        if (errObj?.status === 401 || errObj?.message?.includes('401')) {
          clearPolling();
          onAuthenticationFailed?.();
        } else {
          // Surface non-auth polling errors so the UI can display them
          setExecutionError(err instanceof Error ? err.message : 'Failed to check execution status.');
        }
      }
    }, pollingIntervalMs);

    return clearPolling;
  }, [
    activeExecution,
    pollingIntervalMs,
    getFlowExecution,
    clearPolling,
    onFlowCompleted,
    onFlowFailed,
    onAuthenticationFailed,
  ]);

  const handleSelectFlow = useCallback(
    (flow: FlowDefinition) => {
      setSelectedFlow(flow);
      setActiveExecution(null);
      setExecutionError(null);
      setExecuting(false);
      setCancelling(false);
      initializeInputs(flow);

      if (showHistory) {
        getFlowExecutions(flow.id);
      }
    },
    [initializeInputs, showHistory, getFlowExecutions],
  );

  const handleInputChange = useCallback((fieldName: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleExecute = useCallback(async () => {
    if (!selectedFlow) return;

    // Validate required fields and patterns
    for (const field of selectedFlow.inputFields) {
      const value = inputValues[field.name] ?? '';

      if (field.isRequired && !value.trim()) {
        setExecutionError(`"${field.displayName}" is required.`);
        return;
      }

      if (field.validationPattern && value) {
        try {
          const regex = new RegExp(field.validationPattern);
          if (!regex.test(value)) {
            setExecutionError(field.validationMessage ?? `"${field.displayName}" has an invalid format.`);
            return;
          }
        } catch {
          // Invalid regex pattern in flow definition — skip validation for this field
        }
      }
    }

    setExecuting(true);
    setExecutionError(null);

    try {
      const execution = await executeFlow({
        flowDefinitionId: selectedFlow.id,
        inputValues,
      });
      setActiveExecution(execution);
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : 'Flow execution failed.');
    } finally {
      setExecuting(false);
    }
  }, [selectedFlow, inputValues, executeFlow]);

  const handleCancel = useCallback(async () => {
    if (!activeExecution) return;

    setCancelling(true);
    try {
      await cancelFlowExecution(activeExecution.id);
      const updated = await getFlowExecution(activeExecution.id);
      if (updated) {
        setActiveExecution(updated);
      }
      clearPolling();
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : 'Failed to cancel execution.');
    } finally {
      setCancelling(false);
    }
  }, [activeExecution, cancelFlowExecution, getFlowExecution, clearPolling]);

  const handleReset = useCallback(() => {
    setActiveExecution(null);
    setExecutionError(null);
    setExecuting(false);
    setCancelling(false);
    if (selectedFlow) {
      initializeInputs(selectedFlow);
    }
  }, [selectedFlow, initializeInputs]);

  const clearSelectedFlow = useCallback(() => {
    setSelectedFlow(null);
  }, []);

  const clearActiveExecution = useCallback(() => {
    setActiveExecution(null);
    setSelectedFlow(null);
  }, []);

  const setActiveExecutionFromHistory = useCallback((exec: FlowExecution) => {
    setActiveExecution(exec);
  }, []);

  const dismissError = useCallback(() => {
    setExecutionError(null);
  }, []);

  return {
    // State
    selectedFlow,
    inputValues,
    activeExecution,
    executionError,
    executing,
    cancelling,

    // Handlers
    handleSelectFlow,
    handleInputChange,
    handleExecute,
    handleCancel,
    handleReset,
    clearSelectedFlow,
    clearActiveExecution,
    setActiveExecutionFromHistory,
    dismissError,

    // From useAIFlow
    definitions,
    executions,
    loading,
    error,
  };
}
