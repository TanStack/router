# @tanstack/vue-router

## 1.170.29

### Patch Changes

- [#8132](https://github.com/TanStack/router/pull/8132) [`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c) - Build client preload locations on demand and remove the prebuilt-location argument used by framework links.

- [#8130](https://github.com/TanStack/router/pull/8130) [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b) - preserve context during reloads

- Updated dependencies [[`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c), [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b)]:
  - @tanstack/router-core@1.171.27

## 1.170.28

### Patch Changes

- Updated dependencies [[`3e016ac`](https://github.com/TanStack/router/commit/3e016ac84ffec8119f0c25cfdd1fb17e5292bd34)]:
  - @tanstack/router-core@1.171.26

## 1.170.27

### Patch Changes

- [#8084](https://github.com/TanStack/router/pull/8084) [`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175) - preserve pending UI across retained routes

- Updated dependencies [[`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175), [`63d2cc9`](https://github.com/TanStack/router/commit/63d2cc9155ff5374112f7d067d0b278bafeb8486)]:
  - @tanstack/router-core@1.171.25

## 1.170.26

### Patch Changes

- [#8073](https://github.com/TanStack/router/pull/8073) [`0fdf9ff`](https://github.com/TanStack/router/commit/0fdf9ff16fc532de9fc131d18df167ebd8038720) - inline isCtrlKey inside Link component for byte shaving

- Updated dependencies [[`4c89b15`](https://github.com/TanStack/router/commit/4c89b15dd2b46491ee5e57985559bae8e31d62c2), [`cf6ab17`](https://github.com/TanStack/router/commit/cf6ab178b39e7628bf784759f384e0f4230e6d9e), [`bdaf73a`](https://github.com/TanStack/router/commit/bdaf73a4063ee2b02e3c9cc105ad10ce82a5a0ff)]:
  - @tanstack/router-core@1.171.24

## 1.170.25

### Patch Changes

- [#8054](https://github.com/TanStack/router/pull/8054) [`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90) - Reuse resolved lazy route components when revisiting code-split routes, preventing unnecessary pending UI.

- [#8002](https://github.com/TanStack/router/pull/8002) [`3848503`](https://github.com/TanStack/router/commit/38485038c52ff898777cabeeeb2eaaa29c93f789) - Keep active route components mounted by default when route params change.

- Updated dependencies [[`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90)]:
  - @tanstack/router-core@1.171.23

## 1.170.24

### Patch Changes

- [#8045](https://github.com/TanStack/router/pull/8045) [`f500760`](https://github.com/TanStack/router/commit/f5007607d62e932b8df19de866cdc6bddcff8db3) - Warn when an Outlet is rendered inside a pending, error, or not-found component.

- [#8043](https://github.com/TanStack/router/pull/8043) [`1aafca9`](https://github.com/TanStack/router/commit/1aafca9b45d24f8f0dba78e716fc9582346c6ca1) - remove the undocumented Link `isTransitioning` state and `data-transitioning` attribute

- [#8044](https://github.com/TanStack/router/pull/8044) [`aa10b65`](https://github.com/TanStack/router/commit/aa10b6589eeda215f5a60ea0af95a3101d8c414e) - Apply `preloadDelay` to viewport link preloading and cancel pending preloads when links leave the viewport.

- Updated dependencies [[`7e93431`](https://github.com/TanStack/router/commit/7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13)]:
  - @tanstack/router-core@1.171.22

## 1.170.23

### Patch Changes

- Updated dependencies [[`51138a8`](https://github.com/TanStack/router/commit/51138a824cea053738f125c4c95073bd6286ff05)]:
  - @tanstack/router-core@1.171.21

## 1.170.22

### Patch Changes

- Updated dependencies [[`44a8c3e`](https://github.com/TanStack/router/commit/44a8c3e1d2af305064b2363d97fc7847c6f1a246), [`5253e70`](https://github.com/TanStack/router/commit/5253e70db2083d68a788fb7c9a043bb0c5518f2a)]:
  - @tanstack/router-core@1.171.20

## 1.170.21

### Patch Changes

- Updated dependencies [[`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9)]:
  - @tanstack/router-core@1.171.19

## 1.170.20

### Patch Changes

- [#7970](https://github.com/TanStack/router/pull/7970) [`2435885`](https://github.com/TanStack/router/commit/2435885fa8b5e31c8c4b74d93920919f27316ebf) - createFileRoute does not rely on FileRoute class

- [#7985](https://github.com/TanStack/router/pull/7985) [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b) - perf: compact private bundle boundaries- [#7975](https://github.com/TanStack/router/issues/7975)

- [#7971](https://github.com/TanStack/router/pull/7971) [`86bf510`](https://github.com/TanStack/router/commit/86bf510c2923afb76804223bd04afc2a809b33e7) - clean intersection observer options in link component

- [#7967](https://github.com/TanStack/router/pull/7967) [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c) - Preserve path params in their raw string form while matching routes so structured values returned by `params.parse` produce stable match IDs and do not reuse stale loader data.

  `RouterCore.getMatchedRoutes()` now returns `[matchedRoutes, rawParams, foundRoute]` instead of an object.

- Updated dependencies [[`84db4a8`](https://github.com/TanStack/router/commit/84db4a842311df3f7e58073f6f12aaf371aeb5c7), [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b), [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c)]:
  - @tanstack/router-core@1.171.18
  - @tanstack/history@1.162.1

## 1.170.19

### Patch Changes

- Updated dependencies [[`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5)]:
  - @tanstack/router-core@1.171.17

## 1.170.18

### Patch Changes

- [#7805](https://github.com/TanStack/router/pull/7805) [`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd) - Rewrite match loading around a lane-based scheduler that tracks each navigation, preload, and background reload as an ordered unit of work. This fixes pending/redirect/retry state leaking between overlapping navigations, restores correct SSR status codes for redirects, errors, and not-found responses, and closes hydration gaps where the client re-ran work the server had already completed.
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

- Updated dependencies [[`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd)]:
  - @tanstack/router-core@1.171.16

## 1.170.17

### Patch Changes

- Updated dependencies [[`e2dd204`](https://github.com/TanStack/router/commit/e2dd2049cb42eb219d3b447b8605066d19d9c1fa)]:
  - @tanstack/router-core@1.171.15

## 1.170.16

### Patch Changes

- Updated dependencies [[`9809a06`](https://github.com/TanStack/router/commit/9809a0619d4ed3fe8c2a393af5b9eca4b6c7695b)]:
  - @tanstack/router-core@1.171.14

## 1.170.15

### Patch Changes

- Updated dependencies [[`776d8ef`](https://github.com/TanStack/router/commit/776d8ef283e5bd9ffe97d43bc3a7f58064cd7e03)]:
  - @tanstack/router-core@1.171.13

## 1.170.14

### Patch Changes

- Updated dependencies [[`df1076c`](https://github.com/TanStack/router/commit/df1076c03ae5a51ab384bebd4d6afda20fb6f107)]:
  - @tanstack/router-core@1.171.12

## 1.170.13

### Patch Changes

- [#7555](https://github.com/TanStack/router/pull/7555) [`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01) - Fix search middleware composition so `retainSearchParams` does not restore search params that a downstream `stripSearchParams` removed.

- Updated dependencies [[`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01)]:
  - @tanstack/router-core@1.171.11

## 1.170.12

### Patch Changes

- Updated dependencies [[`2cca73c`](https://github.com/TanStack/router/commit/2cca73c92262ffd96dac4e283c9f69fb37f4b43a), [`7a83e67`](https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba), [`76b3d3b`](https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c)]:
  - @tanstack/router-core@1.171.10

## 1.170.11

### Patch Changes

- Updated dependencies [[`b4cd5af`](https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778)]:
  - @tanstack/router-core@1.171.9

## 1.170.10

### Patch Changes

- Updated dependencies [[`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd)]:
  - @tanstack/router-core@1.171.8

## 1.170.9

### Patch Changes

- [#7497](https://github.com/TanStack/router/pull/7497) [`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48) - fix streaming

- Updated dependencies [[`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48)]:
  - @tanstack/router-core@1.171.7

## 1.170.8

### Patch Changes

- Add support for Rsbuild client output formats, including module output by default and IIFE output for classic script environments. ([#7477](https://github.com/TanStack/router/pull/7477))

  Client entry scripts and preloads are now represented as root route manifest assets, script preloads follow the manifest script format, and script asset cross-origin configuration uses the `script` key. The `transformAssets` script callback context now exposes only `kind: 'script'` and `url`, keeping script format handling internal to manifest rendering.

- Updated dependencies [[`51a97a1`](https://github.com/TanStack/router/commit/51a97a167fb3ef1b8ca70fbb63db635158f43509)]:
  - @tanstack/router-core@1.171.6

## 1.170.7

### Patch Changes

- Updated dependencies [[`5268ba4`](https://github.com/TanStack/router/commit/5268ba4566233ea58880df85f167ad0401a93a46)]:
  - @tanstack/router-core@1.171.5

## 1.170.6

### Patch Changes

- Fix hash navigation being overridden by stale scroll restoration entries. ([#7447](https://github.com/TanStack/router/pull/7447))

- Updated dependencies [[`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960), [`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960)]:
  - @tanstack/router-core@1.171.4

## 1.170.5

### Patch Changes

- Updated dependencies [[`5fa9e55`](https://github.com/TanStack/router/commit/5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b)]:
  - @tanstack/router-core@1.171.3

## 1.170.4

### Patch Changes

- Updated dependencies [[`b60eb36`](https://github.com/TanStack/router/commit/b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67)]:
  - @tanstack/router-core@1.171.2

## 1.170.3

### Patch Changes

- Updated dependencies [[`d9cf933`](https://github.com/TanStack/router/commit/d9cf9331b83fcbd2abfee75d839d862f9bb18e6b)]:
  - @tanstack/router-core@1.171.1

## 1.170.2

### Patch Changes

- Updated dependencies [[`d533f87`](https://github.com/TanStack/router/commit/d533f87976704098a40b48f160b37c28c8182806)]:
  - @tanstack/router-core@1.171.0

## 1.170.1

### Patch Changes

- Updated dependencies [[`2387a2e`](https://github.com/TanStack/router/commit/2387a2eea0683004cc400b9f71bed5944eb60110)]:
  - @tanstack/router-core@1.170.1

## 1.170.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`b1c061a`](https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f), [`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14)]:
  - @tanstack/router-core@1.170.0
  - @tanstack/history@1.162.0

## 1.169.2

### Patch Changes

- Updated dependencies [[`35e88f0`](https://github.com/TanStack/router/commit/35e88f04996d71019a1868b7b06ecb4ddbc9df9e)]:
  - @tanstack/router-core@1.169.2

## 1.169.1

### Patch Changes

- Updated dependencies [[`4a1e63f`](https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13)]:
  - @tanstack/router-core@1.169.1

## 1.169.0

### Minor Changes

- Allow `params.parse` to experimentally return `false` to skip an incoming route candidate during path matching. Thrown parse errors still surface on the selected match instead of falling through, and outgoing typed route-template links continue to use exact route lookup followed by `params.stringify` for URL generation. ([#7263](https://github.com/TanStack/router/pull/7263))

### Patch Changes

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/router-core@1.169.0

## 1.168.22

### Patch Changes

- Updated dependencies [[`b5c4183`](https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece)]:
  - @tanstack/router-core@1.168.18

## 1.168.21

### Patch Changes

- Updated dependencies [[`493148b`](https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34)]:
  - @tanstack/router-core@1.168.17

## 1.168.20

### Patch Changes

- Add TanStack Start inline CSS manifest support for SSR so route styles can be embedded in the HTML response and hydrated without duplicate stylesheet links. ([#7253](https://github.com/TanStack/router/pull/7253))

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/router-core@1.168.16

## 1.168.19

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15

## 1.168.18

### Patch Changes

- Fix route file transforms to preserve route ID quoting, handle more exported `Route` patterns, and avoid incorrect import rewrites in edge cases. ([#7167](https://github.com/TanStack/router/pull/7167))

  Improve transform robustness with clearer route-call detection, safer import removal, and expanded test coverage for quote preservation, constructor swaps, and unsupported route definitions.

## 1.168.17

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/router-core@1.168.14

## 1.168.16

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13

## 1.168.15

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12

## 1.168.14

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/router-core@1.168.11

## 1.168.13

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/router-core@1.168.10

## 1.168.12

### Patch Changes

- Fix `MatchRoute` child callback param inference to resolve params from the target `to` route instead of the route path key across React, Solid, and Vue adapters. ([#7139](https://github.com/TanStack/router/pull/7139))

## 1.168.11

### Patch Changes

- Fix redirected pending route transitions so lazy target routes can finish loading without stale redirected matches causing render errors. ([#7137](https://github.com/TanStack/router/pull/7137))

## 1.168.10

### Patch Changes

- Fix `Link` to keep internal routing props like `preloadIntentProximity`, `from`, and `unsafeRelative` from leaking to rendered DOM elements across React, Solid, and Vue. ([#7138](https://github.com/TanStack/router/pull/7138))

## 1.168.9

### Patch Changes

- Preserve component-thrown `notFound()` errors through framework error boundaries so route `notFoundComponent` handlers render without requiring an explicit `routeId`. ([#7077](https://github.com/TanStack/router/pull/7077))

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9

## 1.168.8

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8

## 1.168.7

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7

## 1.168.6

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6

## 1.168.5

### Patch Changes

- fix: scroll restoration without throttling ([#7042](https://github.com/TanStack/router/pull/7042))

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5

## 1.168.4

### Patch Changes

- tanstack/store 0.9.3 ([#7041](https://github.com/TanStack/router/pull/7041))

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/router-core@1.168.4

## 1.168.3

### Patch Changes

- feat: transformAssets ([#7023](https://github.com/TanStack/router/pull/7023))

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/router-core@1.168.3

## 1.168.2

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/router-core@1.168.2

## 1.168.1

### Patch Changes

- Update store to 0.9.2 ([#6993](https://github.com/TanStack/router/pull/6993))

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/router-core@1.168.1

## 1.168.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/router-core@1.168.0

## 1.167.5

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5

## 1.167.4

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4

## 1.167.3

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3

## 1.167.2

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/history@1.161.6
  - @tanstack/router-core@1.167.2

## 1.167.1

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/router-core@1.167.1
  - @tanstack/history@1.161.5

## 1.167.0

### Minor Changes

- feat: add staleReloadMode ([#6921](https://github.com/TanStack/router/pull/6921))

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0
