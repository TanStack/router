# 019 — reuse match object identity for unchanged matches in `matchRoutesInternal`

|                 |                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------ |
| Area            | `packages/router-core/src/router.ts`, `stores.ts` (shared client+server)                   |
| Benchmarks      | client-nav (react); bigger in real apps with stable layout routes                          |
| Expected impact | Medium-large **when combined with 006/008/020**; small alone                               |
| Confidence      | Medium (highest-behavior-risk finding in the core series)                                  |
| Risk            | High — copy-on-write discipline required                                                   |
| Prior art       | none found; `origin/perf-replaceEqualDeep` optimizes the equality machinery this relies on |

## Problem

Every navigation rebuilds **every** matched route's match object, even when nothing about it changed:

- `router.ts:1580-1590` — unconditional `{...existingMatch, ...}` spread with new `cause`, new `updatedAt`, and (via `router.ts:1651-1655`, `1698-1702`) a fresh `context` object identity. `search`/`params`/`loaderDeps` are already structurally shared (`router.ts:1586-1588`, `1627-1629`, `1667-1669`), and `_strictSearch` is not (`router.ts:1495`).
- At commit, `reconcileMatchPool` (`stores.ts:306-342`) sets a match store whenever `existing.get() !== nextMatch` (`stores.ts:333-335`) — which is **always**, because the spread guarantees fresh identity.
- Consequence: the **root match** notifies its full subscriber set on every navigation. In the benchmark that's the largest fan-out in the app: 20 root-level selector hooks (strict:false `useParams`/`useSearch`) re-run per navigation even when root params/search are untouched.

## Proposed approach

After computing the new fields for an existing match, compare the reactive fields against `existingMatch` — `search`, `params`, `_strictSearch` (give it `replaceEqualDeep` first), `loaderDeps`, `searchError`, `globalNotFound`, `cause`, `context` (after [006](006-update-match-write-coalescing.md)'s context bail-out stabilizes it). If all are reference-equal, **return `existingMatch` itself**, so `reconcileMatchPool` skips the `set` and no subscriber is notified.

Apply `replaceEqualDeep` to `_strictSearch` and the `context` spread regardless — that alone improves downstream selector short-circuiting ([010](010-hook-selector-slice-memoization.md)).

## Risks & constraints

- **Copy-on-write hazard**: `matchRoutesInternal` currently mutates the _new_ object after the spread (`router.ts:1643-1655` — `cause` 'enter'→'stay' transitions, `globalNotFound`/`searchError` resets). Reusing `existingMatch` means those mutations would write into **live store state**. The equality check must cover every post-spread mutation, and any difference must fall back to the spread path.
- `updatedAt`/`cause` semantics if a "stay" navigation is skipped: `cause` transitions are observable (`onStay` hooks, `match.cause` in loaders). Only reuse identity when `cause` is also unchanged.
- Only worthwhile **after** [006](006-update-match-write-coalescing.md)/[008](008-lazy-controlled-promise.md): otherwise the later `fetchCount`/`abortController`/`context` writes in `loadMatches` break identity again anyway.
- Structural-sharing test suites should catch regressions; add a test asserting the root match store does not notify on an unrelated child param change.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Success criterion: navigating `/items/1 → /items/2` produces zero notifications on the root match store's subscribers.
