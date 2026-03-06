// Minimal react-native mock for vitest
import { forwardRef, createElement } from 'react';

const createMockComponent = (name: string) =>
  forwardRef((props: Record<string, unknown>, ref: unknown) =>
    createElement(name, { ...props, ref } as Record<string, unknown>));

export const View = createMockComponent('View');
export const Text = createMockComponent('Text');
export const TextInput = createMockComponent('TextInput');
export const Pressable = createMockComponent('Pressable');
export const ScrollView = createMockComponent('ScrollView');
export const FlatList = createMockComponent('FlatList');
export const ActivityIndicator = createMockComponent('ActivityIndicator');
export const Image = createMockComponent('Image');
export const KeyboardAvoidingView = createMockComponent('KeyboardAvoidingView');
export const TouchableOpacity = createMockComponent('TouchableOpacity');
export const Modal = createMockComponent('Modal');
export const SafeAreaView = createMockComponent('SafeAreaView');

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown) => style,
};

export const Platform = {
  OS: 'ios' as const,
  select: <T>(specifics: { ios?: T; android?: T; default?: T }) =>
    specifics.ios ?? specifics.default,
};

export const Alert = {
  alert: (_title: string, _message?: string, _buttons?: unknown[]) => {},
};

export const Linking = {
  openURL: async (_url: string) => {},
  canOpenURL: async (_url: string) => true,
};

export const Dimensions = {
  get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
};

export const Animated = {
  View: createMockComponent('Animated.View'),
  Text: createMockComponent('Animated.Text'),
  Value: class { constructor() {} },
  timing: () => ({ start: () => {} }),
  spring: () => ({ start: () => {} }),
};
