---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting places top-level code by the bindings it reads and writes only, as before the compiler rewrite: a declaration only split code reads moves into that code's chunk whatever is written before or after it (`const Schema = z.object(…)` read by the component now moves past a `validateSearch` schema the route module keeps). What moves keeps its source order in its chunk, what stays its order in the route module, and a statement (`init()`) stays. Code that depends on another top-level call having run first without reading its result (`const app = initializeApp(config)` read only by the page, before `const auth = getAuth()` kept by the loader, or before a bare `hydrateStores()`) then runs in another order: pass the dependency (`getAuth(app)`) or move both to their own module.
