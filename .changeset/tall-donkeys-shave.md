---
'@wildwood/react-native': major
---

Components are themeable, using the same token vocabulary as the web package.

`WildwoodProvider` accepts `theme` — a built-in name (`'woodland-warm'`, `'cool-blue'`,
`'fall-colors'`) or a partial token override that layers over the default, exactly as redefining a
subset of `--ww-*` on `:root` does on the web. Omit it and the provider follows `ThemeService`, so a
stored preference applies on launch and `useTheme().setTheme(name)` restyles live. Components read
the active theme with the new `useWildwoodTheme()` hook.

`AuthenticationComponent`, `AppTierComponent`, `UsageDashboardComponent` and `DisclaimerComponent`
are converted; the remaining components still hardcode their colours.

**Breaking changes**

- `WildwoodTheme` is a flat set of semantic tokens mirroring the web's CSS variables
  (`--ww-primary-dark` → `primaryDark`), replacing the nested `colors` / `spacing` / `borderRadius` /
  `fontSize` groups. `defaultTheme.colors.primary` becomes `defaultTheme.primary`; `spacing` and
  `fontSize` are removed with no replacement. Nothing in the package consumed the old shape, so this
  affects only code that imported `defaultTheme` or `themes` directly.
- `themes` now exposes `'cool-blue'` and `'fall-colors'`, matching the web's `[data-theme]` names,
  and no longer exposes `'midnight-dark'`, which had no web counterpart. An unrecognised name warns
  in dev and resolves to the default.
- Filled primary surfaces and primary-coloured text now paint from `primaryDark` rather than
  `primary`. `--ww-gradient-*` has no React Native equivalent, so components use the end those
  gradients darken toward; it also fixes a contrast failure, since the default theme's `primary`
  carries white at 2.85:1 against `primaryDark`'s 3.85:1.
