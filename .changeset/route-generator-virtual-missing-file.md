---
'@tanstack/router-generator': patch
---

A route file named by a virtual route config (`virtualRouteConfig` or a `__virtual.ts` subtree) that does not exist fails the run naming the file, as before the rewrite, instead of dropping the route and moving its children to the root. In dev and watch mode the error is printed and the last good route tree is kept. A batch that fails while writing route files or the route tree no longer leaves the generator's tree model (which Start's client route tree is printed from) ahead of the published tree.
