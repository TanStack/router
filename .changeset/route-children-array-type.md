---
'@tanstack/router-core': patch
---

`route.children` is now typed as the array it holds at runtime. Children passed to `addChildren` or `_addFileChildren` as an object (as the generated route tree does) used to be typed as that object, so `routeTree.children` showed the child route names as keys instead of array methods.
