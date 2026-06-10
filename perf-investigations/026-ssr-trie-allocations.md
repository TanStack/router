# 026 — route-matching trie: per-candidate frame allocations and LRU eviction churn under non-repeating URLs

|                 |                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area            | `packages/router-core/src/new-process-route-tree.ts`, `lru-cache.ts` (shared client+server)                                                                                                                                                                                                      |
| Benchmarks      | ssr (react) — the bench generates a unique random URL per request, so the match LRU never hits; negligible for client-nav (cache hits after warmup)                                                                                                                                              |
| Expected impact | Small-medium for SSR/unique-URL workloads                                                                                                                                                                                                                                                        |
| Confidence      | Medium                                                                                                                                                                                                                                                                                           |
| Risk            | High-ish relative to payoff — this is the most intricate code in the package (priority bitmasks, fuzzy resumable extraction)                                                                                                                                                                     |
| Prior art       | **`origin/perf-process-route-tree`** (`ddb360d575` + result notes `f36a2afcfa`) already optimizes this file (removes `sortTreeNodes` walk, adds a `%`-check fast path before `decodeURIComponent` in `extractParams`). **Land/rebase that branch first; only then evaluate what remains below.** |

## Problem

For a URL that misses the match cache (every request in the SSR bench; first-visit URLs in real servers):

- `new-process-route-tree.ts:725-758` — `findRouteMatch`: `matchCache.get` (miss) + full trie walk + `buildRouteBranch` + `matchCache.set`; once the 1000-entry LRU is warm, **every set also evicts** (`lru-cache.ts:44-67`: delete + linked-list pointer surgery). Note the cache is still useful _within_ a request (subsequent `getMatchedRoutes` calls for rendered Links hit the just-inserted entry) — do not remove it.
- `new-process-route-tree.ts:1041-1051`, `1164-1304` — `getNodeMatch` pushes a 10-field frame object per candidate (`{node, index, skipped, depth, statics, dynamics, optionals, extract, rawParams}`); a 4-level dynamic tree costs ~10+ frames per miss, plus `path.split('/')` and `decodeURIComponent` per dynamic segment in `extractParams`.

## Proposed approach (after the prior-art branch lands)

1. **Single-candidate loop instead of push/pop**: when exactly one candidate child exists, advance a cursor in place rather than pushing a speculative frame — most segments in typical trees are unambiguous.
2. **Frame pooling or flat parallel arrays** for the speculative stack — cuts per-miss allocation; weigh against bundle size (shared code).
3. LRU: consider a cheaper eviction (ring buffer / clock) or a smaller per-set cost; only if profiling post-1/2 still shows `lru-cache.set` (`origin/perf-lru-cache` may already address internals — check it).

## Risks & constraints

- The full `new-process-route-tree.test.ts` suite (173 tests) is the safety net; fuzzy matching, optional params, and priority ordering are easy to subtly break.
- Bundle pressure: pooling code ships to the client; keep it minimal or server-gated only if it can be tree-shaken (`isServer` const folding).
- Verify against the SSR bench (unique URLs) _and_ client-nav (must not regress the cache-hit path).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```
