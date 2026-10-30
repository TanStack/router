---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Hydration no longer waits for matched routes' code-split component chunks before it commits, in React, Solid and Vue. The loads still start in `hydrate()`. A `lazyRouteComponent` whose chunk is still downloading keeps the server HTML and hydrates once the chunk arrives. Routes with unmerged `lazyFn` options still hold hydration, but only until their lazy options load, not for every component chunk in the lane.

A component's `preload` is no longer awaited before the first render. A hand-written component that depends on it must suspend or handle the pending state in render.

Solid: a pending `lazyRouteComponent` no longer adds a component level, which shifted the hydration keys.

Vue: `lazyRouteComponent` renders a `defineAsyncComponent` while its chunk downloads, instead of an empty `<div>`. Two behavior changes follow: a missing module whose one reload was already attempted now reaches the route's error boundary instead of leaving an empty `<div>` forever, and an app that did not already use `defineAsyncComponent` now bundles it (about +0.8 kB gzip).
