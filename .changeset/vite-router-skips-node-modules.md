---
'@tanstack/router-plugin': patch
---

Vite: the router plugin no longer passes dependency modules (`node_modules`) through its transform. Vite and Rolldown leave them out natively, as the webpack and Rspack loader rule already did, so a build no longer hands every dependency's source to the plugin only to leave it unchanged (LibrePhotos: 9,763 of 10,950 calls, for 107 route files), which lowers build peak memory. A route file under `node_modules` (a `physical()` mount of an installed package, a routes package resolved with `resolve.preserveSymlinks`) isn't code-split, and the build or dev server warns once per file, as on webpack and Rspack. A routes package of a pnpm or Yarn workspace resolves to its real path outside `node_modules` and is split as before. `tanStackRouterCodeSplitter()` returns an array of plugins.
