# 003 — cache `buildMiddlewareChain` per route branch

|                 |                                                                                        |
| --------------- | -------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/router.ts` (shared client+server)                            |
| Benchmarks      | client-nav (react), ssr (react)                                                        |
| Expected impact | Medium (allocation/GC churn removal on a ×23-per-navigation path; multiplies with 002) |
| Confidence      | High — the code carries an explicit TODO asking for exactly this                       |
| Risk            | Low-medium (re-entrancy detail)                                                        |
| Prior art       | none found                                                                             |

## Problem

Every `buildLocation` call rebuilds the entire search-middleware closure chain:

- `router.ts:3111-3124` — `applySearchMiddleware` calls `buildMiddlewareChain(destRoutes)` unconditionally.
- `router.ts:3126-3230` — `buildMiddlewareChain` loops over all destRoutes, reading `route.options` (`'search' in routeOptions`, `preSearchFilters`, `validateSearch`) and allocating a `middlewares` array plus fresh `validate`/`legacyMiddleware`/`applyNext`/`next` closures per call — even for links with zero middleware.

The code already anticipates the fix (`router.ts:3107-3110`):

```
TODO: once caches are persisted across requests on the server,
we can cache the built middleware chain using `last(destRoutes)` as the key
```

That precondition is now met: router caches **are** persisted cross-request via `globalThis.__TSR_CACHE__` (`router.ts:1121-1149`).

The returned chain is already written to be reusable — it is parameterized per invocation via `middleware(search, dest, includeValidateSearch)` with mutable captured vars assigned at `router.ts:3221-3229`.

## Why it's hot

Runs inside every `buildLocation`: ~23×/navigation on client-nav (22 links + navigate), once per Link per SSR request. Pure repeated allocation; user code isn't the cost, the closure construction is. SSR profile: ~0.4% self + GC share.

## Proposed approach

1. Cache the built chain in a `WeakMap` keyed by **branch array identity** (`WeakMap<ReadonlyArray<AnyRoute>, chain>`). `destRoutes` identity is stable in the hot paths: `getRouteBranch` memoizes branches (`router.ts:1386-1393`) and `findRouteMatch` caches `result.branch` (`new-process-route-tree.ts:755`). The notFound case spreads a fresh array (`router.ts:1923`) and will simply rebuild — fine.
   - Alternative per the TODO: key on `last(destRoutes)` — but the appended `notFoundRoute` leaf can be shared across branches; array-identity keying avoids that hazard.
2. While here, consider removing the closure-captured mutable `let dest / includeValidateSearch` (`router.ts:3127-3128`) and threading them as arguments through `applyNext`, making the cached chain re-entrant (protects against a user middleware that synchronously calls `buildLocation` again).

## Risks & constraints

- **Re-entrancy**: today each call gets fresh closures; a cached chain with captured mutable state must not be invoked recursively (middleware → `buildLocation` → same chain). Step 2 eliminates this class of bug; if skipped, document/guard.
- Route objects are recreated on HMR/`update()`, so a WeakMap keyed on routes/branches self-invalidates.
- Users mutating `route.options.search.middlewares` at runtime would see stale chains — not a supported pattern.
- Bundle delta ≈ +5 lines.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

The win is mostly GC/allocation; expect a small direct delta on client-nav, clearer when stacked on [002](002-match-routes-lightweight-memo.md).
