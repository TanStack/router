---
'@tanstack/vue-start': patch
---

Vite dev: Vue Start pre-bundles `@tanstack/vue-router > @tanstack/vue-store`, as React Start does for `@tanstack/react-store`. The first page load on a cold dependency cache no longer re-optimizes `vue` and reloads the page.
