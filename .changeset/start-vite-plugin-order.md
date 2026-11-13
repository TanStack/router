---
'@tanstack/start-plugin-core': patch
---

Vite: a Solid Start app that lists `tanstackStart()` after `vite-plugin-solid` fails with a plugin-order error again, which says to list `tanstackStart()` first (in that order Solid's dev transform runs before Start's compiler and keeps route components out of the client's code split). Start after `@vitejs/plugin-react` or `@vitejs/plugin-vue` works: those plugins transform after Start's compiler in either order.
