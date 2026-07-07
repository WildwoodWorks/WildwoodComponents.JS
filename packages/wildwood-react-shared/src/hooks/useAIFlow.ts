'use client';

// Business logic for AIFlowComponent (web + native) — ported from
// WildwoodComponents.Blazor/Components/AI/AIFlowComponent.razor.cs. The UI layers
// render this hook's state; all flow selection, input typing, streaming, interrupt
// resolution, and history behavior lives here.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  AIFlowModel,
  AIFlowRunEvent,
  AIFlowRunResult,
  AIFlowRunSummary,
  AuthenticationResponse,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAIFlowOptions {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to the client config. */
  apiBaseUrl?: string;
  /** Override the app whose flows are targeted. Defaults to the client config appId. */
  appId?: string;
  /** Fixed flow to run; auto-selected once flows load (the component hides its picker). */
  flowId?: string;
  /** Refresh the current thread's run history after each run (default true). */
  showRunHistory?: boolean;
  /** Keep a rolling log of raw stream events for debug display (default false). */
  captureEvents?: boolean;
  /** Raised with the run's terminal result (succeeded/failed/cancelled — not interrupted). */
  onRunCompleted?: (result: AIFlowRunResult) => void;
}

export interface UseAIFlowReturn {
  flows: AIFlowModel[];
  loadingFlows: boolean;
  selectedFlowId: string | null;
  selectedFlow: AIFlowModel | null;
  selectFlow: (flowId: string | null) => void;
  /** Per-field raw input values (keyed by field name) for the selected flow's input form. */
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  /** Free-form JSON input used when the flow declares no input fields. */
  rawInput: string;
  setRawInput: (value: string) => void;
  running: boolean;
  streamText: string;
  activeNode: string | null;
  /** Pretty-printed interrupt payload when the run paused for human review. */
  pendingInterrupt: string | null;
  editingResume: boolean;
  resumeEditValue: string;
  setResumeEditValue: (value: string) => void;
  error: string | null;
  result: AIFlowRunResult | null;
  history: AIFlowRunSummary[];
  /** Rolling debug log of raw stream events (only populated with captureEvents). */
  events: string[];
  run: () => Promise<void>;
  cancel: () => void;
  /** Approve or reject the pending human-review interrupt. */
  resolveInterrupt: (approve: boolean) => Promise<void>;
  startResumeEdit: () => void;
  cancelResumeEdit: () => void;
  /** Empty edit → plain approve; malformed JSON → validation error (nothing is sent). */
  submitResumeEdit: () => Promise<void>;
}

