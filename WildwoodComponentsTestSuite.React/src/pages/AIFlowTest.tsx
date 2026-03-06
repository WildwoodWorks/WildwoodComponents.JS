import { useState, useEffect } from 'react';
import { useAIFlow } from '@wildwood/react';
import type { FlowDefinition } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AIFlowTest() {
  const {
    definitions,
    executions,
    loading,
    error,
    getFlowDefinitions,
    executeFlow,
    getFlowExecutions,
  } = useAIFlow();

  const [selectedFlow, setSelectedFlow] = useState<FlowDefinition | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  useEffect(() => {
    getFlowDefinitions();
  }, [getFlowDefinitions]);

  const handleSelectFlow = (flow: FlowDefinition) => {
    setSelectedFlow(flow);
    const defaults: Record<string, string> = {};
    flow.inputFields.forEach((f) => {
      defaults[f.name] = f.defaultValue ?? '';
    });
    setInputValues(defaults);
  };

  const handleExecute = async () => {
    if (!selectedFlow) return;
    try {
      await executeFlow({
        flowDefinitionId: selectedFlow.id,
        inputValues,
      });
      await getFlowExecutions(selectedFlow.id);
    } catch {
      // error is set by the hook
    }
  };

  return (
    <ComponentTestPage
      title="AI Flow Component"
      description="Browse and execute AI workflow definitions."
    >
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Flow definitions list */}
        <div style={{ flex: 1 }}>
          <h3>Flow Definitions</h3>
          {definitions.length === 0 && !loading && (
            <p style={{ color: '#6b7280' }}>No flow definitions available.</p>
          )}
          {definitions.map((flow) => (
            <div
              key={flow.id}
              onClick={() => handleSelectFlow(flow)}
              style={{
                padding: 12,
                marginBottom: 8,
                border: `2px solid ${selectedFlow?.id === flow.id ? '#007AFF' : '#e5e7eb'}`,
                borderRadius: 8,
                cursor: 'pointer',
                backgroundColor: selectedFlow?.id === flow.id ? '#eff6ff' : '#fff',
              }}
            >
              <strong>{flow.name}</strong>
              {flow.description && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>{flow.description}</p>}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                v{flow.version} &middot; {flow.inputFields.length} input{flow.inputFields.length !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Execute panel */}
        <div style={{ flex: 1 }}>
          {selectedFlow ? (
            <>
              <h3>Execute: {selectedFlow.name}</h3>
              {selectedFlow.inputFields
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((field) => (
                  <div key={field.name} style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
                      {field.displayName}
                      {field.isRequired && <span style={{ color: '#dc3545' }}> *</span>}
                    </label>
                    {field.description && (
                      <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 13 }}>{field.description}</p>
                    )}
                    {field.options && field.options.length > 0 ? (
                      <select
                        value={inputValues[field.name] ?? ''}
                        onChange={(e) => setInputValues({ ...inputValues, [field.name]: e.target.value })}
                        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={inputValues[field.name] ?? ''}
                        onChange={(e) => setInputValues({ ...inputValues, [field.name]: e.target.value })}
                        placeholder={field.defaultValue ?? ''}
                        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                      />
                    )}
                  </div>
                ))}
              <button
                onClick={handleExecute}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#007AFF',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Executing...' : 'Execute Flow'}
              </button>
            </>
          ) : (
            <p style={{ color: '#6b7280' }}>Select a flow definition to execute it.</p>
          )}
        </div>
      </div>

      {/* Executions history */}
      {executions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Execution History</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Flow</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Steps</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr key={exec.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{exec.flowName}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 500,
                      backgroundColor: exec.status === 'Completed' ? '#dcfce7' : exec.status === 'Failed' ? '#fee2e2' : '#fef3c7',
                      color: exec.status === 'Completed' ? '#166534' : exec.status === 'Failed' ? '#991b1b' : '#92400e',
                    }}>
                      {exec.status}
                    </span>
                  </td>
                  <td style={{ padding: 8 }}>{exec.currentStepIndex + 1}/{exec.totalSteps}</td>
                  <td style={{ padding: 8, fontSize: 13, color: '#6b7280' }}>
                    {new Date(exec.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComponentTestPage>
  );
}
