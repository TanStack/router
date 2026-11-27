---
'@tanstack/react-router': patch
---

fix: `lazyRouteComponent` calls React's `use()` on every render, so React 19.3 no longer logs "This library called use() to suspend in a previous render but did not call use() when it finished" after a lazy component's chunk arrives. A chunk that is already loaded still renders without suspending.
