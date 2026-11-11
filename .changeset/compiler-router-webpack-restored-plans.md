---
'@tanstack/router-plugin': patch
---

Router plugin on webpack and Rspack with the bundler's persistent cache (webpack's `filesystem` cache, Rspack's `persistent` cache, Rsbuild's `buildCache`): a route module restored from the cache is built again when its route changed since (a virtual route config that mounts the file elsewhere while no dev server or build ran), and a route-list change right after a start from the cache rebuilds the route module, as it does after a cold start. Route modules carry their plan in the cache for this; a start from the cache with nothing changed builds no route module again.
