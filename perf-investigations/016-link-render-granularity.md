# 016 — Link re-render granularity: derive `{href, isActive}` in the store selector

|                 |                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/link.tsx` (structural refactor)                                                                                                                                                                         |
| Benchmarks      | client-nav (react)                                                                                                                                                                                                                 |
| Expected impact | **Potentially large** (React render/commit work — `updateReducerImpl` 15.8%, `useLinkProps` 3.2% of the client profile — dominates the benchmark), but highest effort/risk in this series                                          |
| Confidence      | Medium (direction is sound; sizing requires prototyping)                                                                                                                                                                           |
| Risk            | High (hook restructuring, bundle-size pressure)                                                                                                                                                                                    |
| Prior art       | `origin/perf/react-link-location-deps` ("remove search validation from buildLocation" + link deps experiments; author's own assessment: "i dont think this is good, just technically fun") — mine it for pitfalls before designing |

## Problem

`link.tsx:403-413` — every Link subscribes to the whole location with `prev.href === next.href` equality and recomputes everything in render. So **all ~22 links re-render on every navigation** even when their own rendered output (`href`, `isActive`, `data-status`) is unchanged — e.g. `/search?page=2 → page=3` leaves the 8 `/items` links' DOM identical, yet they re-render through React.

The actual recomputation (`buildLocation`) gets much cheaper with [002](002-match-routes-lightweight-memo.md)+[003](003-build-middleware-chain-cache.md), but the React render/commit per link remains.

## Proposed approach

Move `buildLocation` + active-state derivation **into the `useStore` selector**, selecting a small derived record and comparing it shallowly:

```ts
useStore(
  router.stores.location,
  (loc) => {
    const next = router.buildLocation({
      _fromLocation: loc,
      ...optsRef.current,
    })
    return {
      href: next.publicHref,
      isActive: computeIsActive(loc, next, activeOptionsRef.current),
    }
  },
  shallowRecordCompare,
)
```

- Computation still runs per link per location change (cheap after 002/003), but **React re-render/commit is skipped** when the record is unchanged.
- Unstable inline option objects/functions must be read via refs inside the selector (`optsRef` updated in render), since the selector identity must not capture per-render values.
- `isTransitioning` (see [015](015-link-flushsync-click.md)) should be excluded from the record or handled via direct DOM attribute, otherwise it forces renders back in.

## Risks & constraints

- Significant restructure of `useLinkProps` hook order; preload-on-viewport/intent logic, event handlers, and `activeProps`/`inactiveProps` merging all consume the derived values — they need to read from the selected record.
- Selector must stay pure w.r.t. the store value; reading refs is fine, but updating them must happen before notifications (render order guarantees this for prop changes; verify for the `from`-route context).
- **Bundle-size pressure is real here** — this is a rewrite of the hottest component file; budget the gzip delta from the start and aim to pay for it by deleting the now-redundant memo plumbing.
- SSR branch (`link.tsx:157-266`) must keep working without stores.
- Recommended approach: prototype behind a small benchmark-only build first; measure render counts (React Profiler) before committing to the full refactor.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Success criterion: links whose href/active state didn't change produce zero React commits per navigation; flamegraph shows reduced `beginWork`/`updateProperties` share.

## Related

- Depends on [002](002-match-routes-lightweight-memo.md)/[003](003-build-middleware-chain-cache.md) to make per-link selector work cheap.
- Subsumes [013](013-link-options-memo-stability.md) if fully implemented (do 013 first anyway — it's low-risk and informs this design).
