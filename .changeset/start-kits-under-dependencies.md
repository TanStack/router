---
'@tanstack/start-plugin-core': patch
---

Vite: a package that lists Start under `dependencies` (instead of `peerDependencies`) is now bundled on the server and compiled, like a peer-dependent one. Before, it stayed external in the SSR environment: its server functions threw `Cannot read properties of undefined (reading 'id')` and client calls answered 500. Start's own packages are not crawled this way. Such a kit is now also excluded from Vite's dependency optimizer, like a peer-dependent kit, so `vite dev` serves it unbundled: if it or its dependencies are CommonJS, add those to `optimizeDeps.include` (`'kit > dependency'` for a nested one).
