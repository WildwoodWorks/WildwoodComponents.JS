import { useState, useEffect, useCallback, useRef } from 'react';
import type { FlowDefinition, FlowExecution, FlowInputField } from '@wildwood/core';
import { useAIFlow } from '../../hooks/useAIFlow.js';

export interface AIFlowComponentProps {
  flowId?: string;
  autoLoad?: boolean;
  showHistory?: boolean;
  pollingIntervalMs?: number;
  outputKeyFilter?: string[];
  onFlowCompleted?: (execution: FlowExecution) => void;
  onFlowFailed?: (execution: FlowExecution) => void;
  onAuthenticationFailed?: () => void;
  className?: string;
}

function getInputType(fieldType: string): string {
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
      return 'datetime-local';
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

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-completed"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'failed':
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-failed"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'running':
      return <div className="ww-flow-status-icon ww-flow-spinner-sm" />;
    case 'cancelled':
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-cancelled"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'timeout':
    case 'timedout':
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-timeout"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'skipped':
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-skipped"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </svg>
      );
    default:
      return (
        <svg
          className="ww-flow-status-icon ww-flow-status-pending"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'ww-badge-success';
    case 'failed':
      return 'ww-badge-danger';
    case 'running':
      return 'ww-badge-primary';
    case 'cancelled':
      return 'ww-badge-warning';
    case 'timeout':
    case 'timedout':
      return 'ww-badge-warning';
    case 'skipped':
      return 'ww-badge-secondary';
    default:
      return 'ww-badge-secondary';
  }
}

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const TERMINAL_STATUSES = ['Completed', 'Failed', 'Cancelled', 'TimedOut'];

