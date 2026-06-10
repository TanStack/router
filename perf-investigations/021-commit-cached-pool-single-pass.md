# 021 — single-pass cached-pool reconciliation in the commit path

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/router.ts`, `stores.ts` (shared client+server)                                                               |
| Benchmarks      | client-nav (react)                                                                                                                     |
| Expected impact | Small (clean win, low risk; O(matches + cached) once per navigation)                                                                   |
| Confidence      | High                                                                                                                                   |
| Risk            | Low-medium (eviction-ordering semantics)                                                                                               |
| Prior art       | `origin/refactor-router-core-ready-transition-performance` (`cd6db1f5dc`) reworks this exact onReady region — **read/rebase it first** |

## Problem

The commit batch (`router.ts:2505-2565`, `onReady`) reconciles the cached pool **twice** per navigation and allocates ~6 intermediate collections:

- `exitingMatches` filter (`router.ts:2510-2515`), `pendingRouteIds`/`activeRouteIds` Sets (`:2519-2526`), three hook-filter arrays (`:2528-2542`).
- First reconciliation: `setCached([...cached, ...exitingMatchesToKeep])` (`:2555-2563`).
- Immediately after: `clearExpiredCache()` (`:2564`) → `clearCache` → a **second** `setCached` (`router.ts:2840-2865`) that re-filters everything just appended.
- Each `setCached` runs `reconcileMatchPool` (`stores.ts:306-342`): ids map + Set + per-entry pool ops + `arraysEqual`.

Notably, `clearExpiredCache`'s filter evicts any route **without a loader**, so loaderless exiting matches (items/ctx in the benchmark) are appended to the cache by the first `setCached` and immediately removed by the second — pure churn, every navigation.

## Proposed approach

Compute the final cached list in one pass:

1. Filter `exitingMatches` by status AND gc-eligibility/loader-presence **before** a single `setCached`.
2. Fold the gc sweep of pre-existing cached entries into the same pass.
3. Optionally compute the `exiting`/`entering`/`staying` partitions in one loop over `currentMatches` + `pendingMatches` instead of 4 filters + 2 Sets.

Keep `clearExpiredCache` as a public/elsewhere-used method; just stop calling it redundantly inside commit.

## Risks & constraints

- Eviction ordering vs the `status !== 'error'` filters must match current behavior exactly (a match evicted by gc must not receive onLeave-adjacent handling differently).
- Coordinate with the prior-art branch — it already restructures this block; landing it may subsume this file.
- Bundle delta neutral-to-negative.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: gcTime/staleTime cache retention, cache invalidation, onEnter/onStay/onLeave ordering.
