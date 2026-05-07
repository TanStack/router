---
'@tanstack/react-start-client': minor
'@tanstack/solid-start-client': minor
'@tanstack/start-client-core': minor
'@tanstack/start-plugin-core': minor
'@tanstack/start-server-core': minor
'@tanstack/router-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

Add deferred Hydrate boundary support for TanStack Start.

Hydrate boundaries can now be code-split by the Start compiler, preload their generated client chunks, preserve server-rendered fallback HTML, and replay interaction-triggered events after hydration. The compiler integration now uses a Start-owned compiler plugin for Hydrate virtual modules across Vite and Rsbuild, with dev invalidation for generated virtual modules.

Shared AST utilities used by the router code-splitter and Hydrate virtual modules were moved into `@tanstack/router-utils` so both pipelines can retain referenced top-level declarations, unwrap local exports, and let dead-code elimination remove unused route module code.
