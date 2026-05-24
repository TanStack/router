---
'@tanstack/start-plugin-core': patch
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Fix serialization adapter module resolution in TanStack Start. Vite dev now uses clean runtime-specific virtual module IDs instead of browser requests containing encoded null-byte virtual IDs, which avoids reverse proxy failures. When no serialization adapters are configured, Vite and Rsbuild now resolve `#tanstack-start-plugin-adapters` through the package empty-adapter fallback.
