import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AIChatRequest, AIChatResponse } from '@wildwood/core';
import { useAI } from '../hooks/useAI';
import type { FilePickerResult } from './AIChatComponent';

export interface AIProxyComponentProps {
  configurationId: string;
  placeholder?: string;
  /** Allow attaching a file to the prompt. Default: false. */
  allowFileUpload?: boolean;
  /**
   * Callback to launch a file picker. Return a FilePickerResult or null if cancelled.
   * Required when allowFileUpload is true. Consumer chooses the file-picker library
   * (expo-document-picker, react-native-document-picker, etc.).
   */
  onPickFile?: () => Promise<FilePickerResult | null>;
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
  allowFileUpload = false,
  onPickFile,
  onResponse,
  onError,
  style,
}: AIProxyComponentProps) {
  const { sendProxyMessage, sendProxyMessageWithFile, loading } = useAI();

  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [pendingFile, setPendingFile] = useState<FilePickerResult | null>(null);

  const handleAttach = useCallback(async () => {
    if (!onPickFile || loading) return;
    const result = await onPickFile();
    if (result) setPendingFile(result);
  }, [onPickFile, loading]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;

    setError(null);
    setResponse(null);

    try {
      const request: AIChatRequest = {
        configurationId,
        message: input.trim(),
        saveToSession: false,
      };

      let result: AIChatResponse;
      if (pendingFile?.file) {
        result = await sendProxyMessageWithFile(request, pendingFile.file, pendingFile.fileName);
      } else if (pendingFile?.base64) {
        result = await sendProxyMessage({
          ...request,
          fileBase64: pendingFile.base64,
          fileMediaType: pendingFile.mimeType,
          fileName: pendingFile.fileName,
        });
      } else {
        result = await sendProxyMessage(request);
      }

      if (result.isError) {
        setError(result.errorMessage ?? 'AI request failed');
        onError?.(result.errorMessage ?? 'AI request failed');
      } else {
        setResponse(result.response);
        setTokensUsed(result.tokensUsed);
        setPendingFile(null);
        onResponse?.(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      setError(msg);
      onError?.(msg);
    }
  }, [input, loading, pendingFile, sendProxyMessage, sendProxyMessageWithFile, configurationId, onResponse, onError]);

  return (
    <View style={[styles.container, style]}>
      {pendingFile && (
        <View style={styles.fileBadgeRow}>
          <View style={styles.fileBadge}>
            <Text style={styles.fileBadgeText} numberOfLines={1}>
              {pendingFile.fileName}
            </Text>
            <Pressable onPress={() => setPendingFile(null)} hitSlop={6}>
              <Text style={styles.fileBadgeRemove}>{'×'}</Text>
            </Pressable>
          </View>
        </View>
      )}
      <View style={styles.inputRow}>
        {allowFileUpload && onPickFile && (
          <Pressable
            style={[styles.attachButton, loading && styles.buttonDisabled]}
            onPress={handleAttach}
            disabled={loading}
            accessibilityLabel="Attach file"
          >
            <Text style={styles.attachButtonText}>{'📎'}</Text>
          </Pressable>
        )}
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
    alignItems: 'center',
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
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  attachButtonText: {
    fontSize: 18,
  },
  fileBadgeRow: {
    marginBottom: 8,
  },
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  fileBadgeText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#1e293b',
    marginRight: 6,
  },
  fileBadgeRemove: {
    fontSize: 18,
    color: '#64748b',
    paddingHorizontal: 4,
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
