---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Vite dev: Start no longer pre-bundles `@tanstack/<framework>-router/hmr` on its own (the router package is excluded from optimization, so the subpath is served from source with it); pre-bundling it made a cold-start re-optimization strand the first page load (504 "Outdated Optimize Dep", no hydration, no reload). The compiler's plan cache finds a changed file's plans through a path index instead of scanning every plan on every hot update.
