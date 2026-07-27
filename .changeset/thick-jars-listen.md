---
'@tanstack/react-start-rsc': patch
---

Raise the `@vitejs/plugin-rsc` peer range to `>=0.5.30`. Versions in `0.5.20 - 0.5.29` suppress client HMR for a route component co-located with a `createServerFn`, fixed upstream in `@vitejs/plugin-rsc@0.5.30`.
