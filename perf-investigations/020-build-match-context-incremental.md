# 020 — accumulate `buildMatchContext` incrementally instead of re-walking ancestors

|                 |                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/load-matches.ts`, `router.ts` (shared client+server)           |
| Benchmarks      | client-nav (react); grows with route depth                                               |
| Expected impact | Medium (O(depth²) → O(depth) per navigation; ~6-8 context rebuilds per navigation today) |
| Confidence      | Medium-high                                                                              |
| Risk            | Medium (concurrency/ordering assumptions must be verified)                               |
| Prior art       | none found                                                                               |

## Problem

- `load-matches.ts:61-78` — `buildMatchContext` re-spreads `router.options.context` and `Object.assign`s **every ancestor's** `__routeContext`/`__beforeLoadContext`, calling `getMatch` per ancestor; `getMatch` (`router.ts:2729-2735`) probes up to 3 Maps (cached → pending → active pools) per lookup.
- Callers: `load-matches.ts:144`, `:196` (`syncMatchContext`), `:456` (`executeBeforeLoad`), `:618` (`getLoaderContext`), `:720`, `:738` — so per navigation with depth-3 matches, contexts are rebuilt ~6-8 times, each O(depth): **O(depth²)** total.
- `matchRoutesInternal` independently builds `match.context` again (`router.ts:1651-1655`, `1698-1702`).

## Proposed approach

Matches are processed serially in index order in both the beforeLoad loop and the loader phase, so accumulate in `InnerLoadContext`:

- Keep `contextAccumulator[index]`; extend from `index - 1` instead of re-walking from the root.
- Invalidate the suffix when a match's `__beforeLoadContext` is written (beforeLoad of index i completes before anything at index > i reads context).
- Reuse the previous context object when no ancestor contributed changes — this stabilizes `match.context` identity, enabling the `syncMatchContext` bail-out in [006](006-update-match-write-coalescing.md) and identity reuse in [019](019-match-identity-reuse.md).

## Risks & constraints

- The loader phase runs matches "concurrently" via `Promise.all`, but context for index i depends only on beforeLoad results, which are strictly serial and complete before loaders start — verify the redirect/error mid-stream cases (`load-matches.ts:144`) still see correct partial context.
- The accumulator must not leak across `loadMatches` invocations (preload vs navigate overlap).
- Bundle delta roughly neutral (replaces a loop with an index read + invalidation bookkeeping).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: beforeLoad context inheritance, context invalidation, redirect-from-beforeLoad, preload.