/** Parses a raw field value into a typed JSON value where possible (whole-string match only). */
function parseInputValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  // Only treat as a number when the whole string is numeric (not "5 apples").
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  // JSON object/array typed through verbatim; anything else stays a string.
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function shortData(data: unknown): string {
  if (data === undefined) return '';
  const text = JSON.stringify(data) ?? '';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function useAIFlow(options?: UseAIFlowOptions): UseAIFlowReturn {
  const client = useWildwood();
  const { apiBaseUrl, appId, flowId: fixedFlowId } = options ?? {};
  const showRunHistory = options?.showRunHistory ?? true;
  const captureEvents = options?.captureEvents ?? false;

  const [flows, setFlows] = useState<AIFlowModel[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [rawInput, setRawInput] = useState('{}');
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [pendingInterrupt, setPendingInterrupt] = useState<string | null>(null);
  const [editingResume, setEditingResume] = useState(false);
  const [resumeEditValue, setResumeEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIFlowRunResult | null>(null);
  const [history, setHistory] = useState<AIFlowRunSummary[]>([]);
  const [events, setEvents] = useState<string[]>([]);

  // Streamed tokens accumulate here (cheap append); streamText is materialized from it
  // only on a throttled flush to avoid a render per token on a long stream.
  const streamBufferRef = useRef('');
  const lastFlushRef = useRef(0);
  // Captured debug events buffer the same way: appended per SSE frame, materialized into
  // setEvents only on the throttled flush (plus the final flush) — not a render per frame.
  const eventsBufferRef = useRef<string[]>([]);
  // Run/thread continuity lives in refs: SSE callbacks update them mid-run without renders.
  const threadIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  // Re-entrancy guard: `running` state is async, so a double-click could start two
  // overlapping runs before the first render lands. Mirrors the Blazor/Razor/Swift guards.
  const runningRef = useRef(false);
  // Mirrors the pendingInterrupt state so resolveWith can snapshot/restore it without
  // taking the state value as a dependency.
  const pendingInterruptRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onRunCompletedRef = useRef(options?.onRunCompleted);
  onRunCompletedRef.current = options?.onRunCompleted;

  const setInterrupt = useCallback((value: string | null) => {
    pendingInterruptRef.current = value;
    setPendingInterrupt(value);
  }, []);

  const requestOptions = useCallback((signal?: AbortSignal) => ({ apiBaseUrl, appId, signal }), [apiBaseUrl, appId]);

  const resetRunState = useCallback(() => {
    streamBufferRef.current = '';
    eventsBufferRef.current = [];
    setStreamText('');
    setActiveNode(null);
    setInterrupt(null);
    setEditingResume(false);
    setResumeEditValue('');
    setError(null);
    setResult(null);
    setEvents([]);
  }, [setInterrupt]);

  const selectFlow = useCallback(
    (flowId: string | null) => {
      const id = flowId || null;
      setSelectedFlowId(id);
      setInputs({});
      setRawInput('{}');
      // A thread's checkpoint holds one flow's state — switching flows must start a
      // fresh thread, not resume the previous flow's checkpoint.
      threadIdRef.current = null;
      activeRunIdRef.current = null;
      setHistory([]);
      resetRunState();
    },
    [resetRunState],
  );

  // Derived, not stored: the selected flow object always tracks the CURRENT flows list,
  // so a reload can't leave a stale object from the previous app on screen.
  const selectedFlow = useMemo(
    () => (selectedFlowId ? (flows.find((f) => f.id === selectedFlowId) ?? null) : null),
    [flows, selectedFlowId],
  );

  // A token arriving after an initial (unauthenticated) load must trigger a reload —
  // otherwise the picker stays empty. Mirrors the Blazor component's OnParametersSetAsync.
  const [authEpoch, setAuthEpoch] = useState(0);
  useEffect(() => {
    return client.events.on('authChanged', (response: AuthenticationResponse | null) => {
      if (response) setAuthEpoch((n) => n + 1);
    });
  }, [client]);

  // Load flows on mount / when the target app changes / after login.
  useEffect(() => {
    let disposed = false;
    setLoadingFlows(true);
    setFlows([]);
    // The previous context's selection must not survive a reload: the flow id and thread
    // checkpoint are scoped to the app/base-URL/auth context that loaded them, and keeping
    // them would run the old app's flow (or resume its thread) against the new context.
    selectFlow(null);
    client.aiFlow
      .getFlows({ apiBaseUrl, appId })
      .then((loaded) => {
        if (disposed) return;
        setFlows(loaded);
        setLoadingFlows(false);
        // Auto-select a fixed flow, or the only flow.
        const initialId = fixedFlowId || (loaded.length === 1 ? loaded[0].id : null);
        if (initialId) selectFlow(initialId);
      })
      .catch(() => {
        if (!disposed) setLoadingFlows(false);
      });
    return () => {
      disposed = true;
    };
  }, [client, apiBaseUrl, appId, fixedFlowId, authEpoch, selectFlow]);

  // Surface session expiry the way the Blazor component's AuthenticationFailed handler does.
  useEffect(() => {
    return client.events.on('sessionExpired', () => {
      setError('Your session has expired. Please sign in again.');
      setRunning(false);
    });
  }, [client]);

  const setInput = useCallback((name: string, value: string) => {
    setInputs((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleEvent = useCallback(
    (evt: AIFlowRunEvent) => {
      const data = evt.data as Record<string, unknown> | undefined;
      const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
      switch (evt.event) {
        case 'run_started':
          if (typeof obj?.runId === 'string') activeRunIdRef.current = obj.runId;
          if (typeof obj?.threadId === 'string') threadIdRef.current = obj.threadId;
          break;
        case 'node_start':
          setActiveNode(typeof obj?.node === 'string' ? obj.node : null);
          break;
        case 'node_end':
          setActiveNode((current) => (current === obj?.node ? null : current));
          break;
        case 'token':
          streamBufferRef.current += typeof obj?.content === 'string' ? obj.content : '';
          break;
        case 'interrupt':
          if (obj && 'payload' in obj) setInterrupt(JSON.stringify(obj.payload, null, 2));
          break;
      }

      if (captureEvents) {
        const buffer = eventsBufferRef.current;
        buffer.push(`${evt.event}: ${shortData(evt.data)}`);
        if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
      }

      // Flush immediately for structural events; throttle token-only updates to ~10/s so a
      // long stream doesn't force thousands of renders. Captured debug events materialize
      // on the same flush instead of a state update per SSE frame.
      const isToken = evt.event === 'token';
      const now = Date.now();
      if (!isToken || now - lastFlushRef.current >= 100) {
        lastFlushRef.current = now;
        setStreamText(streamBufferRef.current);
        if (captureEvents) setEvents([...eventsBufferRef.current]);
      }
    },
    [captureEvents, setInterrupt],
  );

  /**
   * Refreshes the current thread's run history. Best-effort: history is an enrichment and
   * a lookup failure must never disturb the run result already on screen.
   */
  const loadHistory = useCallback(async () => {
    if (!showRunHistory || !threadIdRef.current) return;
    try {
      const runs = await client.aiFlow.getThreadRuns(threadIdRef.current, { apiBaseUrl, appId });
      setHistory(runs);
    } catch {
      // keep whatever history was shown before
    }
  }, [client, apiBaseUrl, appId, showRunHistory]);

  const finishRun = useCallback(
    (runResult: AIFlowRunResult, keepInterrupt = false) => {
      // Materialize anything that arrived since the last throttled flush.
      setStreamText(streamBufferRef.current);
      if (captureEvents) setEvents([...eventsBufferRef.current]);
      if (runResult.runId) activeRunIdRef.current = runResult.runId;
      if (runResult.threadId) threadIdRef.current = runResult.threadId;
      setActiveNode(null);
      setResult(runResult);
      if (runResult.status !== 'interrupted') {
        // keepInterrupt: a failed resume restored the interrupt so the user can retry —
        // don't clear it again here.
        if (!keepInterrupt) setInterrupt(null);
        onRunCompletedRef.current?.(runResult);
      }
      // History is an enrichment: refresh it in the background so the terminal result lands
      // and `running` flips false immediately (loadHistory swallows its own failures).
      void loadHistory();
    },
    [loadHistory, captureEvents, setInterrupt],
  );

  const resetAbort = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }, []);

  const buildInputJson = useCallback(
    (flow: AIFlowModel): string | null => {
      if (flow.inputFields.length > 0) {
        // Preserve JSON types: numbers/bools/null/objects entered in a field pass through
        // as typed values; everything else is a string.
        const obj: Record<string, unknown> = {};
        for (const field of flow.inputFields) {
          const value = inputs[field.name];
          if (value) obj[field.name] = parseInputValue(value);
        }
        return JSON.stringify(obj);
      }

      // Free-form JSON input must be a valid object.
      const raw = rawInput.trim() ? rawInput : '{}';
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return raw;
      } catch {
        return null;
      }
    },
    [inputs, rawInput],
  );

  const run = useCallback(async () => {
    // Ref-based guard: `running` state is async, so back-to-back calls could both pass a
    // state check and start overlapping runs.
    if (runningRef.current || !selectedFlow) return;
    resetRunState();

    const inputJson = buildInputJson(selectedFlow);
    if (inputJson === null) {
      setError('Input must be valid JSON.');
      return;
    }

    runningRef.current = true;
    setRunning(true);
    const controller = resetAbort();
    try {
      const runResult = await client.aiFlow.runFlow(
        selectedFlow.id,
        inputJson,
        threadIdRef.current,
        handleEvent,
        requestOptions(controller.signal),
      );
      finishRun(runResult);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [client, selectedFlow, buildInputJson, handleEvent, finishRun, requestOptions, resetAbort, resetRunState]);

  const resolveWith = useCallback(
    async (approve: boolean, valueJson: string | null) => {
      if (runningRef.current || !activeRunIdRef.current) return;
      // Snapshot the interrupt before clearing: when the resume fails, restore it so the
      // Approve/Reject panel returns and the user can retry instead of dead-ending.
      const interruptSnapshot = pendingInterruptRef.current;
      setInterrupt(null);
      setEditingResume(false);
      runningRef.current = true;
      setRunning(true);
      const controller = resetAbort();
      try {
        const runResult = await client.aiFlow.resolveInterrupt(
          activeRunIdRef.current,
          approve,
          valueJson,
          handleEvent,
          requestOptions(controller.signal),
        );
        const restoreInterrupt = runResult.status === 'failed' && interruptSnapshot !== null;
        if (restoreInterrupt) setInterrupt(interruptSnapshot);
        finishRun(runResult, restoreInterrupt);
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [client, handleEvent, finishRun, requestOptions, resetAbort, setInterrupt],
  );

  const resolveInterrupt = useCallback((approve: boolean) => resolveWith(approve, null), [resolveWith]);

  const startResumeEdit = useCallback(() => {
    setEditingResume(true);
    setError(null);
    // Start empty: an unchanged submit falls back to the server's default resolution,
    // which is shape-correct for BOTH agent HITL and plain interrupt nodes.
    setResumeEditValue('');
  }, []);

  const cancelResumeEdit = useCallback(() => setEditingResume(false), []);

  const submitResumeEdit = useCallback(async () => {
    const trimmed = resumeEditValue.trim();
    if (trimmed.length === 0) {
      await resolveWith(true, null); // empty edit → default approve
      return;
    }
    try {
      JSON.parse(trimmed); // fail fast on malformed JSON
    } catch {
      setError('Edited resume value must be valid JSON.');
      return;
    }
    await resolveWith(true, trimmed);
  }, [resumeEditValue, resolveWith]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Abort any in-flight run on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return {
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
  };
}
