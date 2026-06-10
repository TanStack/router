# 004 — sync fast paths in the loader phase of `loadMatches`

|                 |                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/load-matches.ts`, `router.ts` (shared client+server)                                                                                                                                                                                                                                                                                                        |
| Benchmarks      | client-nav (react), ssr (react)                                                                                                                                                                                                                                                                                                                                                       |
| Expected impact | Medium-large — shortens the microtask chain in front of every render commit                                                                                                                                                                                                                                                                                                           |
| Confidence      | High                                                                                                                                                                                                                                                                                                                                                                                  |
| Risk            | Medium (error/redirect propagation paths)                                                                                                                                                                                                                                                                                                                                             |
| Prior art       | `origin/flo/load-matches-sync-fastpaths` (commits `14ecec2e52`, `4fc676c334`, `9be80233eb` — incl. a fix preserving sync beforeLoad abortController and store-update-count test adjustments). **Rebase/extend this branch rather than starting fresh.** Follows up on merged #7582 ("avoid creating promises when not necessary"), which only removed 4 trivial `Promise.resolve()`s. |

## Problem

The beforeLoad phase already uses a sync-continuation pattern (`handleBeforeLoad`, `load-matches.ts:533-558`, only awaits when `isPromise(beforeLoad)`), but the loader phase is unconditionally async:

- `load-matches.ts:784` — `loadRouteMatch` is `async`.
- `load-matches.ts:789-854` — nested `async function handleLoader` is **re-created per match per navigation** (closure over `matchId`, `loaderShouldRunAsync`, …).
- `load-matches.ts:641` — `runLoader` is `async`.
- `load-matches.ts:972, 1025-1030` — every match pushes a promise into `matchPromises`, then `await Promise.all(matchPromises)`.
- `router.ts:2486` — `onReady: async () => {...}` has a fully synchronous body; the `async` keyword forces `triggerOnReady` (`load-matches.ts:1171-1174`) to await a promise.

When all loaders are sync (the benchmark; also the common cache-hit case in real apps), this is 3 async-function frames per match — each a promise allocation + 1-2 microtask hops — and the React commit the benchmark waits for is queued behind all of them. Depth-2/3 match trees × 10 navigations per iteration.

## Proposed approach

1. Convert `loadRouteMatch` to return `AnyRouteMatch | Promise<AnyRouteMatch>` using the same `isPromise` continuation style as `handleBeforeLoad`. Only push actual promises into `matchPromises`; skip `Promise.all` entirely when none are.
2. Hoist `handleLoader` to module scope with explicit args (also removes one closure per match per navigation). The `serverSsr`/`execute`/`queueExecution` closures in `handleBeforeLoad` (`load-matches.ts:540-555`) can be similarly flattened on the client, where `isServer` is statically `false` and dead-code-eliminated.
3. Make `onReady` (`router.ts:2486`) a plain sync function — `triggerOnReady` already handles a `void` return.

## Risks & constraints

- `getLoaderContext` (`load-matches.ts:614`) passes `matchPromises[index - 1]` as `parentMatchPromise` to loaders. When a loader actually runs it must still receive a promise — lazily wrap with `Promise.resolve(match)`.
- Error propagation: `handleRedirectAndNotFound` throws; the sync path needs equivalent try/catch placement so redirects/notFound behave identically (the existing branch has test updates around this).
- Solid/vue store-update-count tests assert exact store write counts; the prior-art branch already adjusted them (`9be80233eb`) — those frameworks are out of scope for changes but their tests still run.
- Code size roughly neutral (restructure, not addition) but verify with the bundle benchmark.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- [005](005-loaderless-runloader-fast-path.md), [006](006-update-match-write-coalescing.md), [008](008-lazy-controlled-promise.md) touch the same call sites — coordinate.
- [022](022-commit-path-micro-allocations.md) covers the analogous de-async work in `navigate`/`commitLocation`.
