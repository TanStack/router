---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/router-devtools-core': patch
---

Rewrite match loading around a lane-based scheduler that tracks each navigation, preload, and background reload as an ordered unit of work. This fixes pending/redirect/retry state leaking between overlapping navigations, restores correct SSR status codes for redirects, errors, and not-found responses, and closes hydration gaps where the client re-ran work the server had already completed.

- Invalidation now retires matching active preloads so older speculative loader results cannot become fresh cache data after invalidation.
- Route `headers()` now only runs on the server, matching the documented behavior — it is no longer invoked during client-side asset projection.
- The documented default `gcTime` and `preloadGcTime` now match the existing runtime default of 5 minutes (`300_000`).

**Removed / changed exported internals**

- `RouterState` no longer includes `loadedAt`, `isTransitioning`, `statusCode`, or `redirect`. Use `match.updatedAt` in place of `loadedAt`; subscribe to `router.state.status` / `router.state.isLoading` in place of `isTransitioning`; server response status and redirect handling are now internal to the server loader and are no longer exposed on `router.state`.
- `RouteMatch.fetchCount` has been removed, with no replacement — it was purely informational.
- `RouteMatch.status` no longer includes `'redirected'` (it remains `'pending' | 'success' | 'error' | 'notFound'`) — redirected matches are dropped from the match list instead of being rendered.
- `RouteMatch.globalNotFound` has been renamed and privatized to the internal `_notFound` field. Use `match.status === 'notFound'` instead.
- The exported React, Solid, and Vue `Match` components now accept `routeId` instead of `matchId`.
- The exported `RouterStores` adapter contract now uses route-keyed presentation stores: `matchesId` is replaced by `ids`, `matchStores` by `byRoute`, and `getRouteMatchStore()` by `getMatchStore()`. The separate `loadedAt`, `isLoading`, `isTransitioning`, `statusCode`, and `redirect` stores have been removed, along with the pending/cache stores and their setters. `StoreConfig.init` has also been removed. Read application-facing state from `router.state`; preload and cache coordination are now internal.
- Removed `RouterCore` members `getMatch()`, `updateMatch()`, `cancelMatch()`, and `cancelMatches()` — read matches from `router.state.matches` (e.g. `router.state.matches.find((m) => m.id === id)`); there is no replacement for mutating or cancelling an individual in-flight match from outside the router.
- Removed `RouterCore.hasNotFoundMatch()` — use `router.state.matches.some((m) => m.status === 'notFound')`.
- Removed `RouterCore.looseRoutesById` — use `routesById`.
- Removed `RouterCore.isPrerendering()`, `RouterCore.isViewTransitionTypesSupported`, and `RouterCore.viewTransitionPromise`, with no replacement.
- Removed `RouterCore.getParsedLocationHref()` and `RouterCore.clearExpiredCache()`, with no replacement — expired cache entries are now reconciled automatically as part of match commit.
- Removed `RouterCore.latestLoadPromise` and `RouterCore.beforeLoad()`, with no replacement.
- `RouterCore.commitLocationPromise` and `RouterCore.pendingBuiltLocation` have been replaced by the internal `_commitPromise` and `_pendingLocation` fields.
- Removed the exported `GetMatchFn` and `UpdateMatchFn` types, along with the methods they typed.
- Removed the standalone `getMatchedRoutes()` export from `@tanstack/router-core` — use the `router.getMatchedRoutes()` instance method instead.
- `RouterCore.loadRouteChunk()` no longer accepts an array of component types as its second argument. One-argument usage is unchanged; the optional second argument is now `'errorComponent'`, `'notFoundComponent'`, or `false` for internal boundary loading.
- Removed `Redirect.redirectHandled`, which was internal redirect bookkeeping.
- `MatchRoutesOpts.preload` and `MatchRoutesOpts.dest` have been removed.
- `StartTransitionFn` is now `(fn, expected) => Promise<boolean>` (previously `(fn) => void`). This only affects custom framework adapters that implement `startTransition`.
