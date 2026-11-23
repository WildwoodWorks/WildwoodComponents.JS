---
'@wildwood/react': patch
---

`@wildwood/react/styles` now carries a `types` condition (an empty `styles.d.ts` shipped beside `dist`), so `import '@wildwood/react/styles'` type-checks under TypeScript 6+, which checks side-effect imports by default. The CSS file the export resolves to for bundlers is unchanged.
