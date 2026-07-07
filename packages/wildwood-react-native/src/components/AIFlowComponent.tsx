// Runs published "AI Flows with LangChain" for an app user: flow picker (or fixed flowId),
// an auto-generated input form from the flow's state channels, live streamed progress,
// human-in-the-loop approval, and output rendering.
// Native counterpart of @wildwood/react's AIFlowComponent — same shared useAIFlow hook.

import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AIFlowRunResult } from '@wildwood/core';
import { useAIFlow } from '../hooks/useAIFlow';

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
  style?: ViewStyle;
}

const HISTORY_STATUS_COLORS: Record<string, string> = {
  succeeded: '#22C55E',
  failed: '#EF4444',
  interrupted: '#F59E0B',
  cancelled: '#999',
};

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
  style,
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
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>

      {loadingFlows ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.mutedText}>Loading flows…</Text>
        </View>
      ) : flows.length === 0 ? (
        <Text style={[styles.mutedText, styles.centeredText]}>No published flows are available for this app.</Text>
      ) : (
        <>
          {/* Flow picker (no native <select>: a pressable flow list) */}
          {showFlowPicker && !flowId ? (
            <View style={styles.field}>
              <Text style={styles.label}>Flow</Text>
              <View style={styles.flowList}>
                {flows.map((flow) => (
                  <Pressable
                    key={flow.id}
                    style={[styles.flowOption, selectedFlowId === flow.id && styles.flowOptionSelected]}
                    onPress={() => selectFlow(flow.id)}
                    disabled={running}
                  >
                    <Text style={[styles.flowOptionText, selectedFlowId === flow.id && styles.flowOptionTextSelected]}>
                      {flow.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {selectedFlow ? (
            <>
              {selectedFlow.description ? <Text style={styles.description}>{selectedFlow.description}</Text> : null}

              <View style={styles.inputs}>
                {selectedFlow.inputFields.map((field) => (
                  <View key={field.name} style={styles.field}>
                    <Text style={styles.label}>{field.name}</Text>
                    <TextInput
                      style={styles.input}
                      value={inputs[field.name] ?? ''}
                      onChangeText={(text) => setInput(field.name, text)}
                      editable={!running}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
                {selectedFlow.inputFields.length === 0 ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Input (JSON)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={rawInput}
                      onChangeText={setRawInput}
                      editable={!running}
                      multiline
                      numberOfLines={3}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                {!running ? (
                  <Pressable style={styles.primaryButton} onPress={() => void run()}>
                    <Text style={styles.primaryButtonText}>{runLabel}</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.dangerButton} onPress={cancel}>
                    <Text style={styles.dangerButtonText}>Stop</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : null}
        </>
      )}

      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}

      {showLiveProgress && running && activeNode ? (
        <View style={styles.progressRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.progressText}>
            Running <Text style={styles.progressNode}>{activeNode}</Text>…
          </Text>
        </View>
      ) : null}

      {streamText ? (
        <View>
          <Text style={styles.sectionLabel}>Output</Text>
          <ScrollView style={styles.streamBox}>
            <Text style={styles.streamText}>{streamText}</Text>
          </ScrollView>
        </View>
      ) : null}

      {pendingInterrupt !== null ? (
        <View style={styles.alertWarn}>
          <Text style={styles.sectionLabel}>Human review needed</Text>
          <ScrollView style={styles.interruptBox}>
            <Text style={styles.interruptText}>{pendingInterrupt}</Text>
          </ScrollView>
          {editingResume ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Edited resume value (JSON) — leave blank to approve as-is</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={resumeEditValue}
                  onChangeText={setResumeEditValue}
                  multiline
                  numberOfLines={5}
                  placeholder='{ "decisions": [ { "type": "approve" } ] }'
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryButton, running && styles.buttonDisabled]}
                  onPress={() => void submitResumeEdit()}
                  disabled={running}
                >
                  <Text style={styles.primaryButtonText}>Resume with edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.outlineButton, running && styles.buttonDisabled]}
                  onPress={cancelResumeEdit}
                  disabled={running}
                >
                  <Text style={styles.outlineButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryButton, running && styles.buttonDisabled]}
                onPress={() => void resolveInterrupt(true)}
                disabled={running}
              >
                <Text style={styles.primaryButtonText}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineButton, running && styles.buttonDisabled]}
                onPress={startResumeEdit}
                disabled={running}
              >
                <Text style={styles.outlineButtonText}>Edit & resume</Text>
              </Pressable>
              <Pressable
                style={[styles.dangerButton, running && styles.buttonDisabled]}
                onPress={() => void resolveInterrupt(false)}
                disabled={running}
              >
                <Text style={styles.dangerButtonText}>Reject</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {result && pendingInterrupt === null ? (
        <View style={styles.resultBox}>
          <Text style={styles.sectionLabel}>
            Result — {result.status}
            {result.totalTokens > 0 ? ` · ${result.totalTokens} tokens` : ''}
          </Text>
          {result.errorMessage ? (
            <View style={styles.alertError}>
              <Text style={styles.alertErrorText}>{result.errorMessage}</Text>
            </View>
          ) : result.outputJson ? (
            <ScrollView style={styles.streamBox}>
              <Text style={styles.streamText}>{result.outputJson}</Text>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {showRunHistory && history.length > 0 ? (
        <View style={styles.historyBox}>
          <Text style={styles.sectionLabel}>Run history (this conversation)</Text>
          {history.map((runSummary) => (
            <View key={runSummary.id} style={styles.historyRow}>
              <Text style={[styles.historyStatus, { color: HISTORY_STATUS_COLORS[runSummary.status] ?? '#666' }]}>
                {runSummary.status}
              </Text>
              <Text style={styles.historyMeta}>{new Date(runSummary.createdAt).toLocaleString()}</Text>
              <Text style={styles.historyMeta}>
                {runSummary.totalTokens} tokens
                {runSummary.durationMs != null ? ` · ${(runSummary.durationMs / 1000).toFixed(1)}s` : ''}
              </Text>
              {runSummary.errorMessage ? <Text style={styles.historyError}>⚠</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {showDebugInfo && events.length > 0 ? (
        <ScrollView style={styles.eventsBox}>
          {events.map((line, index) => (
            <Text key={index} style={styles.eventText}>
              {line}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  centered: { alignItems: 'center', padding: 16, gap: 8 },
  centeredText: { textAlign: 'center', padding: 16 },
  mutedText: { fontSize: 14, color: '#999' },
  description: { fontSize: 14, color: '#666', lineHeight: 20 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#666' },
  flowList: { gap: 6 },
  flowOption: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  flowOptionSelected: { borderColor: '#007AFF', backgroundColor: '#EFF6FF' },
  flowOptionText: { fontSize: 14, color: '#333' },
  flowOptionTextSelected: { color: '#007AFF', fontWeight: '600' },
  inputs: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dangerButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  outlineButtonText: { color: '#333', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { fontSize: 14, color: '#666' },
  progressNode: { fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  streamBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    maxHeight: 260,
  },
  streamText: { color: '#e2e8f0', fontSize: 12, fontFamily: 'Courier' },
  alertError: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10 },
  alertErrorText: { color: '#991B1B', fontSize: 13 },
  alertWarn: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12, gap: 8 },
  interruptBox: { backgroundColor: '#fff', borderRadius: 6, padding: 8, maxHeight: 160 },
  interruptText: { color: '#1a1a1a', fontSize: 12, fontFamily: 'Courier' },
  resultBox: { gap: 4 },
  historyBox: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, gap: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  historyStatus: { minWidth: 88, fontSize: 13, fontWeight: '600' },
  historyMeta: { fontSize: 12, color: '#999' },
  historyError: { color: '#EF4444', fontSize: 13 },
  eventsBox: { maxHeight: 200 },
  eventText: { fontSize: 11, color: '#999', fontFamily: 'Courier' },
});
