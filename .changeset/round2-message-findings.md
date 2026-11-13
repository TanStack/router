---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Four diagnostics now state their true cause and position:

- Code splitting: a declaration whose initialiser changes a binding the route module keeps (`const idx = hits.push('x')`, also in a template literal or an enum member), read only by split code, stays in the route module with that change; it now warns at the declaration, as a function call making the change already did, and offers the fix that works: make the change a statement of its own and declare the binding without it.
- Import protection: a `require()` of a denied file is reported at the call (`Imported by: src/entry.ts:3:27, through require("./db.server")`), with a code frame and the fixes of a plain import, instead of as "an import another plugin's transform added". `import.meta.glob`, `import.meta.webpackContext` and `require.context` written through a TypeScript assertion (`(import.meta as any).webpackContext(…)`) are named as the pattern imports they are.
- Import protection: an importer in a Vue single-file component is reported at its line and column in the SFC, with the SFC in the code frame and in `onViolation`'s `importerLoc`, also in a production build without source maps (it reported the compiled script's coordinates).
- Route generation: when the generator repairs a route's constructor (`createLazyFileRoute` in a route file) whose id is not a string literal, the id warning is printed once, at its position in the repaired file (a Vite build printed it twice, the first time at the column from before the repair).
