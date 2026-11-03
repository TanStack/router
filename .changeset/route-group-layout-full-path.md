---
'@tanstack/router-generator': patch
---

A pathless layout inside a route group (`routes/(group)/_layout.tsx`) or a route group's own layout (`routes/(group)/route.tsx`) is typed with the full path `'/'` in `FileRoutesByPath`, like the router gives it at runtime, instead of `''`. When no index route claims `/`, the layout also appears under `'/'` in `FileRoutesByFullPath` and `FileRoutesByTo`, as a pathless layout outside a group already does.

A pathless or route-group layout without child routes yet, next to the index route, no longer fails route generation with "Conflicting configuration paths were found".
