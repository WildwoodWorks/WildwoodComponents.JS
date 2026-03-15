import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Switch, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { FlowExecution, FlowInputField } from '@wildwood/core';
import { useAIFlowLogic, TERMINAL_STATUSES, getInputType, formatDuration } from '@wildwood/react-shared';

export interface AIFlowComponentProps {
  flowId?: string;
  autoLoad?: boolean;
  showHistory?: boolean;
  pollingIntervalMs?: number;
  outputKeyFilter?: string[];
  onFlowCompleted?: (execution: FlowExecution) => void;
  onFlowFailed?: (execution: FlowExecution) => void;
  onAuthenticationFailed?: () => void;
  style?: ViewStyle;
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return '#22C55E';
    case 'failed':
      return '#EF4444';
    case 'running':
      return '#007AFF';
    case 'cancelled':
    case 'timeout':
    case 'timedout':
      return '#F59E0B';
    case 'skipped':
      return '#999';
    default:
      return '#999';
  }
}

function getStatusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return '\u2713';
    case 'failed':
      return '\u2717';
    case 'running':
      return '\u25CB';
    case 'cancelled':
      return '\u2715';
    case 'timeout':
    case 'timedout':
      return '\u23F1';
    case 'skipped':
      return '\u23ED';
    default:
      return '\u23F3';
  }
}

