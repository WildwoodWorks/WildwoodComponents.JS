import type { ThemeName } from '@wildwood/core';

/* WildwoodComponents React Native theme.
 *
 * The token vocabulary mirrors the web package's CSS custom properties
 * (packages/wildwood-react/src/styles/wildwood-themes.css) one-for-one, camelCased:
 * `--ww-primary-dark` here is `primaryDark`. That is deliberate — an app that has already
 * themed the web SDK by redefining `--ww-*` on `:root` can port the same palette to React
 * Native by name, and the two clients cannot drift into different vocabularies.
 *
 * React Native has no cascade, so where the web lets a consumer override variables on `:root`
 * and every component inherits, here the tokens travel through context: pass `theme` to
 * WildwoodProvider and components read it with `useWildwoodTheme()`.
 *
 * HOW TO OVERRIDE — hoist the object, do not inline it. An object literal in JSX is a new identity
 * on every render, which defeats the provider's memoisation and rebuilds every component's
 * StyleSheet each time the parent re-renders:
 *   const appTheme = { primary: '#0b1f3a', accent: '#c9a227' };   // module scope
 *   <WildwoodProvider config={config} theme={appTheme}>
 * or pick a built-in by name (a string is stable, so inlining that is fine):
 *   <WildwoodProvider config={config} theme="cool-blue">
 *
 * Gradients are the one web token with no React Native equivalent without an extra dependency
 * (react-native-linear-gradient / expo-linear-gradient), so `--ww-gradient-*` is intentionally
 * absent. Components use `primaryDark` — the end those gradients darken toward — wherever the web
 * would have painted `--ww-gradient-button`, i.e. filled primary surfaces and primary-coloured
 * text on a light background. That is a contrast decision as much as a fidelity one: the default
 * theme's `primary` (#D4882C) carries white at only 2.85:1, below even the 3:1 large-text floor,
 * where `primaryDark` (#B8720F) reaches 3.85:1. `primary` itself is still used for borders and
 * accents, where it is not carrying text.
 *
 * A theme whose ramp runs the other way (a very dark `primary` with a lighter `primaryDark`) will
 * therefore paint buttons in the LIGHTER of the two — order the ramp dark-to-light as the token
 * names say.
 */

export interface WildwoodTheme {
  /* Brand */
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  accentHover: string;

  /* Status */
  success: string;
  successLight: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;

  /* Status surfaces (the web's --ww-*-bg / --ww-*-text pairs) */
  successBg: string;
  successText: string;
  dangerBg: string;
  dangerText: string;
  warningBg: string;
  warningText: string;
  infoBg: string;
  infoText: string;

  /* Surfaces */
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgDark: string;
  bgMedium: string;
  bgLight: string;
  inputBg: string;
  hoverBg: string;
  cardFooterBg: string;
  cardFooterBorder: string;

  /* Login surfaces */
  loginOverlay: string;
  loginCardBg: string;
  loginCardBorder: string;

  /* Text */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textLight: string;
  textDark: string;
  textInverse: string;
  btnPrimaryText: string;
  btnSuccessText: string;

  /* Lines and focus */
  borderColor: string;
  borderAccent: string;
  borderSubtle: string;
  borderLight: string;
  focusRing: string;
  focusBorder: string;

  /* Shape. Numbers, not CSS lengths — React Native has no rem. */
  borderRadius: number;
  borderRadiusSm: number;
  borderRadiusLg: number;
}

/* ========================================
   WOODLAND WARM THEME (Default)
   ======================================== */
export const woodlandWarm: WildwoodTheme = {
  primary: '#D4882C',
  primaryDark: '#B8720F',
  primaryLight: '#E8A33C',
  accent: '#D4A853',
  accentLight: '#F5D78E',
  accentHover: '#F5B041',

  success: '#28a745',
  successLight: '#48c774',
  danger: '#dc3545',
  dangerLight: '#f14668',
  warning: '#ffc107',
  warningLight: '#ffdd57',
  info: '#17a2b8',
  infoLight: '#3298dc',

  successBg: 'rgba(40, 167, 69, 0.15)',
  successText: '#0f5132',
  dangerBg: 'rgba(220, 53, 69, 0.15)',
  dangerText: '#842029',
  warningBg: 'rgba(255, 193, 7, 0.15)',
  warningText: '#664d03',
  infoBg: 'rgba(23, 162, 184, 0.15)',
  infoText: '#055160',

  bgPrimary: '#ffffff',
  bgSecondary: '#f8f9fa',
  bgTertiary: '#e9ecef',
  bgDark: '#4A3F2F',
  bgMedium: '#5D4E37',
  bgLight: '#6B5B45',
  inputBg: '#ffffff',
  hoverBg: 'rgba(232, 163, 60, 0.2)',
  cardFooterBg: '#FFF8E7',
  cardFooterBorder: '#E8DCC8',

  loginOverlay: 'rgba(74, 63, 47, 0.75)',
  loginCardBg: 'rgba(93, 78, 55, 0.95)',
  loginCardBorder: 'rgba(212, 168, 83, 0.5)',

  textPrimary: '#212529',
  textSecondary: '#6c757d',
  textMuted: '#6c757d',
  textLight: '#FFF8E7',
  textDark: '#4A3F2F',
  textInverse: '#ffffff',
  btnPrimaryText: '#ffffff',
  btnSuccessText: '#ffffff',

  borderColor: '#dee2e6',
  borderAccent: '#D4A853',
  borderSubtle: 'rgba(255, 200, 100, 0.15)',
  borderLight: 'rgba(0, 0, 0, 0.125)',
  focusRing: 'rgba(212, 136, 44, 0.25)',
  focusBorder: '#D4A853',

  borderRadius: 6,
  borderRadiusSm: 4,
  borderRadiusLg: 8,
};

