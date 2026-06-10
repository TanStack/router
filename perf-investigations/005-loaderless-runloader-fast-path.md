# 005 — skip `runLoader` for routes that have no loader

|                 |                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/load-matches.ts` (shared client+server)                                                           |
| Benchmarks      | client-nav (react)                                                                                                          |
| Expected impact | Medium-large — removes one full match-store write + context rebuild + detached async chain per entered match per navigation |
| Confidence      | High (branch conditions verified against the benchmark's route options)                                                     |
| Risk            | Medium (must enumerate everything `runLoader` does besides calling the loader)                                              |
| Prior art       | none found; adjacent to `origin/flo/load-matches-sync-fastpaths` ([004](004-load-matches-sync-fastpaths.md))                |

## Problem

The stale-while-revalidate path fires `runLoader` even when the route has **no loader at all**:

- `load-matches.ts:802` — `staleAge` defaults to 0, so for a `status === 'success'` match, `staleMatchShouldReload` (`load-matches.ts:818-823`) is true whenever `cause === 'enter'` or the route at that position changed — i.e. every `/items/1 → /items/2` style navigation.
- `load-matches.ts:835-848` — `loaderShouldRunAsync` triggers a fire-and-forget IIFE running `runLoader` **without checking `route.options.loader` exists**.
- `runLoader` (`load-matches.ts:641-782`) then: calls `loadRouteChunk(route)` (`:660`), finds no loader, and still finishes with a full `updateMatch` that re-spreads the ~35-field match object, rebuilds `context` via `buildMatchContext`, and stamps `updatedAt: Date.now()` (`:717-724`) — plus the IIFE's own promise chain resolving `loaderPromise`/`loadPromise` in detached microtasks (`:838-842`).

In the client-nav benchmark, the `/items/$id`, `/items/$id/details`, and `/ctx/$id` routes are all loaderless, so this path runs ~1-2× per navigation. Real apps with layout/param routes without loaders pay the same on every param change.

## Proposed approach

In `handleLoader`, add a fast path when **all** of:

- `!route.options.loader`
- no lazy route module pending (`route._lazyPromise`/`_lazyLoaded` state — a `lazyFn` could still add a loader)
- components already loaded (`route._componentsPromise`/`_componentsLoaded`)
- no `match._nonReactive.minPendingPromise`

→ perform the status/`updatedAt`/context update synchronously, merged with the `syncMatchContext` write, instead of invoking `runLoader`.

Also handle the **blocking** branch (`load-matches.ts:849-850`): loaderless routes whose status is `'pending'` (e.g. a route with only `beforeLoad`, like the benchmark's `/ctx/$id`) go through `await runLoader(...)` and need the same treatment.

## Risks & constraints

- `runLoader` is responsible for more than the loader: `route._lazyPromise`, `_componentsPromise` preloading, `errorComponent` head preloading, `updatedAt` freshness, status transitions. The fast path must be provably equivalent for the loaderless case — enumerate each side effect and reproduce or consciously skip it.
- `updatedAt` semantics feed staleness decisions on the next navigation; keep stamping it.
- Coordinate with [004](004-load-matches-sync-fastpaths.md) and [006](006-update-match-write-coalescing.md) — overlapping call sites; implementing together avoids double refactors.
- Bundle: restructure, roughly neutral; verify.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Watch specifically: lazy-route tests, preload tests, pending-component tests.
