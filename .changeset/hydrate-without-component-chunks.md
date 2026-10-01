---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

React hydration no longer waits for matched routes' code-split component chunks before it commits. The loads still start in `hydrate()`. A `lazyRouteComponent` whose chunk is still downloading suspends, and React keeps the server HTML of its boundary until the chunk arrives. Routes with unmerged `lazyFn` options still hold hydration, but only until their lazy options load, not for every component chunk in the lane.

A component's `preload` is no longer awaited before the first render. A hand-written component that depends on it must suspend or handle the pending state in render.

Solid hydration does the same. A pending `lazyRouteComponent` no longer adds a component level, which shifted the hydration keys, so Solid's `lazy` keeps the server DOM until the chunk arrives.

Vue hydration does the same. `lazyRouteComponent` renders a `defineAsyncComponent` while its chunk downloads, instead of an empty `<div>`, and Vue hydrates it once the chunk arrives. Two behavior changes follow: a missing module whose one reload was already attempted now reaches the route's error boundary instead of leaving an empty `<div>` forever, and an app that did not already use `defineAsyncComponent` now bundles it (about +0.8 kB gzip).
