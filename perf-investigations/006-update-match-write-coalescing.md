# 006 — coalesce per-match store writes (`pending`/`resolve`/`syncMatchContext`) and reuse AbortControllers

|                 |                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/load-matches.ts`, `router.ts` (shared client+server)                                                                                                                                |
| Benchmarks      | client-nav (react)                                                                                                                                                                                            |
| Expected impact | **Large** in combination — fewer 35-field object copies, fewer store flushes, an order of magnitude fewer React transition state updates per navigation (with [007](007-transitioner-transition-refcount.md)) |
| Confidence      | High                                                                                                                                                                                                          |
| Risk            | Medium (observable `isFetching`/`fetchCount` semantics)                                                                                                                                                       |
| Prior art       | none found directly; `origin/refactor-router-core-ready-transition-performance` touches the adjacent onReady/transition area                                                                                  |

## Problem

On the fully-sync / cache-hit path, each match still receives 3-5 separate store writes per navigation, each a full spread of the ~35-field match object, and each routed through `router.startTransition`:

- `load-matches.ts:418-447` — `executeBeforeLoad` calls `pending()` then `resolve()` **even when `route.options.beforeLoad` is absent**: `pending()` spreads the match with `fetchCount + 1`, a `new AbortController()`, `isFetching: 'beforeLoad'`; `resolve()` spreads again with `isFetching: false`.
- `load-matches.ts:191-204` — `syncMatchContext` always writes a brand-new `context` object (identity churn for `useRouteContext` subscribers).
- Additional writes at `load-matches.ts:683-687`, `:700-704`, `:717-724` (loader phase), `:927-931`, `:949-955`.
- `router.ts:2698-2727` — every `updateMatch` wraps its write in `this.startTransition`, which on React is two `setState` calls on the Transitioner (see [007](007-transitioner-transition-refcount.md)). ~8-12 `updateMatch` calls per navigation → ~20 React state updates, in separate microtask continuations so they don't batch.
- `load-matches.ts:415` — a fresh `AbortController` per match per navigation even though the previous one was never aborted (the fast path completes synchronously; `cancelMatches`, `router.ts:1801-1820`, only aborts pending/loading matches). New matches even get two (`router.ts:1624` in `matchRoutesInternal` + `executeBeforeLoad`). In jsdom (the benchmark environment) AbortController/AbortSignal are pure-JS event-target objects, notably more expensive than native.

Writes during loading go to pending-pool atoms with no component subscribers, but still dirty the computed graph (`stores.ts:146-158` `pendingMatches`/`hasPending`) and flush effects.

## Proposed approach

1. **No-beforeLoad collapse**: when `!route.options.beforeLoad`, replace `pending()+resolve()` with a single write (`{...prev, fetchCount: prev.fetchCount + 1, abortController}` — the `isFetching` round-trip nets out within the batch). Keep the two-phase writes when `beforeLoad` is genuinely async (its `isFetching: 'beforeLoad'` state is observable by `useMatch` subscribers mid-load).
2. **`syncMatchContext` bail-out**: shallow-compare the rebuilt context against `prev.context` and skip the write when equal — also stabilizes context identity for `useRouteContext` selectors (enables [019](019-match-identity-reuse.md)).
3. **AbortController reuse**: keep `match.abortController` when `!signal.aborted`; allocate a new one only after an actual abort. Drop the duplicate eager creation for brand-new matches (`router.ts:1624`) or create lazily when beforeLoad/loader exists.
4. **Transition dedup** belongs to [007](007-transitioner-transition-refcount.md) (react side); alternatively add a core-side "already in transition" flag set by `load()` (`router.ts:2454`) so nested `updateMatch` calls skip the wrapper.

## Risks & constraints

- `fetchCount` increments on every navigation today, even without a fetch — merging writes preserves that; _skipping_ writes would change it.
- Loaders/beforeLoad receive `abortController` in context; a reused signal spans multiple fetches of the same match. That matches the documented intent (abort on navigate-away), but tests may assert fresh controllers — check `load-matches`-related tests. The error path (`load-matches.ts:242`) deliberately resets the controller; keep that.
- Solid/vue adapters install their own `startTransition`; any core-side flag must be adapter-agnostic. Their store-update-count tests will need count adjustments (precedent: `9be80233eb` on the 004 branch).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- Implement together with [004](004-load-matches-sync-fastpaths.md)/[005](005-loaderless-runloader-fast-path.md) (same call sites).
- [019](019-match-identity-reuse.md) only pays off after this lands.
