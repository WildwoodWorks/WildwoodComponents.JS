import { describe, it, expect } from 'vitest';

// Can't import full index (react-native not available in vitest).
// Test individual hooks that only depend on react + @wildwood/core.
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { useWildwoodComponent } from '../hooks/useWildwoodComponent';
import { useFeedback } from '../hooks/useFeedback';

// Test theme/styles (no react-native dependency)
import { defaultTheme, themes } from '../styles/theme';

describe('@wildwood/react-native hooks', () => {
  it('usePlatformDetection is a function', () => {
    expect(typeof usePlatformDetection).toBe('function');
  });

  it('useWildwoodComponent is a function', () => {
    expect(typeof useWildwoodComponent).toBe('function');
  });

  it('useFeedback is a function', () => {
    expect(typeof useFeedback).toBe('function');
  });
});

describe('@wildwood/react-native styles', () => {
  it('defaultTheme has expected properties', () => {
    expect(defaultTheme).toBeDefined();
    expect(defaultTheme.colors).toBeDefined();
    expect(defaultTheme.colors.primary).toBeDefined();
  });

  it('themes contains multiple themes', () => {
    expect(themes).toBeDefined();
    expect(Object.keys(themes).length).toBeGreaterThanOrEqual(1);
  });
});
