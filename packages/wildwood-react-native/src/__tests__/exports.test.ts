import { describe, it, expect } from 'vitest';

// Can't import full index (react-native not available in vitest).
// Test individual hooks that only depend on react + @wildwood/core.
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { useWildwoodComponent } from '../hooks/useWildwoodComponent';
import { useFeedback } from '../hooks/useFeedback';

// Test theme/styles (no react-native dependency)
import { defaultTheme, resolveTheme, themes } from '../styles/theme';

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
    expect(defaultTheme.primary).toBeDefined();
    expect(defaultTheme.textPrimary).toBeDefined();
    expect(defaultTheme.borderRadius).toBeTypeOf('number');
  });

  it('themes contains the built-in themes the web names', () => {
    expect(themes).toBeDefined();
    expect(Object.keys(themes)).toEqual(
      expect.arrayContaining(['woodland-warm', 'cool-blue', 'fall-colors']),
    );
  });

  it('resolveTheme layers a partial over the default rather than replacing it', () => {
    const resolved = resolveTheme({ primary: '#0b1f3a' });
    expect(resolved.primary).toBe('#0b1f3a');
    // Every other token survives — the point of mirroring how :root overrides behave on the web.
    expect(resolved.textPrimary).toBe(defaultTheme.textPrimary);
    expect(resolved.borderRadius).toBe(defaultTheme.borderRadius);
  });

  it('resolveTheme accepts a built-in theme name', () => {
    expect(resolveTheme('cool-blue').primary).toBe('#3B7EA1');
    expect(resolveTheme('fall-colors').primary).toBe('#B8452A');
    expect(resolveTheme(undefined)).toEqual(defaultTheme);
  });

  it('resolveTheme falls back to the default for an unknown name', () => {
    // core's ThemeName widens to `string`, so a typo typechecks — it must not silently produce a
    // half-applied theme.
    expect(resolveTheme('no-such-theme')).toEqual(defaultTheme);
  });

  it('the variant themes keep a readable muted text on light surfaces', () => {
    // The web sets --ww-text-muted light in these themes because they recolour its DARK chrome.
    // React Native uses textMuted on the white bgPrimary, so carrying that over would render
    // secondary text at ~1.4:1. The variants must inherit the default's dark muted instead.
    for (const name of ['cool-blue', 'fall-colors']) {
      expect(resolveTheme(name).textMuted).toBe(defaultTheme.textMuted);
    }
  });
});
