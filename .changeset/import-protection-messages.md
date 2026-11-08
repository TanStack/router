---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Import protection reports say where a violation is and give a fix that works: a browser-only component rendered on the server suggests `<ClientOnly>` (from how the import is used, also in Solid; Vue SFCs get the `defineAsyncComponent(createClientOnlyFn(() => import(...)))` form), a pattern import names the matching `import.meta.glob` call and suggests a negative pattern, traces start at the app's own files, a marker conflict points at the second marker, Vite builds report every violation, and Rsbuild dev failures are located without the loader's stack. The mock runtime reports each mocked import once.
