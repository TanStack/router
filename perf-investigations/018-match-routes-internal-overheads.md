# 018 — `matchRoutesInternal` / `build()` per-navigation fixed overheads

|                 |                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Area            | `packages/router-core/src/router.ts` (shared client+server)                                                        |
| Benchmarks      | client-nav (react); scales with app size                                                                           |
| Expected impact | Small-medium today; the snapshot loop is O(all stored matches) and grows with `gcTime`-cached matches in real apps |
| Confidence      | Medium-high (one item needs a semantics check)                                                                     |
| Risk            | Medium                                                                                                             |
| Prior art       | none found                                                                                                         |

Four independent micro-inefficiencies in the once-per-navigation full matching path (`matchRoutesInternal` runs once per `load()`, profiled at 22.7 ms self in a 5.4 s client profile) and in `build()`:

## 1. `previousActiveMatchesByRouteId` iterates ALL match stores

`router.ts:1457-1465` — builds a fresh Map by iterating **every** entry of `this.stores.matchStores` and calling `store.get()` on each. `matchStores` holds active + pending + cached pools (`stores.ts:99-140`), so with `gcTime: 60_000` (benchmark) cached matches accumulate and the loop grows beyond the 2-3 active matches actually needed.

**Strategy**: build the snapshot only for routeIds relevant to `matchedRoutes`, e.g. by iterating `stores.matchesId` (the active list) instead of all stores, or maintain an incremental routeId→matchId index.
**Risk**: confirm which pools are _supposed_ to contribute — if cached matches were intentionally included (param-reuse semantics), restrict differently. Verify against `stores.ts:99-140` and the params-reuse tests.

## 2. `loaderDepsHash` JSON.stringify per route per navigation

`router.ts:1520-1525` — `loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) : ''` recomputed even when deps are unchanged.

**Strategy**: compute the hash only after the `replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)` equality pass; when the previous reference is returned, reuse the previous hash.

## 3. Triple search spreads per route

`router.ts:1481-1495` — three object spreads per matched route for search stabilization (`{...parentSearch}`, `{...parentSearch, ...strictSearch}`, `{...parentStrictSearch, ...strictSearch}`), plus `validateSearch` re-runs although `buildAndCommitLocation` already ran it with `_includeValidateSearch: true` (`router.ts:2277-2280`).

**Strategy**: skip spreads when `strictSearch` is empty/unchanged; investigate reusing the validated search from the built location (guarded — see [009](009-parse-location-reuse-built-location.md) for the precedent of being careful here).

## 4. `params.stringify` loop in `build()` re-resolves options per call

`router.ts:1928-1944` — for every `buildLocation` (~23×/navigation), the loop does the two-level option lookup (`route.options.params?.stringify ?? route.options.stringifyParams`) per destRoute, and runs user stringify fns (fresh object + `Object.assign`) even when `opts.leaveParams` makes the result unused.

**Strategy**: precompute a per-branch `stringifyFns` array (or `null` when none) cached alongside `getRouteBranch`/`match.branch`, so branches without stringify fns skip the loop entirely; check whether `leaveParams` can skip it (verify `usedParams` consumers first). Semantic result-caching of user fns is NOT safe — don't attempt.
**Risk**: invalidate the per-branch cache on `route.update()`.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Items 1-3 are independent of each other; item 1 is the most valuable for real apps (turns O(stored matches) into O(active matches)).
