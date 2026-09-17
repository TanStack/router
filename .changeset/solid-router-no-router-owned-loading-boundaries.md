---
'@tanstack/solid-router': patch
---

Remove all router-owned `Loading` boundaries from `Matches`, `Match`, and `Outlet`, and only install one in `Await` when a `fallback` is provided. Async reads in route components are no longer caught by an invisible router boundary, so Solid's implicit transitions hold the previous view — live and interactive — until the new route settles, then swap atomically. `pendingComponent` is presented through router pending state (`pendingMs`/`pendingMinMs`) as before; loading boundaries are now exclusively user-provided.
