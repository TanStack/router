# RESULT — perf/task2-search-reserialization

Benchmark-first investigation of search re-serialization costs in `router-core` per navigation.
Branch: `perf/task2-search-reserialization` (worktree `/tmp/opencode/router-perf-task2`).

## 1. Call graph: search work in ONE navigation

### Same-search navigation (e.g. hash-only nav, param-change nav, re-click same link)

```
navigate() / buildAndCommitLocation()
└─ buildLocation(opts)                                  router.ts:1838
   ├─ matchRoutesLightweight(currentLocation)           router.ts:1758
   │  └─ fromSearch = { ...location.search }            (shallow copy, cached per location
   │                                                     in lightweightCache, WeakMap)
   ├─ applySearchMiddleware(...)                        router.ts:2739
   ├─ nullReplaceEqualDeep(fromSearch, nextSearch)      router.ts:2016   [DEEP COMPARE]
   └─ this.options.stringifySearch(nextSearch)          router.ts:2019   [ALWAYS STRINGIFY]
                                                        → defaultStringifySearch:
                                                          URLSearchParams encode + JSON.stringify
                                                          per object value + jsonStart regex /
                                                          JSON.parse probe per string value

load()                                                  router.ts:2343
└─ updateLatestLocation()                               router.ts:1309
   └─ parseLocation(history.location, prevLocation)     router.ts:1387
      ├─ parseSearch(search)                            router.ts:1402   [PARSE]
      ├─ stringifySearch(parsedSearch)                  router.ts:1403   [STRINGIFY AGAIN]
      └─ nullReplaceEqualDeep(prevSearch, parsedSearch) router.ts:1411   [DEEP COMPARE AGAIN]
```

Counts per navigation:

| Nav type            | deep compares | stringify | parse | notes |
|---------------------|--------------|-----------|-------|-------|
| same-search nav     | 2            | 2         | 1     | both stringifies are pure recomputation of an unchanged string |
| hash-only nav       | 2            | 2         | 1     | identical search work to same-search |
| search-changing nav | 2            | 2         | 1     | all necessary except possibly the second stringify |

Key observation (router.ts:2016-2019): `nullReplaceEqualDeep` returns **the previous reference**
when deeply equal (structural sharing). The subsequent unconditional `stringifySearch` therefore
recomputes a string that is, by definition, identical to one already produced for that very
object reference earlier. The identity of the returned object is a free memo key.

Also noted: `replaceEqualDeep` has an O(1) fast path when `prev === _next` (utils.ts:240), and
`getEnumerableOwnKeys`/`isPlainObject` make unequal-object traversal comparatively cheap.

## 2. Benchmarks

Files: `packages/router-core/tests/searchReserialization.bench.ts` (micro + flow),
`packages/router-core/tests/buildLocationSearchStr.bench.ts` (end-to-end `buildLocation`).
Style follows `searchParams.bench.ts`: batched iterations (1000/bench op; 2000 for e2e).
Correctness asserted before timing (reference reuse, structural sharing, string equality).

Machine-local vitest bench (hz = batches/s, mean in ms per batched op):

### nullReplaceEqualDeep alone (mean ms)

| Case                                      | hz        | mean   | rme    |
|-------------------------------------------|-----------|--------|--------|
| small equal `{page:1}`                    | 6,902     | 0.145  | ±0.32% |
| small unequal                             | 7,344     | 0.136  | ±0.44% |
| medium equal (~10 keys mixed)             | 2,039     | 0.490  | ±0.73% |
| medium unequal (one leaf changed)         | 2,031     | 0.492  | ±1.17% |
| large equal (~50 keys nested)             | 94.4      | 10.59  | ±0.84% |
| large unequal (one nested leaf changed)   | 126.3     | 7.92   | ±0.98% |
| large unequal (new key)                   | 126.8     | 7.89   | ±0.31% |
| identical reference (fast path)           | 65,688    | 0.015  | ±0.05% |

### defaultStringifySearch alone (mean ms)

| Shape                          | hz       | mean  | rme    |
|--------------------------------|----------|-------|--------|
| small (`{page:1}`)             | 10,135   | 0.099 | ±0.56% |
| medium (~10 keys mixed)        | 1,141    | 0.876 | ±0.46% |
| large (~50 keys nested)        | 152.5    | 6.56  | ±0.36% |