export function AIFlowComponent({
  flowId,
  autoLoad = true,
  showHistory = true,
  pollingIntervalMs = 1500,
  outputKeyFilter,
  onFlowCompleted,
  onFlowFailed,
  onAuthenticationFailed,
  style,
}: AIFlowComponentProps) {
  const {
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
  } = useAIFlowLogic({
    flowId,
    autoLoad,
    showHistory,
    pollingIntervalMs,
    outputKeyFilter,
    onFlowCompleted,
    onFlowFailed,
    onAuthenticationFailed,
  });

  const renderInputField = (field: FlowInputField) => {
    const inputType = getInputType(field.fieldType);
    const value = inputValues[field.name] ?? '';

    if (field.options && field.options.length > 0) {
      // RN doesn't have a native select; render as pressable options
      return (
        <View style={styles.optionList}>
          {field.options.map((opt) => (
            <Pressable
              key={opt}
              style={[styles.optionItem, value === opt && styles.optionItemSelected]}
              onPress={() => handleInputChange(field.name, opt)}
            >
              <Text style={[styles.optionItemText, value === opt && styles.optionItemTextSelected]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      );
    }

    if (inputType === 'checkbox') {
      return (
        <View style={styles.checkboxRow}>
          <Switch value={value === 'true'} onValueChange={(v) => handleInputChange(field.name, v ? 'true' : 'false')} />
          <Text style={styles.checkboxLabel}>{field.description ?? field.displayName}</Text>
        </View>
      );
    }

    return (
      <TextInput
        style={[styles.textInput, inputType === 'textarea' && styles.textArea]}
        value={value}
        onChangeText={(v) => handleInputChange(field.name, v)}
        placeholder={field.description}
        keyboardType={
          inputType === 'number'
            ? 'numeric'
            : inputType === 'email'
              ? 'email-address'
              : inputType === 'url'
                ? 'url'
                : 'default'
        }
        multiline={inputType === 'textarea'}
        numberOfLines={inputType === 'textarea' ? 4 : 1}
        accessibilityLabel={field.displayName}
      />
    );
  };

  const renderOutput = (execution: FlowExecution) => {
    if (!execution.outputValues || Object.keys(execution.outputValues).length === 0) {
      return <Text style={styles.mutedText}>No output</Text>;
    }

    const entries = Object.entries(execution.outputValues);
    const filteredEntries = outputKeyFilter ? entries.filter(([key]) => outputKeyFilter.includes(key)) : entries;

    if (filteredEntries.length === 0) {
      return <Text style={styles.mutedText}>No matching output</Text>;
    }

    return (
      <View style={styles.outputContainer}>
        {filteredEntries.map(([key, val]) => {
          let formatted = val;
          try {
            const parsed = JSON.parse(val);
            formatted = JSON.stringify(parsed, null, 2);
          } catch {
            /* not JSON */
          }

          return (
            <View key={key} style={styles.outputItem}>
              <Text style={styles.outputLabel}>{key}</Text>
              <View style={styles.outputValueBox}>
                <Text style={styles.outputValue}>{formatted}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.content}>
      {/* Error */}
      {error || executionError ? (
        <View style={styles.alertDanger}>
          <Text style={styles.alertDangerText}>{error || executionError}</Text>
          {executionError ? (
            <Pressable onPress={dismissError}>
              <Text style={styles.alertDismiss}>{'\u2715'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Flow selector */}
      {!flowId && !selectedFlow ? (
        <View>
          <Text style={styles.sectionTitle}>Available Flows</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading flows...</Text>
            </View>
          ) : definitions.length === 0 ? (
            <Text style={styles.mutedText}>No flows available</Text>
          ) : (
            <View style={styles.flowList}>
              {definitions
                .filter((d) => d.isActive)
                .map((flow) => (
                  <Pressable key={flow.id} style={styles.flowListItem} onPress={() => handleSelectFlow(flow)}>
                    <Text style={styles.flowListName}>{flow.name}</Text>
                    {flow.description ? <Text style={styles.flowListDesc}>{flow.description}</Text> : null}
                    <View style={styles.flowListMeta}>
                      <Text style={styles.mutedText}>
                        {flow.inputFields.length} input{flow.inputFields.length !== 1 ? 's' : ''}
                      </Text>
                      <Text style={styles.mutedText}>v{flow.version}</Text>
                    </View>
                  </Pressable>
                ))}
            </View>
          )}
        </View>
      ) : null}

      {/* Flow form */}
      {selectedFlow && !activeExecution ? (
        <View>
          <View style={styles.formHeader}>
            {!flowId ? (
              <Pressable onPress={clearSelectedFlow} style={styles.backButton}>
                <Text style={styles.backButtonText}>{'\u2039'} Back</Text>
              </Pressable>
            ) : null}
            <Text style={styles.formTitle}>{selectedFlow.name}</Text>
            {selectedFlow.description ? <Text style={styles.mutedText}>{selectedFlow.description}</Text> : null}
          </View>

          {selectedFlow.inputFields.length > 0 ? (
            <View style={styles.inputsContainer}>
              {selectedFlow.inputFields
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((field) => (
                  <View key={field.name} style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>
                      {field.displayName}
                      {field.isRequired ? <Text style={styles.requiredMark}> *</Text> : null}
                    </Text>
                    {renderInputField(field)}
                    {field.description && getInputType(field.fieldType) !== 'checkbox' ? (
                      <Text style={styles.fieldHint}>{field.description}</Text>
                    ) : null}
                  </View>
                ))}
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryButton, (executing || loading) && styles.buttonDisabled]}
            onPress={handleExecute}
            disabled={executing || loading}
          >
            {executing ? (
              <View style={styles.buttonRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.primaryButtonText}> Executing...</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{'\u25B6'} Run Flow</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Active execution */}
      {activeExecution ? (
        <View>
          <View style={styles.executionHeader}>
            <Text style={styles.formTitle}>{activeExecution.flowName}</Text>
            <View style={[styles.badge, { backgroundColor: getStatusColor(activeExecution.status) + '22' }]}>
              <Text style={[styles.badgeText, { color: getStatusColor(activeExecution.status) }]}>
                {activeExecution.status}
              </Text>
            </View>
          </View>

          <View style={styles.executionMeta}>
            <Text style={styles.mutedText}>
              Duration: {formatDuration(activeExecution.startedAt, activeExecution.completedAt)}
            </Text>
            <Text style={styles.mutedText}>
              Steps: {activeExecution.currentStepIndex}/{activeExecution.totalSteps}
            </Text>
          </View>

          {/* Steps */}
          {activeExecution.steps && activeExecution.steps.length > 0 ? (
            <View style={styles.stepsContainer}>
              {activeExecution.steps.map((step) => (
                <View key={step.stepIndex} style={styles.stepRow}>
                  <Text style={[styles.stepIcon, { color: getStatusColor(step.status) }]}>
                    {getStatusIcon(step.status)}
                  </Text>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepName}>{step.stepName}</Text>
                    {step.startedAt && step.completedAt ? (
                      <Text style={styles.mutedText}>{formatDuration(step.startedAt, step.completedAt)}</Text>
                    ) : null}
                    {step.errorMessage ? <Text style={styles.stepError}>{step.errorMessage}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Error */}
          {activeExecution.errorMessage ? (
            <View style={styles.alertDanger}>
              <Text style={styles.alertDangerText}>{activeExecution.errorMessage}</Text>
            </View>
          ) : null}

          {/* Output */}
          {TERMINAL_STATUSES.includes(activeExecution.status) ? (
            <View>
              <Text style={styles.sectionTitle}>Output</Text>
              {renderOutput(activeExecution)}
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionRow}>
            {!TERMINAL_STATUSES.includes(activeExecution.status) ? (
              <Pressable
                style={[styles.dangerButton, cancelling && styles.buttonDisabled]}
                onPress={handleCancel}
                disabled={cancelling}
              >
                <Text style={styles.dangerButtonText}>{cancelling ? 'Cancelling...' : 'Cancel Execution'}</Text>
              </Pressable>
            ) : null}
            {TERMINAL_STATUSES.includes(activeExecution.status) ? (
              <Pressable style={styles.primaryButton} onPress={handleReset}>
                <Text style={styles.primaryButtonText}>Run Again</Text>
              </Pressable>
            ) : null}
            {!flowId ? (
              <Pressable style={styles.outlineButton} onPress={clearActiveExecution}>
                <Text style={styles.outlineButtonText}>Back to Flows</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* History */}
      {showHistory && executions.length > 0 && !activeExecution ? (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent Executions</Text>
          {executions.slice(0, 10).map((exec) => (
            <Pressable key={exec.id} style={styles.historyItem} onPress={() => setActiveExecutionFromHistory(exec)}>
              <Text style={styles.historyName}>{exec.flowName}</Text>
              <View style={styles.historyMeta}>
                <View style={[styles.badgeSm, { backgroundColor: getStatusColor(exec.status) + '22' }]}>
                  <Text style={[styles.badgeSmText, { color: getStatusColor(exec.status) }]}>{exec.status}</Text>
                </View>
                <Text style={styles.mutedText}>{formatDuration(exec.startedAt, exec.completedAt)}</Text>
                <Text style={styles.mutedText}>{new Date(exec.startedAt).toLocaleString()}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  alertDanger: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertDangerText: { color: '#991B1B', fontSize: 14, flex: 1 },
  alertDismiss: { color: '#991B1B', fontSize: 18, paddingLeft: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  mutedText: { fontSize: 13, color: '#999' },
  flowList: { gap: 10 },
  flowListItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  flowListName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  flowListDesc: { fontSize: 13, color: '#666', marginBottom: 8 },
  flowListMeta: { flexDirection: 'row', gap: 12 },
  formHeader: { marginBottom: 16 },
  backButton: { marginBottom: 8 },
  backButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  inputsContainer: { gap: 14, marginBottom: 16 },
  formGroup: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  requiredMark: { color: '#EF4444' },
  fieldHint: { fontSize: 12, color: '#999' },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionItem: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  optionItemSelected: { borderColor: '#007AFF', backgroundColor: '#EBF5FF' },
  optionItemText: { fontSize: 14, color: '#333' },
  optionItemTextSelected: { color: '#007AFF', fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxLabel: { fontSize: 14, color: '#333', flex: 1 },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  dangerButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  outlineButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  executionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  executionMeta: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  badgeSm: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeSmText: { fontSize: 11, fontWeight: '600' },
  stepsContainer: { gap: 8, marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepIcon: { fontSize: 18, fontWeight: '700', width: 24, textAlign: 'center' },
  stepInfo: { flex: 1 },
  stepName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  stepError: { fontSize: 12, color: '#EF4444', marginTop: 2 },
  outputContainer: { gap: 10 },
  outputItem: { gap: 4 },
  outputLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  outputValueBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
  },
  outputValue: { fontSize: 13, color: '#1a1a1a', fontFamily: 'monospace' },
  actionRow: { gap: 10, marginTop: 16 },
  historySection: { marginTop: 24 },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 8,
  },
  historyName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  historyMeta: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
