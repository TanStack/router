---
'@tanstack/solid-router': patch
---

Suspend on the match `loadPromise` only during SSR. On the client, suspending on the pending match kept a live async source in the tree, which since `solid-js@2.0.0-beta.16` routed signal writes into a transition hold and broke synchronous write-then-load flows such as `invalidate()` on a `notFound` match.
