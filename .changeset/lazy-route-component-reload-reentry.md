---
'@tanstack/react-router': patch
---

`lazyRouteComponent` no longer flashes the error component while it is reloading after a stale-chunk failure. `window.location.reload()` is asynchronous, so renders can still happen before the document goes away; those renders re-read the `sessionStorage` guard, found it already set, and fell through to `throw error`. The reload request is now remembered in the closure and later renders keep suspending. The `sessionStorage` guard is unchanged, so a chunk that is missing for any reason other than a new deployment still surfaces its error on the next page load instead of reloading in a loop.
