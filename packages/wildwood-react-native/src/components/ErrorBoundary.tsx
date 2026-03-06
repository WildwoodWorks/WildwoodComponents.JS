import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  style?: object;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Wildwood] Component error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback, style } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      return (
        <View style={[styles.container, style]} accessibilityRole="alert">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{error.message}</Text>
          <Pressable style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    margin: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#D4882C',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
