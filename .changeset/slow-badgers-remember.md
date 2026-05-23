---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Fix Rsbuild server function metadata replay when Rspack restores modules from its persistent cache.

Server function metadata is now stored on Rspack module build info and replayed from cached modules before resolver modules are rebuilt, preventing warm restarts from losing server function registrations.
