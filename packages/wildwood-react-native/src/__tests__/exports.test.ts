import { describe, it, expect } from 'vitest';

// Can't import full index (react-native not available in vitest).
// Test individual hooks that only depend on react + @wildwood/core.
import { useAIFlow } from '../hooks/useAIFlow';
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { useWildwoodComponent } from '../hooks/useWildwoodComponent';

// Test theme/styles (no react-native dependency)
import { defaultTheme, themes } from '../styles/theme';

describe('@wildwood/react-native hooks', () => {
  it('useAIFlow is a function', () => {
    expect(typeof useAIFlow).toBe('function');
  });

  it('usePlatformDetection is a function', () => {
    expect(typeof usePlatformDetection).toBe('function');
  });

  it('useWildwoodComponent is a function', () => {
    expect(typeof useWildwoodComponent).toBe('function');
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
