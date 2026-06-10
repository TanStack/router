# 010 — skip user `select` when the extracted match slice is referentially unchanged

|                 |                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/` hooks (`useParams`, `useSearch`, `useLoaderData`, `useLoaderDeps`, `useRouteContext`, `useMatch`)     |
| Benchmarks      | client-nav (react)                                                                                                                 |
| Expected impact | Medium (the benchmark's 52 hook subscribers run deliberately-expensive selectors; real apps run arbitrary user code per store set) |
| Confidence      | High on mechanism; medium on benchmark magnitude                                                                                   |
| Risk            | Medium (stale-select hazards; must key on select identity)                                                                         |
| Prior art       | continues the consolidation from merged #7577 (`689d88e04c`, shared hook structuralSharing logic)                                  |

## Problem

Every derived hook funnels to `useMatch` with a _composed_ selector:

- `useParams.tsx:101-105`, `useSearch.tsx:101-103`, `useLoaderData.tsx:87-89`, `useLoaderDeps.tsx:65-67`, `useRouteContext.ts:27-28` — each wraps as `(match) => { const slice = match.X; return opts.select ? opts.select(slice) : slice }`.
- On **every** match-store `set`, `useSyncExternalStoreWithSelector` re-runs this selector for every subscriber (shared path `useMatch.tsx:53-66` `useStructuralSharing`, `useMatch.tsx:182-198`).

But router-core deliberately stabilizes the slices: `match.params`/`match.search`/`loaderDeps` go through `replaceEqualDeep`/`nullReplaceEqualDeep` against the previous match (`router.ts:1586-1588`, `1627-1629`, `1667-1669`). So when a match object is replaced (new `cause`/`updatedAt`/identity) but the slice reference is unchanged, all subscribers still re-run their user `select` for nothing. In the benchmark: 20 root-level subscribers (strict:false `useParams`/`useSearch`, each running a 40-iteration computation) × every root-match set (≥1/navigation, more with post-commit context/loaderData updates), plus 6-18 route-level subscribers.

## Proposed approach

Refactor the hooks to pass `extract` (slice getter) and `select` separately to `useMatch`, then extend `useStructuralSharing` (or a sibling helper) to memoize:

```
slice = extract(match)
if (slice === prevSlice && select === prevSelect) return prevResult
prevResult = structuralSharing(select ? select(slice) : slice)
```

stored in the existing `previousResult` ref. Likely bundle-neutral or negative: it removes five near-identical wrapper closures.

## Risks & constraints

- A user `select` closing over changing component values must not get a stale cached result. Keying on `select` **identity** handles this: inline selects get a new identity each render, so the cache only short-circuits _store notifications between renders_ — exactly the safe hot path (same trick React Query uses). Users passing memoized selectors that close over other changing values were already broken under `useSyncExternalStoreWithSelector`'s own memoization assumptions.
- `shouldThrow`/undefined-match path must bypass the cache (see [011](011-use-match-invariant-throw.md)).
- Navigations that genuinely change the slice (e.g. `params.id`) must still re-run select — guaranteed by the reference check.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- [019](019-match-identity-reuse.md) (match identity reuse) attacks the same waste one level lower — if the match object itself keeps identity, stores don't notify at all. Both are worthwhile; this one also covers post-commit sets that legitimately replace the match.
