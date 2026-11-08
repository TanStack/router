---
'@tanstack/start-plugin-core': patch
---

Vite: where an app lists `tanstackStart()` among its plugins no longer matters. Start's compiler reads each module before the framework plugins' own `pre` transforms, so Start listed after `vite-plugin-solid` splits routes in the dev client as in SSR (before, Solid's hot-update wrapper kept every route component in the route module in dev: a hydration mismatch, route edits reloading the page). Start after `@vitejs/plugin-react` or `@vitejs/plugin-vue` works too, where the router plugin's order check refused it before.
