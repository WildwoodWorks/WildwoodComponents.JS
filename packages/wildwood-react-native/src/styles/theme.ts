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
 * HOW TO OVERRIDE:
 *   <WildwoodProvider config={config} theme={{ primary: '#0b1f3a', accent: '#c9a227' }}>
 * or pick a built-in by name:
 *   <WildwoodProvider config={config} theme="cool-blue">
 *
 * Gradients are the one web token with no React Native equivalent without an extra dependency
 * (react-native-linear-gradient / expo-linear-gradient), so `--ww-gradient-*` is intentionally
 * absent; components use the flat `primary`/`primaryDark` pair those gradients interpolate.
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
  textMuted: '#B8D4E8',
  textDark: '#2D3A42',
  borderAccent: '#6BA3C7',
  focusBorder: '#6BA3C7',
  focusRing: 'rgba(59, 126, 161, 0.25)',
  hoverBg: 'rgba(107, 163, 199, 0.2)',
};

/* ========================================
   FALL COLORS THEME
   ======================================== */
export const fallColors: Partial<WildwoodTheme> = {
  primary: '#C1440E',
  primaryDark: '#8B3103',
  primaryLight: '#E85D24',
  accent: '#E8A33C',
  accentLight: '#F5C77E',
  accentHover: '#F5B041',
  bgDark: '#3E2723',
  bgMedium: '#4E342E',
  bgLight: '#5D4037',
  loginOverlay: 'rgba(62, 39, 35, 0.8)',
  loginCardBg: 'rgba(78, 52, 46, 0.95)',
  loginCardBorder: 'rgba(232, 163, 60, 0.5)',
  textLight: '#FFF3E0',
  textMuted: '#D7CCC8',
  textDark: '#3E2723',
  borderAccent: '#E8A33C',
  focusBorder: '#E8A33C',
  focusRing: 'rgba(193, 68, 14, 0.25)',
  hoverBg: 'rgba(232, 163, 60, 0.2)',
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
  const overrides = typeof theme === 'string' ? (themes[theme] ?? {}) : theme;
  return { ...defaultTheme, ...overrides };
}
