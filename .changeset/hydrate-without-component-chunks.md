---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

React hydration no longer waits for every matched route's code-split component chunk before it commits. A `lazyRouteComponent` that is still downloading suspends, and React keeps the server HTML of its boundary until the chunk arrives. Routes with unmerged `lazyFn` options still wait. Solid and Vue keep the previous behavior.