/* ========================================
   COOL BLUE THEME
   ======================================== */
/* Copied token-for-token from [data-theme="cool-blue"] in the web package's
   wildwood-themes.css, with two documented departures:

   - `--ww-text-muted` is NOT carried over. On the web these variant themes recolour the DARK
     chrome (sidebar, login card), so muted text there is light-on-dark (#B8D4E8). React Native's
     components have no such chrome — they use `textMuted` for secondary text on the white
     `bgPrimary`, where a light value renders at roughly 1.4:1 and disappears. The default's dark
     muted is kept instead. `--ww-text-light` IS carried, because that token means light-on-dark in
     both clients.
   - `--ww-focus-shadow` maps onto `focusRing`: this token set has no separate shadow colour, and
     the two are the same translucent ring. */
export const coolBlue: Partial<WildwoodTheme> = {
  primary: '#3B7EA1',
  primaryDark: '#2C5F7A',
  primaryLight: '#5A9BBF',
  accent: '#6BA3C7',
  accentLight: '#A3CAE0',
  accentHover: '#7BB5D9',
  bgDark: '#2D3A42',
  bgMedium: '#3A4A55',
  bgLight: '#4A5C68',
  loginOverlay: 'rgba(45, 58, 66, 0.8)',
  loginCardBg: 'rgba(58, 74, 85, 0.95)',
  loginCardBorder: 'rgba(107, 163, 199, 0.5)',
  textLight: '#E8F4FA',
  textDark: '#2D3A42',
  borderAccent: '#6BA3C7',
  borderSubtle: 'rgba(107, 163, 199, 0.2)',
  hoverBg: 'rgba(59, 126, 161, 0.2)',
  cardFooterBg: '#E8F4FA',
  cardFooterBorder: '#B8D4E8',
  focusBorder: '#6BA3C7',
  focusRing: 'rgba(107, 163, 199, 0.25)',
};

/* ========================================
   FALL COLORS THEME
   ======================================== */
/* Copied token-for-token from [data-theme="fall-colors"], with the same two departures as
   cool-blue above (`--ww-text-muted` omitted, `--ww-focus-shadow` mapped onto `focusRing`). */
export const fallColors: Partial<WildwoodTheme> = {
  primary: '#B8452A',
  primaryDark: '#8B3420',
  primaryLight: '#D4613D',
  accent: '#D97B3D',
  accentLight: '#F5C16E',
  accentHover: '#E89849',
  bgDark: '#4A2E2A',
  bgMedium: '#5D3B35',
  bgLight: '#6B4A42',
  loginOverlay: 'rgba(74, 46, 42, 0.78)',
  loginCardBg: 'rgba(93, 59, 53, 0.95)',
  loginCardBorder: 'rgba(217, 123, 61, 0.5)',
  textLight: '#FFF5E8',
  textDark: '#4A2E2A',
  borderAccent: '#D97B3D',
  borderSubtle: 'rgba(245, 193, 110, 0.18)',
  hoverBg: 'rgba(217, 123, 61, 0.22)',
  cardFooterBg: '#FFF5E8',
  cardFooterBorder: '#E8D8C8',
  focusBorder: '#D97B3D',
  focusRing: 'rgba(217, 123, 61, 0.28)',
};

/** The theme applied when a consumer supplies none — matches the web's `:root` defaults. */
export const defaultTheme: WildwoodTheme = woodlandWarm;

/* Built-in themes, keyed by the same names the web uses in `[data-theme="…"]`.
   `ThemeName` is @wildwood/core's — the platform already names these three, and defining a second
   copy here would let the two drift and would collide on re-export. */
export const themes: Record<string, Partial<WildwoodTheme>> = {
  'woodland-warm': {},
  'cool-blue': coolBlue,
  'fall-colors': fallColors,
};

/**
 * Resolve whatever a consumer passed into a complete theme.
 *
 * A partial override is layered over the DEFAULT rather than replacing it, mirroring the CSS,
 * where redefining `--ww-primary` on `:root` leaves every other variable intact. A built-in name
 * resolves to that theme's partial, layered the same way.
 */
export function resolveTheme(theme?: ThemeName | Partial<WildwoodTheme>): WildwoodTheme {
  if (!theme) return defaultTheme;
  if (typeof theme !== 'string') return { ...defaultTheme, ...theme };

  const overrides = themes[theme];
  if (!overrides) {
    /* core's ThemeName widens to `string`, so a typo or a retired name typechecks and would
       otherwise resolve to the default with nothing to show for it. */
    // Guarded: __DEV__ is a React Native global and is absent under Node (tests, SSR).
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        `[wildwood] Unknown theme "${theme}". Known themes: ${Object.keys(themes).join(', ')}. ` +
          'Falling back to the default.',
      );
    }
    return defaultTheme;
  }
  return { ...defaultTheme, ...overrides };
}
