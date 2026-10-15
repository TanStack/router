---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a navigation's `to` and `from`, the initial record's `to`, and a server render's `RenderEvent.route.to` are the location's path, search and hash (`/users/42?tab=posts#bio`) rather than its pathname, as `@solidjs/router` gives them — its `href`, in the router's own path space, the one `name` is in (before a basepath or rewrite). A request carries no hash, so a render's `to` is the path and search. The name stays the route pattern the pathname matches. Nothing changes in production, where `OBSERVE` is undefined.
