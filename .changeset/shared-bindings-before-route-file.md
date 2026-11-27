---
'@tanstack/router-plugin': patch
---

Work out a route's shared bindings when a split chunk (`?tsr-split=`) or the shared module (`?tsr-shared=1`) compiles before the route file, as when the route file's output comes from a cache. Before, the chunk declared its own copy of the shared bindings and the shared module was left as the untouched route file.
