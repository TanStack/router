---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Start's manifest gives a route the chunks of its own split options and what they import, nothing else. A component a route file exports and another route, a lazy module or a `<Hydrate>` boundary imports no longer makes the importer's chunk a chunk of the exporting route: that route's page no longer preloads the importer's code or links its stylesheets (Vite, and Rsbuild with `"sideEffects": false`). A helper that two `<Hydrate>` boundaries of a route share no longer preloads the boundaries' code with the route; their CSS still links with it.
