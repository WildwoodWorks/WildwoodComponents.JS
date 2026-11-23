// Types for `import '@wildwood/react/styles'` — a side-effect import of the theme CSS through a bare
// specifier. TypeScript 6+ checks side-effect imports by default (noUncheckedSideEffectImports), and a
// bundler's `*.css` ambient declaration cannot match a bare specifier, so the `./styles` export
// carries a `types` condition pointing here. Bundlers resolve the `default` condition, the CSS file.
export {};
