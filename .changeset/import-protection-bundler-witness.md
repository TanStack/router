---
'@tanstack/start-plugin-core': patch
---

Import protection no longer reads tsconfig to guess whether TypeScript erases an import whose bindings are only used as types: the bundler decides. Such an import of a denied module is reported (and mocked) exactly when Vite's or Rsbuild's TypeScript transform keeps it, in dev and in builds. This fixes the stock Vite template (a solution-style `tsconfig.json` with `verbatimModuleSyntax` in `tsconfig.app.json`), whose builds bundled the real server module unreported, and Rsbuild dev, which reported imports SWC erases.
