# 022 — commit-path micro-allocations: memory-history re-parse + residual async wrappers

|                 |                                                                                         |
| --------------- | --------------------------------------------------------------------------------------- |
| Area            | `packages/history/src/index.ts`, `packages/router-core/src/router.ts`                   |
| Benchmarks      | client-nav (react) — uses memory history; SSR also creates a memory history per request |
| Expected impact | Small (once per navigation, but near-zero risk; several items are pure deletions)       |
| Confidence      | High that it's wasted work                                                              |
| Risk            | Low                                                                                     |
| Prior art       | follows up merged #7582 (`5127d861ae`), which de-promised parts of this path            |

Two clusters of small, independent wins on the once-per-navigation commit path.

## A. Memory history re-parses and over-allocates per notify

- `history/index.ts:595` — `createMemoryHistory.getLocation = () => parseHref(entries[index]!, states[index])`, and `notify` (`history/index.ts:119-122`) calls `getLocation()` on every push/replace. Each call runs `sanitizePath` (regex + `startsWith` + possible second regex) and three `indexOf`/`substring` passes. Compare `createBrowserHistory`, which caches `currentLocation = parseHref(destHref, state)` in `queueHistoryAction` (`history/index.ts:383`).
- `history/index.ts:653-685` — `parseHref` calls `createRandomKey()` **unconditionally** (`:661`) even though the result is discarded whenever `state` is provided (`state: state || {...}` at `:683`) — which is always, on this path.
- `history/index.ts:129-159` — `tryNavigation` is `async`, allocating a promise per push/replace even when there are no blockers and the path is fully synchronous.

**Strategies**

1. Move `createRandomKey()` into the `state ||` fallback branch of `parseHref` — zero risk, negative bundle delta.
2. Cache the parsed location in `createMemoryHistory`: update a `currentLocation` variable inside `pushState`/`replaceState` (path + state already in hand); re-parse only in `go`/`back`/`forward`. Mirrors the browser-history pattern.
3. Sync fast path in `tryNavigation` when `ignoreBlocker || blockers.length === 0`: just call `task()`; keep the async path for blockers. `push`/`replace` already ignore the returned promise.

## B. Residual promise wrappers in `navigate`/`commitLocation`

Per navigation, before `loadMatches` even starts, ~7 promises are allocated. The avoidable ones:

- `router.ts:2143` — `commitLocation` is `async` but contains **no await** (ends with `return this.commitLocationPromise`): the keyword only adds a wrapper promise + an extra microtask hop for awaiters. De-`async` it and return the promise directly.
- `router.ts:2313` — `navigate` is `async`; its only `await` is in the `reloadDocument` blocker loop. Restructure so the hot path returns `this.buildAndCommitLocation(...)` directly and the `reloadDocument` branch lives in an async helper.

**Risk note**: a non-async function throws synchronously where an async one returned a rejected promise. Both can throw from `buildLocation` (user `params.stringify`, search updaters). Verify test expectations; if needed, wrap in try/catch returning `Promise.reject(err)` to preserve semantics.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/history:test:unit && pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: history blockers, back/forward in memory history, navigate() rejection behavior.
