import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export interface LoadingSpinnerProps {
  size?: number | 'small' | 'large';
  color?: string;
  message?: string;
  style?: object;
}

export function LoadingSpinner({ size = 'large', color = '#D4882C', message, style }: LoadingSpinnerProps) {
  return (
    <View style={[styles.container, style]} accessibilityRole="none" accessibilityLabel="Loading">
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});
