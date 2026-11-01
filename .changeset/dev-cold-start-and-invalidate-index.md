---
'@tanstack/start-plugin-core': patch
'@tanstack/vue-start': patch
'@tanstack/router-utils': patch
---

Vite dev: Start no longer pre-bundles `@tanstack/<framework>-router/hmr` on its own (the router package is excluded from optimization, so the subpath is served from source with it); pre-bundling it made a cold-start re-optimization strand the first page load (504 "Outdated Optimize Dep", no hydration, no reload). Vue Start declares `@tanstack/vue-router > @tanstack/vue-store` for the optimizer, like React Start does for `@tanstack/react-store`, so a cold start no longer reloads the page once. The compiler's plan cache finds a changed file's plans through a path index instead of scanning every plan on every hot update.
