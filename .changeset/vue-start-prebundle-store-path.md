---
'@tanstack/vue-start': patch
---

fix: Vite pre-bundles `@tanstack/vue-store` for a project that depends on `@tanstack/vue-start` but not on `@tanstack/vue-router` itself. Start named the dependency by a path through `@tanstack/vue-router`, which only resolves from a project that depends on the router. In such a project Vite warned "Failed to resolve dependency: @tanstack/vue-router > @tanstack/vue-store", found the store when the router was first imported and reloaded the page.