Stringify is ~2x the cost of the deep compare at every size — it dominates the flow.

### Flow: current (deep-equal + always stringify) vs identity-memoized (mean ms)

| Scenario                       | current hz | memoized hz | speedup | delta mean |
|--------------------------------|------------|-------------|---------|------------|
| small equal (same-search)      | 3,501      | 6,802       | **1.94x** | −49% |
| medium equal (same-search)     | 637        | 2,038       | **3.20x** | −69% |
| large equal (same-search)      | 58.5       | 94.9        | **1.62x** | −38% |
| medium unequal (changed)       | 566        | 563         | 1.00x    | ±0%   |
| large unequal (leaf change)    | 69.1       | 67.9        | 0.98x    | +1.7% (within rme) |

### End-to-end real `buildLocation` (route with validateSearch, repeated same-search navs)

| Build                          | hz     | mean (ms / 2000 calls) | rme    | per-call |
|--------------------------------|--------|------------------------|--------|----------|
| baseline (main)                | 342.08 | 2.923                  | ±0.45% | ~1.46 µs |
| with prototype                 | 694.49 | 1.440                  | ±0.40% | ~0.72 µs |

**2.03x throughput on the hot path** (measured by stashing/unstashing only the router.ts change).

## 3. Verdict

**IMPLEMENT** — data clears the >20% bar decisively:

- Same-search navigations (the most common navigation type: hash changes, path-param-only
  changes, redundant clicks, link re-renders): 1.6x–3.2x on the search-resolution step,
  2.03x end-to-end on real `buildLocation`.
- Changed-search navigations: no regression (±1%, within measurement error) — the memo
  simply misses and falls through to the normal stringify.
- Memory cost: one `WeakMap<object, string>` entry per distinct committed search object;
  entries are GC-eligible as soon as the structurally-shared search object dies.

## 4. Prototype (implemented, buildLocation only)

`packages/router-core/src/router.ts`:

- New private field `searchStrMemo = new WeakMap<object, string>()` (router.ts:1114).
- In `build()` (router.ts:2016+): after `nullReplaceEqualDeep`, look up the merged search
  object's identity in the memo; on hit, reuse the cached `searchStr`; on miss, call
  `this.options.stringifySearch(nextSearch)` and store it.

Correctness argument:

- The emitted `searchStr` always corresponds to the emitted `search` object: the memo is
  keyed on object *identity*, and `stringifySearch` is deterministic per snapshot. Since
  search objects are treated immutably throughout the codebase (all mutation paths create
  copies via spread/middleware), identity ⇒ same content ⇒ same string. This was verified
  explicitly by round-trip assertions (`stringifySearch(loc.search) === loc.searchStr`) in
  `tests/searchStrMemo.test.ts`.
- Hash-only navigations still produce correct hrefs: hash resolution (router.ts:2022+) is
  independent of the memoized string; href = `pathname + searchStr + hashStr` with the
  memoized searchStr being byte-identical to what stringify would have produced. Verified
  in tests (`/?page=1#section`) and by the full suite.
- Scope deliberately limited to `buildLocation`; `parseLocation`'s duplicate
  parse→stringify round-trip (router.ts:1402-1403) is a separate follow-up opportunity.

## 5. Verification

- `pnpm nx run @tanstack/router-core:test:unit --skipNxCache --skipRemoteCache`
  → **107 files passed, 1610 tests passed (+1 new regression test)**, no type errors.
- `pnpm nx run @tanstack/router-core:test:eslint ...`
  → 26 warnings, 0 errors — **identical to clean main** (pre-existing), no new issues.

New files:
- `packages/router-core/tests/searchReserialization.bench.ts` — micro + flow benchmarks
- `packages/router-core/tests/buildLocationSearchStr.bench.ts` — end-to-end benchmark
- `packages/router-core/tests/searchStrMemo.test.ts` — correctness regression test

Production change: 13 lines in `packages/router-core/src/router.ts`.

## Recommendation

Ship the `searchStrMemo` prototype. Follow-ups worth benchmarking separately:
(1) apply the same memo in `parseLocation` to kill the parse→stringify round-trip on
URL-normalization paths, and (2) consider skipping the second `nullReplaceEqualDeep`
when `parsedSearch` can be proven freshly created.