export function AIFlowComponent({
  flowId,
  autoLoad = true,
  showHistory = true,
  pollingIntervalMs = 1500,
  outputKeyFilter,
  onFlowCompleted,
  onFlowFailed,
  onAuthenticationFailed,
  className,
}: AIFlowComponentProps) {
  const {
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
  } = useAIFlow();

  const [selectedFlow, setSelectedFlow] = useState<FlowDefinition | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [activeExecution, setActiveExecution] = useState<FlowExecution | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load flows
  useEffect(() => {
    if (autoLoad) {
      if (flowId) {
        getFlowDefinition(flowId).then((flow) => {
          if (flow) {
            setSelectedFlow(flow);
            initializeInputs(flow);
          }
        });
      } else {
        getFlowDefinitions();
      }
      if (showHistory) {
        getFlowExecutions(flowId);
      }
    }
  }, [autoLoad, flowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll running execution
  useEffect(() => {
    if (activeExecution && !TERMINAL_STATUSES.includes(activeExecution.status)) {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await getFlowExecution(activeExecution.id);
          if (updated) {
            setActiveExecution(updated);
            if (updated.status === 'Completed') {
              onFlowCompleted?.(updated);
              clearPolling();
            } else if (TERMINAL_STATUSES.includes(updated.status) && updated.status !== 'Completed') {
              onFlowFailed?.(updated);
              clearPolling();
            }
          }
        } catch (err) {
          if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
            onAuthenticationFailed?.();
            clearPolling();
          }
        }
      }, pollingIntervalMs);
    }
    return clearPolling;
  }, [activeExecution?.id, activeExecution?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function initializeInputs(flow: FlowDefinition) {
    const defaults: Record<string, string> = {};
    for (const field of flow.inputFields) {
      defaults[field.name] = field.defaultValue ?? '';
    }
    setInputValues(defaults);
  }

  const handleSelectFlow = useCallback(
    (flow: FlowDefinition) => {
      setSelectedFlow(flow);
      setActiveExecution(null);
      setExecutionError(null);
      initializeInputs(flow);
      if (showHistory) {
        getFlowExecutions(flow.id);
      }
    },
    [showHistory, getFlowExecutions],
  );

  const handleInputChange = useCallback((fieldName: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleExecute = useCallback(async () => {
    if (!selectedFlow) return;

    // Validate required fields
    for (const field of selectedFlow.inputFields) {
      if (field.isRequired && !inputValues[field.name]?.trim()) {
        setExecutionError(`${field.displayName} is required`);
        return;
      }
      if (field.validationPattern) {
        const regex = new RegExp(field.validationPattern);
        if (inputValues[field.name] && !regex.test(inputValues[field.name])) {
          setExecutionError(field.validationMessage ?? `${field.displayName} is invalid`);
          return;
        }
      }
    }

    setExecutionError(null);
    setExecuting(true);
    try {
      const execution = await executeFlow({
        flowDefinitionId: selectedFlow.id,
        inputValues,
      });
      setActiveExecution(execution);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
        onAuthenticationFailed?.();
      }
      setExecutionError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  }, [selectedFlow, inputValues, executeFlow, onAuthenticationFailed]);

  const handleCancel = useCallback(async () => {
    if (!activeExecution) return;
    setCancelling(true);
    try {
      const success = await cancelFlowExecution(activeExecution.id);
      if (success) {
        const updated = await getFlowExecution(activeExecution.id);
        if (updated) setActiveExecution(updated);
        clearPolling();
      } else {
        setExecutionError('Failed to cancel execution');
      }
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }, [activeExecution, cancelFlowExecution, getFlowExecution]);

  const handleReset = useCallback(() => {
    setActiveExecution(null);
    setExecutionError(null);
    if (selectedFlow) {
      initializeInputs(selectedFlow);
    }
  }, [selectedFlow]);

  const renderInputField = (field: FlowInputField) => {
    const inputType = getInputType(field.fieldType);
    const value = inputValues[field.name] ?? '';

    if (field.options && field.options.length > 0) {
      return (
        <select
          className="ww-form-control"
          value={value}
          onChange={(e) => handleInputChange(field.name, e.target.value)}
          aria-label={field.displayName}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (inputType === 'textarea') {
      return (
        <textarea
          className="ww-form-control"
          value={value}
          onChange={(e) => handleInputChange(field.name, e.target.value)}
          rows={4}
          placeholder={field.description}
          aria-label={field.displayName}
        />
      );
    }

    if (inputType === 'checkbox') {
      return (
        <label className="ww-form-check">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => handleInputChange(field.name, e.target.checked ? 'true' : 'false')}
          />
          <span>{field.description ?? field.displayName}</span>
        </label>
      );
    }

    return (
      <input
        type={inputType}
        className="ww-form-control"
        value={value}
        onChange={(e) => handleInputChange(field.name, e.target.value)}
        placeholder={field.description}
        required={field.isRequired}
        aria-label={field.displayName}
      />
    );
  };

  const renderOutput = (execution: FlowExecution) => {
    if (!execution.outputValues || Object.keys(execution.outputValues).length === 0) {
      return <p className="ww-text-muted">No output</p>;
    }

    const entries = Object.entries(execution.outputValues);
    const filteredEntries = outputKeyFilter ? entries.filter(([key]) => outputKeyFilter.includes(key)) : entries;

    if (filteredEntries.length === 0) {
      return <p className="ww-text-muted">No matching output</p>;
    }

    return (
      <div className="ww-flow-output">
        {filteredEntries.map(([key, val]) => {
          // Check for audio output
          if (val && (val.startsWith('data:audio') || val.endsWith('.mp3') || val.endsWith('.wav'))) {
            return (
              <div key={key} className="ww-flow-output-item">
                <label>{key}</label>
                <audio controls src={val} className="ww-flow-audio">
                  <track kind="captions" />
                </audio>
              </div>
            );
          }

          // Try to format as JSON
          let formatted = val;
          try {
            const parsed = JSON.parse(val);
            formatted = JSON.stringify(parsed, null, 2);
          } catch {
            /* not JSON, use as-is */
          }

          return (
            <div key={key} className="ww-flow-output-item">
              <label>{key}</label>
              <pre className="ww-flow-output-value">{formatted}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`ww-flow-component ${className ?? ''}`}>
      {(error || executionError) && (
        <div className="ww-alert ww-alert-danger">
          {error || executionError}
          {executionError && (
            <button type="button" className="ww-alert-dismiss" onClick={() => setExecutionError(null)}>
              &times;
            </button>
          )}
        </div>
      )}

      {/* Flow selector (when no flowId prop) */}
      {!flowId && !selectedFlow && (
        <div className="ww-flow-selector">
          <h3>Available Flows</h3>
          {loading ? (
            <div className="ww-flow-loading">
              <div className="ww-spinner" />
              <span>Loading flows...</span>
            </div>
          ) : definitions.length === 0 ? (
            <p className="ww-text-muted">No flows available</p>
          ) : (
            <div className="ww-flow-list">
              {definitions
                .filter((d) => d.isActive)
                .map((flow) => (
                  <div
                    key={flow.id}
                    className="ww-flow-list-item"
                    onClick={() => handleSelectFlow(flow)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelectFlow(flow)}
                  >
                    <div className="ww-flow-list-item-header">
                      {(flow as FlowDefinition & { iconClass?: string }).iconClass && (
                        <span
                          className={`ww-flow-icon ${(flow as FlowDefinition & { iconClass?: string }).iconClass}`}
                        />
                      )}
                      <div className="ww-flow-list-name">{flow.name}</div>
                    </div>
                    {flow.description && <div className="ww-flow-list-desc">{flow.description}</div>}
                    <div className="ww-flow-list-meta">
                      <span className="ww-text-muted">
                        {flow.inputFields.length} input{flow.inputFields.length !== 1 ? 's' : ''}
                      </span>
                      <span className="ww-text-muted">v{flow.version}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Flow execution form */}
      {selectedFlow && !activeExecution && (
        <div className="ww-flow-form">
          <div className="ww-flow-form-header">
            {!flowId && (
              <button
                type="button"
                className="ww-btn-icon"
                onClick={() => setSelectedFlow(null)}
                aria-label="Back to flow list"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div>
              <div className="ww-flow-form-title">
                {(selectedFlow as FlowDefinition & { iconClass?: string }).iconClass && (
                  <span
                    className={`ww-flow-icon ${(selectedFlow as FlowDefinition & { iconClass?: string }).iconClass}`}
                  />
                )}
                <h3>{selectedFlow.name}</h3>
              </div>
              {selectedFlow.description && <p className="ww-text-muted">{selectedFlow.description}</p>}
            </div>
          </div>

          {selectedFlow.inputFields.length > 0 && (
            <div className="ww-flow-inputs">
              {selectedFlow.inputFields
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((field) => (
                  <div key={field.name} className="ww-form-group">
                    <label>
                      {field.displayName}
                      {field.isRequired && <span className="ww-required">*</span>}
                    </label>
                    {renderInputField(field)}
                    {field.description && getInputType(field.fieldType) !== 'checkbox' && (
                      <small className="ww-form-text">{field.description}</small>
                    )}
                  </div>
                ))}
            </div>
          )}

          <div className="ww-flow-form-actions">
            <button
              type="button"
              className="ww-btn ww-btn-primary"
              onClick={handleExecute}
              disabled={executing || loading}
            >
              {executing ? (
                <>
                  <span className="ww-spinner ww-spinner-sm" /> Executing...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run Flow
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Active execution display */}
      {activeExecution && (
        <div className="ww-flow-execution">
          <div className="ww-flow-execution-header">
            <h3>{activeExecution.flowName}</h3>
            <span className={`ww-badge ${getStatusBadgeClass(activeExecution.status)}`}>{activeExecution.status}</span>
          </div>

          {/* Duration */}
          <div className="ww-flow-execution-meta">
            <span className="ww-text-muted">
              Duration: {formatDuration(activeExecution.startedAt, activeExecution.completedAt)}
            </span>
            <span className="ww-text-muted">
              Steps: {activeExecution.currentStepIndex}/{activeExecution.totalSteps}
            </span>
          </div>

          {/* Step progress */}
          {activeExecution.steps && activeExecution.steps.length > 0 && (
            <div className="ww-flow-steps">
              {activeExecution.steps.map((step) => (
                <div key={step.stepIndex} className={`ww-flow-step ww-flow-step-${step.status.toLowerCase()}`}>
                  <div className="ww-flow-step-indicator">{getStatusIcon(step.status)}</div>
                  <div className="ww-flow-step-info">
                    <div className="ww-flow-step-name">{step.stepName}</div>
                    {step.startedAt && step.completedAt && (
                      <span className="ww-flow-step-duration">{formatDuration(step.startedAt, step.completedAt)}</span>
                    )}
                    {step.errorMessage && <div className="ww-flow-step-error">{step.errorMessage}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {activeExecution.errorMessage && (
            <div className="ww-alert ww-alert-danger">{activeExecution.errorMessage}</div>
          )}

          {/* Output */}
          {TERMINAL_STATUSES.includes(activeExecution.status) && (
            <>
              <h4>Output</h4>
              {renderOutput(activeExecution)}
            </>
          )}

          {/* Actions */}
          <div className="ww-flow-execution-actions">
            {!TERMINAL_STATUSES.includes(activeExecution.status) && (
              <button type="button" className="ww-btn ww-btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? (
                  <>
                    <span className="ww-spinner ww-spinner-sm" /> Cancelling...
                  </>
                ) : (
                  'Cancel Execution'
                )}
              </button>
            )}

            {TERMINAL_STATUSES.includes(activeExecution.status) && (
              <button type="button" className="ww-btn ww-btn-primary" onClick={handleReset}>
                Run Again
              </button>
            )}
            {!flowId && (
              <button
                type="button"
                className="ww-btn ww-btn-outline"
                onClick={() => {
                  setActiveExecution(null);
                  setSelectedFlow(null);
                }}
              >
                Back to Flows
              </button>
            )}
          </div>
        </div>
      )}

      {/* Execution history */}
      {showHistory && executions.length > 0 && !activeExecution && (
        <div className="ww-flow-history">
          <h4>Recent Executions</h4>
          <div className="ww-flow-history-list">
            {executions.slice(0, 10).map((exec) => (
              <div
                key={exec.id}
                className="ww-flow-history-item"
                onClick={() => setActiveExecution(exec)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setActiveExecution(exec)}
              >
                <div className="ww-flow-history-name">{exec.flowName}</div>
                <div className="ww-flow-history-meta">
                  <span className={`ww-badge ww-badge-sm ${getStatusBadgeClass(exec.status)}`}>{exec.status}</span>
                  <span className="ww-text-muted">{formatDuration(exec.startedAt, exec.completedAt)}</span>
                  <span className="ww-text-muted">{new Date(exec.startedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
