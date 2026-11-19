---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a navigation's record names a not-found by its pathname instead of the route above it, so `/nope` no longer files under `/` beside the home page, and its `params` are the strings the path bound rather than the values `params.parse` returned, as Solid's `NavigationRef` declares them. Nothing changes in production, where `OBSERVE` is undefined.
