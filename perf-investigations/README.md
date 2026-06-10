# Performance Investigations

One file per runtime-performance improvement opportunity for the core + react packages
(`router-core`, `history`, `react-router`, `start-*`). Each file is self-contained: an
implementation agent should be able to pick up a single file and produce a change.

Generated 2026-06-10 from a code audit + CPU profiling of the benchmarks at commit `6f1daf5104`.

## Ground rules (apply to every investigation)

- **Goal: speed.** Wall-clock/CPU improvements in `benchmarks/client-nav` and `benchmarks/ssr`.
  Memory only matters via GC pressure.
- **Hard constraint: client bundle size must not regress.** Gzip of all emitted client JS is
  tracked in CI (`benchmarks/bundle-size`). Any change to code shipped to the client must be
  validated against it. Server-only code (`start-server-core`, `router-core/src/ssr/ssr-server`)
  has more freedom.
- **Behavior must not change.** The router has extensive unit tests; run the touched package's
  `test:unit` target. Several proposals note specific semantic hazards — read them.

## Validation commands

```bash
# client navigation speed (the main client benchmark; jsdom)
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
# flamegraph of the same loop
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:flame:react --outputStyle=stream --skipRemoteCache

# SSR request-loop speed
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache

# bundle-size guard (always run for client-shipped code changes)
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
pnpm benchmark:bundle-size:query --id react-router.minimal

# unit tests
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @tanstack/react-router:test:unit
```

Profiling baselines measured during this audit: client-nav ≈ **1.77 ms/navigation**
(prebuilt dist, node script over jsdom), SSR ≈ **0.957 ms/request** (NODE_ENV=production —
without it you profile dev React).

## ⚠️ Check unmerged prior-art branches first

Several opportunities already have in-flight branches. Before implementing a file that lists
prior art, inspect/rebase the branch instead of starting from scratch:

| Branch                                                         | Covers                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `origin/flo/search-params-json-parse-guard`                    | 001 (most recent, has review feedback applied)               |
| `origin/refactor-router-core-stringify-parse-search-json-perf` | 001 (older alternative)                                      |
| `origin/flo/current-location-lightweight-cache`                | 002                                                          |
| `origin/flo/load-matches-sync-fastpaths`                       | 004 (partially 008)                                          |
| `origin/refactor-router-core-ready-transition-performance`     | 007 / 021 vicinity                                           |
| `origin/perf/react-link-location-deps`                         | 013/016 exploration (author considered it unsatisfactory)    |
| `origin/perf-path`                                             | 017 vicinity                                                 |
| `origin/perf-process-route-tree`                               | 026 + param-decode fast paths                                |
| `origin/perf-replaceEqualDeep`                                 | `replaceEqualDeep` internals (touches many files' hot paths) |
| `origin/refactor-react-router-head-use-tags-performance`       | head/useTags (not covered by a file here)                    |

## Index, ordered by expected impact

### Tier 1 — measured, large

- [001 — search-params JSON.parse exception storm](001-search-params-json-parse-exception-storm.md) — **validated −42% SSR request time**; 5.7% of client profile
- [002 — memoize matchRoutesLightweight per location](002-match-routes-lightweight-memo.md) — validated additional −7% SSR; removes ~22/23 of per-Link match work on client
- [004 — sync fast paths in the loader phase of loadMatches](004-load-matches-sync-fastpaths.md)
- [006 — updateMatch write coalescing per match](006-update-match-write-coalescing.md)
- [007 — Transitioner startTransition/setIsTransitioning churn](007-transitioner-transition-refcount.md)

### Tier 2 — high confidence, medium

- [003 — cache buildMiddlewareChain](003-build-middleware-chain-cache.md) (explicit TODO in code)
- [005 — skip runLoader for loaderless routes](005-loaderless-runloader-fast-path.md)
- [008 — lazy ControlledPromise allocation](008-lazy-controlled-promise.md)
- [009 — parseLocation reuse of just-built location](009-parse-location-reuse-built-location.md)
- [010 — hook selector slice memoization](010-hook-selector-slice-memoization.md)
- [016 — Link re-render granularity](016-link-render-granularity.md) (largest potential, largest effort)
- [018 — matchRoutesInternal per-navigation overheads](018-match-routes-internal-overheads.md)
- [019 — match identity reuse for unchanged matches](019-match-identity-reuse.md)

### Tier 3 — smaller / localized

- [011 — useMatch selector throws Error per unmounting subscriber](011-use-match-invariant-throw.md)
- [012 — Outlet/Match/MatchInner selector compares](012-outlet-match-selector-compares.md)
- [013 — Link \_options memo defeated by inline props](013-link-options-memo-stability.md)
- [014 — port server isActive pre-checks to client](014-link-isactive-client-prechecks.md)
- [015 — Link flushSync on click](015-link-flushsync-click.md)
- [017 — interpolatePath template parse cache](017-interpolate-path-template-cache.md)
- [020 — incremental buildMatchContext](020-build-match-context-incremental.md)
- [021 — single-pass cached-pool reconciliation at commit](021-commit-cached-pool-single-pass.md)
- [022 — commit-path micro-allocations (memory history, async wrappers)](022-commit-path-micro-allocations.md)

### Tier 4 — SSR/server-only

- [023 — router.update() runs 3× per SSR request](023-ssr-router-update-three-times.md)
- [024 — hoist per-request handler boilerplate](024-ssr-handler-hoisting.md)
- [025 — findHtmlBoundary chunk scanning](025-ssr-html-boundary-scan.md)
- [026 — route-matching trie allocations under non-repeating URLs](026-ssr-trie-allocations.md)

## Composition notes

- 001, 002 and 003 compose: after all three, a Link re-render's `buildLocation` is mostly
  LRU hits + `interpolatePath` + cheap stringify.
- 004, 005, 006, 008 touch overlapping call sites in `load-matches.ts` — coordinate or land
  sequentially with rebases.
- 019 only pays off after 006 (otherwise later writes break identity anyway).
- 010, 011, 012 are independent react-router changes but all reduce per-store-set subscriber cost.
