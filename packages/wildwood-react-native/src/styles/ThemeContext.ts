import { createContext, useContext } from 'react';
import { defaultTheme, type WildwoodTheme } from './theme';

/* React Native has no CSS cascade, so the token set the web exposes as `--ww-*` variables on
 * `:root` travels through context instead. WildwoodProvider seeds it; components read it.
 *
 * Defaulted rather than left undefined so a component rendered outside the provider still styles
 * itself instead of throwing — the same graceful degradation the web gets from the CSS fallback
 * values, and it keeps the component usable in tests and Storybook without a wrapper.
 */
export const ThemeContext = createContext<WildwoodTheme>(defaultTheme);

/** The active theme. Falls back to the default outside a WildwoodProvider. */
export function useWildwoodTheme(): WildwoodTheme {
  return useContext(ThemeContext);
}
