---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

React hydration no longer waits for matched routes' code-split component chunks before it commits. The loads still start in `hydrate()`. A `lazyRouteComponent` whose chunk is still downloading suspends, and React keeps the server HTML of its boundary until the chunk arrives. Routes with unmerged `lazyFn` options still hold hydration, but only until their lazy options load, not for every component chunk in the lane.

A component's `preload` is no longer awaited before the first render. A hand-written component that depends on it must suspend or handle the pending state in render.
