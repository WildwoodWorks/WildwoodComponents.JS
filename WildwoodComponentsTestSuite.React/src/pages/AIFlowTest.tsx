import { useState } from 'react';
import { AIFlowComponent } from '@wildwood/react';
import type { AIFlowRunResult } from '@wildwood/core';

import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AIFlowTest() {
  const [flowId, setFlowId] = useState('');
  const [title, setTitle] = useState('AI Flows');
  const [runLabel, setRunLabel] = useState('Run');
  const [showFlowPicker, setShowFlowPicker] = useState(true);
  const [showLiveProgress, setShowLiveProgress] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showRunHistory, setShowRunHistory] = useState(true);
  const [lastResult, setLastResult] = useState<AIFlowRunResult | null>(null);

  return (
    <ComponentTestPage
      title="AI Flow Component"
      description="Runs published AI Flows (LangGraph): dynamic input form, SSE streaming, human-in-the-loop review, and run history."
      settings={{
        flowId: { type: 'text', value: flowId },
        title: { type: 'text', value: title },
        runLabel: { type: 'text', value: runLabel },
        showFlowPicker: { type: 'boolean', value: showFlowPicker },
        showLiveProgress: { type: 'boolean', value: showLiveProgress },
        showDebugInfo: { type: 'boolean', value: showDebugInfo },
        showRunHistory: { type: 'boolean', value: showRunHistory },
      }}
      onSettingChange={(key, value) => {
        if (key === 'flowId') setFlowId(value as string);
        if (key === 'title') setTitle(value as string);
        if (key === 'runLabel') setRunLabel(value as string);
        if (key === 'showFlowPicker') setShowFlowPicker(value as boolean);
        if (key === 'showLiveProgress') setShowLiveProgress(value as boolean);
        if (key === 'showDebugInfo') setShowDebugInfo(value as boolean);
        if (key === 'showRunHistory') setShowRunHistory(value as boolean);
      }}
    >
      <AIFlowComponent
        // Re-mount when the fixed flow changes so auto-selection re-runs
        key={flowId || 'picker'}
        flowId={flowId || undefined}
        title={title}
        runLabel={runLabel}
        showFlowPicker={showFlowPicker}
        showLiveProgress={showLiveProgress}
        showDebugInfo={showDebugInfo}
        showRunHistory={showRunHistory}
        onRunCompleted={(result) => {
          setLastResult(result);
          console.log('AI flow run completed:', result);
        }}
      />

      {lastResult && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Last Run Result</h3>
          <dl>
            <dt>Status</dt>
            <dd>{lastResult.status}</dd>
            <dt>Total Tokens</dt>
            <dd>{lastResult.totalTokens}</dd>
            {lastResult.runId && (
              <>
                <dt>Run ID</dt>
                <dd>{lastResult.runId}</dd>
              </>
            )}
            {lastResult.threadId && (
              <>
                <dt>Thread ID</dt>
                <dd>{lastResult.threadId}</dd>
              </>
            )}
            {lastResult.errorMessage && (
              <>
                <dt>Error</dt>
                <dd>{lastResult.errorMessage}</dd>
              </>
            )}
            {lastResult.outputJson && (
              <>
                <dt>Output</dt>
                <dd style={{ maxHeight: 100, overflow: 'auto' }}>{lastResult.outputJson}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
