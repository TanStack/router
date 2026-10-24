---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Add a development-only route HMR runtime for the router plugin's output: `__tsrRouteHmr` updates the live route in place, keeps the lazy route component wrapper of each component option across updates, re-imports its chunk on every update and decides when the import completes whether the framework's refresh runtime keeps the held component or the wrapper swaps to the new one. None of it reaches production bundles.
