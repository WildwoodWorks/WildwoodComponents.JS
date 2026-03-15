import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AIChatResponse } from '@wildwood/core';
import { useAI } from '../hooks/useAI';

export interface AIProxyComponentProps {
  configurationId: string;
  placeholder?: string;
  onResponse?: (response: AIChatResponse) => void;
  onError?: (error: string) => void;
  style?: ViewStyle;
}

/**
 * Simple AI proxy component - sends a single message and displays the response.
 * No session management, no chat history. For quick AI interactions.
 */
export function AIProxyComponent({
  configurationId,
  placeholder = 'Ask a question...',
  onResponse,
  onError,
  style,
}: AIProxyComponentProps) {
  const { sendMessage, loading } = useAI();

  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;

    setError(null);
    setResponse(null);

    try {
      const result = await sendMessage({
        configurationId,
        message: input.trim(),
        saveToSession: false,
      });

      if (result.isError) {
        setError(result.errorMessage ?? 'AI request failed');
        onError?.(result.errorMessage ?? 'AI request failed');
      } else {
        setResponse(result.response);
        setTokensUsed(result.tokensUsed);
        onResponse?.(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      setError(msg);
      onError?.(msg);
    }
  }, [input, loading, sendMessage, configurationId, onResponse, onError]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, loading && styles.inputDisabled]}
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor="#999"
          editable={!loading}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.button, (loading || !input.trim()) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading || !input.trim()}
        >
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Send</Text>}
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {response && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseText}>{response}</Text>
          {tokensUsed > 0 && <Text style={styles.tokenText}>Tokens used: {tokensUsed}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  button: {
    backgroundColor: '#D4882C',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  responseContainer: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  responseText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1e293b',
  },
  tokenText: {
    marginTop: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
});
