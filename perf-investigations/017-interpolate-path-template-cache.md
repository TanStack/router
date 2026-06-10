# 017 — cache parsed route-template segments for client `interpolatePath`

|                 |                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/path.ts`, `new-process-route-tree.ts` (shared client+server)                                                                                                       |
| Benchmarks      | client-nav (react); also SSR cache-miss URLs                                                                                                                                                 |
| Expected impact | Medium (cheap per call, but ~130 template re-parses per client-nav iteration, plus once per route per `matchRoutes`)                                                                         |
| Confidence      | High on mechanism, medium on win size                                                                                                                                                        |
| Risk            | Low-medium (bundle-size pressure is the main constraint)                                                                                                                                     |
| Prior art       | `origin/perf-path` (`ecdd3b2eb6` "optimize path.ts") and `origin/perf-process-route-tree` (`ddb360d575`) touch this area — **check both before implementing** to avoid conflicts/duplication |

## Problem

- `path.ts:244-402` — `interpolatePath` has a fast path **gated server-only** (`if (isServer ?? rest.server)` at `path.ts:263`; `isServer/client.ts` exports `false`, so the block is dead-code-eliminated from client bundles).
- On the client, every interpolation of a param-bearing template (e.g. `/items/$id`) re-runs `parseSegment` (`new-process-route-tree.ts:73-184`) per segment: `indexOf('/')`, `substring`, `includes('$')`, brace scanning — for the **same handful of immutable `route.fullPath` strings** every time.
- Call sites: `router.ts:1527` (per matched route per `matchRoutes`) and `router.ts:1950` (per `buildLocation`, i.e. per Link per location change).
- Templates without `$` early-return (`path.ts:260-261`), so only param routes pay; client-nav has ~10 param-bearing links + ~3 matched routes ≈ 13 template re-parses per navigation, ~130 per iteration.

## Proposed approach

1. Cache parsed segments per template string in a lazily populated module-level `Map<string, ...>` (e.g. a flattened `Uint16Array` of 6 values per segment, or an array of segment descriptors); the interpolation loop iterates the cached structure instead of calling `parseSegment`. The route set is bounded — no LRU needed (or reuse `createLRUCache` if worried about dynamically generated templates).
2. Alternative: attach the parsed-segment array lazily to the route instance and pass it into `interpolatePath` from both call sites (avoids a global map; slightly more plumbing).
3. **Do not** un-gate the server fast path for the client — that would re-add ~55 lines to the client bundle.

## Risks & constraints

- Bundle: estimated +~150 bytes gzip — this is the finding most likely to need an offsetting deletion (candidate: deduplicate the unguarded `trimPathRight` copy in `new-process-route-tree.ts:761-763`, which duplicates `path.ts:35-38` with the guard missing; note path.ts already imports from new-process-route-tree.ts, so inline the guard rather than importing the other way).
- Cache key must be the exact template string (it is — `ParsedSegment` offsets index into that string).
- Unbounded growth only with user-generated dynamic templates — rare; LRU if needed.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit   # path.test.ts + new-process-route-tree.test.ts (173 tests)
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```
