---
'@tanstack/router-core': patch
---

Route HMR under Vite's bundled dev mode: when re-importing a route's split component fails with Rolldown's `MissingFactoryError` (the chunk never loaded on the page), the lazy wrapper loads it through the importer it was created with. Development only.
