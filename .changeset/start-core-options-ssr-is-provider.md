---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

`TanStackStartCoreOptions` no longer has `ssrIsProvider`: the Vite host derives it from `providerEnvironmentName` and the Rsbuild host from `rsc`, so the framework plugins stop passing it.
