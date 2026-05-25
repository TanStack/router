---
'@tanstack/start-server-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Publish matching TanStack Start dev server packages so fresh installs do not pair a Start plugin that no longer provides `tanstack-start-injected-head-scripts:v` with an older Start server runtime that still imports it.
