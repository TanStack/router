---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Compiler fixes from the pin sweep: a `<Hydrate>` after server-only code the client removes keeps its imports; a marker import (`@tanstack/react-start/server-only`) is no evaluation edge, so an unused re-export of a marked module no longer fails an Rsbuild build; Start's Rsbuild client manifest lists only the chunks a route loads (#8780); the Vite host leaves a module it cannot parse as an ES module (a CommonJS dependency with a top-level `return`) to the bundler; Rolldown's chunking hint about the server-fn resolver's lazy imports is no longer printed; on webpack-style hosts an edit of a split route option other than a component (`loader`, …) reaches the open page (the chunk asks the live route to refresh through a dev-only helper of the framework routers).
