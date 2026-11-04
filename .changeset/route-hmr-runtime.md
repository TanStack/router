---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Add the development-only route HMR runtime used by the router plugin's output, on new `/hmr` subpaths (`@tanstack/router-core/hmr`, `@tanstack/{react,solid,vue}-router/hmr`). It updates the live route in place, keeps each split component's lazy wrapper across updates, and with Vite's bundled dev falls back to the original importer when Rolldown throws `MissingFactoryError`. An update patches only the route its module exported, so another router in the same window (module federation) is left alone (#7921). After the route tree is regenerated (a route added or renamed), updates keep reaching the route the rebuilt tree holds. In development, once a router error boundary has shown an error, later route edits reload the page, as without route HMR, so the edit that fixes the error shows (Solid and Vue: any router error boundary; React: only the global boundary, since React Refresh recovers route boundaries in place). Nothing of it reaches production bundles.
