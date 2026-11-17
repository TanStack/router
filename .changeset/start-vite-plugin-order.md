---
'@tanstack/start-plugin-core': patch
---

Vite: `tanstackStart()` may be listed before or after `@vitejs/plugin-react`, which transforms after Start's compiler in either order. Listing it after `react()` failed with a plugin-order error. Solid still needs `tanstackStart()` before `vite-plugin-solid` and fails with a plugin-order error otherwise.
