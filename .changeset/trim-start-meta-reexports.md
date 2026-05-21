---
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Explicitly re-export public API names from `@tanstack/start-client-core` (`createServerFn`, `createMiddleware`, `createStart`, `createCsrfMiddleware`, `createIsomorphicFn`, `createClientOnlyFn`, `createServerOnlyFn`) alongside the existing `export *`. The explicit named re-exports are registered at link time (via Vite SSR's `defineExport` at `fileStartIndex`), so the namespace has these getters before any import body runs — survives the cold-start SSR cycle through user middleware where `export *` would otherwise produce a partial facade (`createMiddleware is not a function`). Workaround for vitejs/vite#22491 / #22493.
