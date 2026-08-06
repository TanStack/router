---
'@tanstack/react-router': patch
---

Stop persisted route matches from re-rendering on every navigation. `Match` subscribed to its match store by identity, and `buildMatches` re-mints every staying match on every navigation, so each mounted route re-rendered its `MatchView`/`Suspense`/`CatchBoundary`/`CatchNotFound`/`MatchInner` chain even when nothing it renders had changed. `Match` now selects only the fields its subtree renders, and the per-navigation identity that resets `CatchBoundary` is observed in a wrapper that is only mounted for routes that actually have an `errorComponent`.
