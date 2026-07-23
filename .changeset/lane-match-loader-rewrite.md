---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Rewrite match loading around a lane-based scheduler that tracks each navigation, preload, and background reload as an ordered unit of work. This fixes pending/redirect/retry state leaking between overlapping navigations, restores correct SSR status codes for redirects, errors, and not-found responses, and closes hydration gaps where the client re-ran work the server had already completed.

- Route `headers()` now only runs on the server, matching the documented behavior — it is no longer invoked during client-side asset projection.
- Default `gcTime` and `preloadGcTime` are reduced from 30 minutes (`1_800_000`) to 5 minutes (`300_000`).

**Removed / changed public API**

- `RouterState` no longer includes `loadedAt`, `isTransitioning`, `statusCode`, or `redirect`. Use `match.updatedAt` in place of `loadedAt`; subscribe to `router.state.status` / `router.state.isLoading` in place of `isTransitioning`; server response status and redirect handling are now internal to the server loader and are no longer exposed on `router.state`.
- `RouteMatch.fetchCount` has been removed, with no replacement — it was purely informational.
- `RouteMatch.status` no longer includes `'redirected'` (it remains `'pending' | 'success' | 'error' | 'notFound'`) — redirected matches are dropped from the match list instead of being rendered.
- `RouteMatch.globalNotFound` has been renamed and privatized to the internal `_notFound` field. Use `match.status === 'notFound'` instead.
- Removed `RouterCore` members `getMatch()`, `updateMatch()`, `cancelMatch()`, and `cancelMatches()` — read matches from `router.state.matches` (e.g. `router.state.matches.find((m) => m.id === id)`); there is no replacement for mutating or cancelling an individual in-flight match from outside the router.
- Removed `hasNotFoundMatch()` — use `router.state.matches.some((m) => m.status === 'notFound')`.
- Removed `looseRoutesById` — use `routesById`.
- Removed `isPrerendering()`, `isViewTransitionTypesSupported`, and `viewTransitionPromise`, with no replacement.
- Removed `getParsedLocationHref()` and `clearExpiredCache()`, with no replacement — expired cache entries are now reconciled automatically as part of match commit.
- Removed `latestLoadPromise` and `beforeLoad()`, with no replacement.
- `commitLocationPromise` and `pendingBuiltLocation` are now private (`_commitPromise`, `_pendingLocation`) and no longer part of the public `RouterCore` surface.
- Removed the exported `GetMatchFn` and `UpdateMatchFn` types, along with the methods they typed.
- Removed the standalone `getMatchedRoutes()` export from `@tanstack/router-core` — use the `router.getMatchedRoutes()` instance method instead.
- `MatchRoutesOpts.preload` and `MatchRoutesOpts.dest` have been removed.
- `StartTransitionFn` is now `(fn, expected, urgent?) => Promise<boolean>` (previously `(fn) => void`). This only affects custom framework adapters that implement `startTransition`.
