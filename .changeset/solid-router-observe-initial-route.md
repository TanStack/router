---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): the router declares the route the document arrived on, with the same `OBSERVE.attribution.withOrigin` call it makes for every navigation, around the work in `RouterProvider` that establishes its initial match (`initial: true` on the ref), on both sides. On the client this is the first `"navigation"` record (`initial: true`, `at` the document's navigation start, no write to wait for), kept out of `feedback().navigations`; on the server the same declaration names the request's `"render"` record (`RenderEvent.route`: the matched route's `fullPath`, the path and search, the params), read when the render settles, so a render whose provider ran the load names the location it resolved. A consumer naming page loads and requests by route (`/users/$id` rather than one name per user) had this for every navigation but the first; now it has the first too.

The Transitioner committing the canonical form of the arrival location (search defaults, trailing slash) is part of the arrival, not a navigation: a router loaded before it mounted no longer records it as one, and the next navigation is dated from its own request rather than from that commit. Nothing changes in production, where `OBSERVE` is undefined.
