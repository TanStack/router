---
'@tanstack/react-start': patch
---

fix: Vite pre-bundles `@tanstack/react-store` for a project that depends on `@tanstack/react-start` but not on `@tanstack/react-router` itself. Start named the dependency by a path through `@tanstack/react-router`, which only resolves from a project that depends on the router. In such a project Vite warned "Failed to resolve dependency: @tanstack/react-router > @tanstack/react-store", and a browser failed to load the store's CommonJS dependency (`use-sync-external-store`).
