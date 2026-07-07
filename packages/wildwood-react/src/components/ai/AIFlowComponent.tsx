// Runs published "AI Flows with LangChain" for an app user: flow picker (or fixed flowId),
// an auto-generated input form from the flow's state channels, live streamed progress,
// human-in-the-loop approval, and output rendering.
// Ported from WildwoodComponents.Blazor/Components/AI/AIFlowComponent.razor.

import type { AIFlowRunResult } from '@wildwood/core';
import { useAIFlow } from '../../hooks/useAIFlow.js';

export interface AIFlowComponentProps {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to the client config. */
  apiBaseUrl?: string;
  /** Override the app whose flows are targeted. Defaults to the client config appId. */
  appId?: string;
  /** Fixed flow to run; when set the flow picker is hidden. */
  flowId?: string;
  /** Show the flow picker when no fixed flowId is set. Default true. */
  showFlowPicker?: boolean;
  /** Show the "Running <node>…" live progress row. Default true. */
  showLiveProgress?: boolean;
  /** Show the raw stream event log. Default false. */
  showDebugInfo?: boolean;
  /** Show the current thread's prior runs beneath the result. Default true. */
  showRunHistory?: boolean;
  title?: string;
  runLabel?: string;
  /** Raised with the run's terminal result (succeeded/failed/cancelled). */
  onRunCompleted?: (result: AIFlowRunResult) => void;
  className?: string;
}

export function AIFlowComponent({
  apiBaseUrl,
  appId,
  flowId,
  showFlowPicker = true,
  showLiveProgress = true,
  showDebugInfo = false,
  showRunHistory = true,
  title = 'AI Flows',
  runLabel = 'Run',
  onRunCompleted,
  className,
}: AIFlowComponentProps) {
  const {
    flows,
    loadingFlows,
    selectedFlowId,
    selectedFlow,
    selectFlow,
    inputs,
    setInput,
    rawInput,
    setRawInput,
    running,
    streamText,
    activeNode,
    pendingInterrupt,
    editingResume,
    resumeEditValue,
    setResumeEditValue,
    error,
    result,
    history,
    events,
    run,
    cancel,
    resolveInterrupt,
    startResumeEdit,
    cancelResumeEdit,
    submitResumeEdit,
  } = useAIFlow({
    apiBaseUrl,
    appId,
    flowId,
    showRunHistory,
    captureEvents: showDebugInfo,
    onRunCompleted,
  });

  return (
    <div className={`ww-flow-component${className ? ` ${className}` : ''}`}>
      <div className="ww-flow-header">
        <h3>{title}</h3>
      </div>

      {loadingFlows ? (
        <div className="ww-flow-loading">Loading flows…</div>
      ) : flows.length === 0 ? (
        <div className="ww-flow-empty">No published flows are available for this app.</div>
      ) : (
        <>
          {showFlowPicker && !flowId && (
            <div className="ww-flow-field">
              <label>Flow</label>
              <select value={selectedFlowId ?? ''} onChange={(e) => selectFlow(e.target.value)} disabled={running}>
                <option value="">Choose a flow…</option>
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFlow && (
            <>
              {selectedFlow.description && <p className="ww-flow-description">{selectedFlow.description}</p>}

              <div className="ww-flow-inputs">
                {selectedFlow.inputFields.map((field) => (
                  <div key={field.name} className="ww-flow-field">
                    <label>{field.name}</label>
                    <input
                      type="text"
                      value={inputs[field.name] ?? ''}
                      onChange={(e) => setInput(field.name, e.target.value)}
                      disabled={running}
                    />
                  </div>
                ))}
                {selectedFlow.inputFields.length === 0 && (
                  <div className="ww-flow-field">
                    <label>Input (JSON)</label>
                    <textarea
                      rows={3}
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      disabled={running}
                    />
                  </div>
                )}
              </div>

              <div className="ww-flow-actions">
                {!running ? (
                  <button type="button" className="ww-flow-btn ww-flow-btn--primary" onClick={() => void run()}>
                    {runLabel}
                  </button>
                ) : (
                  <button type="button" className="ww-flow-btn ww-flow-btn--danger" onClick={cancel}>
                    Stop
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {error && <div className="ww-flow-alert ww-flow-alert--error">{error}</div>}

      {showLiveProgress && running && activeNode && (
        <div className="ww-flow-progress">
          <span className="ww-flow-spinner" /> Running <strong>{activeNode}</strong>…
        </div>
      )}

      {streamText && (
        <div className="ww-flow-stream">
          <div className="ww-flow-label">Output</div>
          <pre>{streamText}</pre>
        </div>
      )}

      {pendingInterrupt !== null && (
        <div className="ww-flow-alert ww-flow-alert--warn">
          <div className="ww-flow-label">Human review needed</div>
          <pre>{pendingInterrupt}</pre>
          {editingResume ? (
            <>
              <div className="ww-flow-field">
                <label>Edited resume value (JSON) — leave blank to approve as-is</label>
                <textarea
                  rows={5}
                  value={resumeEditValue}
                  onChange={(e) => setResumeEditValue(e.target.value)}
                  placeholder='{ "decisions": [ { "type": "approve" } ] }'
                />
              </div>
              <div className="ww-flow-actions">
                <button
                  type="button"
                  className="ww-flow-btn ww-flow-btn--primary"
                  onClick={() => void submitResumeEdit()}
                  disabled={running}
                >
                  Resume with edit
                </button>
                <button type="button" className="ww-flow-btn" onClick={cancelResumeEdit} disabled={running}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="ww-flow-actions">
              <button
                type="button"
                className="ww-flow-btn ww-flow-btn--primary"
                onClick={() => void resolveInterrupt(true)}
                disabled={running}
              >
                Approve
              </button>
              <button type="button" className="ww-flow-btn" onClick={startResumeEdit} disabled={running}>
                Edit &amp; resume
              </button>
              <button
                type="button"
                className="ww-flow-btn ww-flow-btn--danger"
                onClick={() => void resolveInterrupt(false)}
                disabled={running}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {result && pendingInterrupt === null && (
        <div className={`ww-flow-result ww-flow-result--${result.status}`}>
          <div className="ww-flow-label">
            Result — {result.status}
            {result.totalTokens > 0 && <span> · {result.totalTokens} tokens</span>}
          </div>
          {result.errorMessage ? (
            <div className="ww-flow-alert ww-flow-alert--error">{result.errorMessage}</div>
          ) : result.outputJson ? (
            <pre>{result.outputJson}</pre>
          ) : null}
        </div>
      )}

      {showRunHistory && history.length > 0 && (
        <div className="ww-flow-history">
          <div className="ww-flow-label">Run history (this conversation)</div>
          {history.map((runSummary) => (
            <div key={runSummary.id} className={`ww-flow-history-row ww-flow-history-row--${runSummary.status}`}>
              <span className="ww-flow-history-status">{runSummary.status}</span>
              <span className="ww-flow-history-time">{new Date(runSummary.createdAt).toLocaleString()}</span>
              <span className="ww-flow-history-meta">
                {runSummary.totalTokens} tokens
                {runSummary.durationMs != null ? ` · ${(runSummary.durationMs / 1000).toFixed(1)}s` : ''}
              </span>
              {runSummary.errorMessage && (
                <span className="ww-flow-history-error" title={runSummary.errorMessage}>
                  ⚠
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showDebugInfo && events.length > 0 && (
        <div className="ww-flow-events">
          {events.map((line, index) => (
            <div key={index} className="ww-flow-event">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
