# 002 — memoize `matchRoutesLightweight` per location

|                 |                                                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/router.ts` (shared client+server)                                                                                                                                                                                                     |
| Benchmarks      | client-nav (react) **and** ssr (react)                                                                                                                                                                                                                          |
| Expected impact | **Large** (client: removes ~22/23 of per-navigation match/validate/param work; SSR: validated additional −7% on top of 001)                                                                                                                                     |
| Confidence      | High (profiled; SSR variant validated experimentally with byte-identical output)                                                                                                                                                                                |
| Risk            | Medium-low                                                                                                                                                                                                                                                      |
| Prior art       | `origin/flo/current-location-lightweight-cache` (commits `b745f7d39f` + fix `b845204fa7`) — same idea, stale vs current main; **rebase it rather than re-implementing**. Local branch `flo/router-current-location-cache-guard` may contain related guard work. |

## Problem

Every `buildLocation` call starts by re-deriving the _current_ location's matches:

- `router.ts:1829-1841` — `build()` does `const lightweightResult = this.matchRoutesLightweight(currentLocation)`.
- `router.ts:1722-1789` — `matchRoutesLightweight` runs:
  - `this.getMatchedRoutes(location.pathname)` (LRU-cached match, but still `trimPathRight` + `Object.create(null)` + `Object.assign(routeParams, match.rawParams)` per call, `router.ts:3092-3100`),
  - `const accumulatedSearch = { ...location.search }` plus the **user `validateSearch` for every matched route** (`router.ts:1743-1753`),
  - a params-reuse check against `stores.matchesId`/match stores, or a fresh `extractStrictParams` chain re-running user `params.parse` (`router.ts:1756-1781`).

Every mounted `<Link>` subscribes to `router.stores.location` with `prev.href === next.href` equality (`react-router/src/link.tsx:403-407`) and recomputes `router.buildLocation({ _fromLocation: currentLocation, ..._options })` when it changes (`link.tsx:410-413`). All links pass the **same** location object (the store value), and `router.navigate` itself uses `this.latestLocation`.

## Why it's hot

- client-nav: ~22 links + 1 navigate = **~23 byte-identical `matchRoutesLightweight` computations per navigation** (~230 per benchmark iteration). The user's `validateSearch` runs ~23× per navigation for the current location alone — in real apps this is often a zod schema, so the real-world cost is much higher than the benchmark shows.
- Profile share (client): `build` 61.8 ms + `matchRoutesLightweight` 40.1 ms + `getMatchedRoutes` 27.2 ms in a 5.4 s profile, plus a large share of the 8.6% GC.
- SSR: 10 Links per request → 10 identical computations; `getMatchedRoutes` alone was 4.7% self post-001. Validated patch: **0.557 → 0.516 ms/request**.

## Proposed approach

Single-entry memo on the router instance keyed by reference equality:

```ts
private _lightweightCache?: {
  location: ParsedLocation
  lastMatchId: string | undefined   // last(this.stores.matchesId.get())
  result: LightweightResult
}
```

- Hit when `location` is reference-equal **and** `last(this.stores.matchesId.get())` is unchanged (the result's `canReuseParams` branch at `router.ts:1756-1781` reads match-store state, so the key must cover it).
- Location objects are immutable and fresh per commit (`parseLocation` creates a new object), so reference identity is a sound key.
- Sharing the result object across callers is safe today: `build()` defensively copies params before mutating (`router.ts:1876-1879` `Object.assign(Object.create(null), lightweightResult.params)`) and treats `fromSearch` as read-only (`nullReplaceEqualDeep` input at `router.ts:2006`). Re-verify this when rebasing.
- Invalidate (or simply rely on key mismatch) when the route tree is swapped (`update()`/HMR).

The prior-art branch additionally replaced the returned `search` with `currentLocation.search` — verify that's still correct after the retained-search fixes that landed later on main (`df1076c03a`, `7a83e67e65`); the follow-up commit `b845204fa7` on that branch ("preserve validated search in buildLocation") addresses exactly this, so read it.

## Risks & constraints

- Impure user `validateSearch` would now run once per navigation instead of N times — arguably a fix, but observable.
- Stale-cache bugs surface as wrong relative-link targets; cover with the existing link/buildLocation test suites.
- Bundle delta ≈ +10-15 lines in router-core; partially offset by deleting the dead commented-out block at `router.ts:1733-1740`.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- Composes with [003](003-build-middleware-chain-cache.md) (the other repeated block inside `buildLocation`) and [001](001-search-params-json-parse-exception-storm.md).
- [016](016-link-render-granularity.md) reduces how often links recompute at all.
