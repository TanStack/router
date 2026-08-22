# RESULT — perf/task8-wildcard-suffix-offsets

## Verdict: IMPLEMENTED (both gates pass)

Offset-based wildcard suffix comparison in `getNodeMatch`
(`packages/router-core/src/new-process-route-tree.ts`) replacing
`parts.slice(index).join('/').slice(-suffix.length)` with a direct comparison
against the tail of `path`, using a per-candidate integer offset loop.

## Bundle-size gate (react-router.minimal)

| Build            | gzip    | delta vs baseline |
| ---------------- | ------- | ----------------- |
| baseline (HEAD)  | 85864   | —                 |
| change (v1, helper + offsets array) | 85921 | **+57** (fails ±20) |
| change (v2, final: inline int loop) | 85882 | **+18** (passes ±20) |

Brotli: 74780 → 74746 (−34). Raw: 269091 → 269147 (+56).

## Worst-case benchmark (`tests/wildcard-suffix.perf.test.ts`, gated by RUN_BACKPRESSURE_PERF=1)

Tree with one trie node holding 8 suffixed-wildcard candidates (all evaluated
per frame); URLs ~200 chars / ~46 segments; `matchCache.clear()` between
iterations to measure matching itself.

| Workload                        | before (old) | after (new) | speedup |
| ------------------------------- | ------------ | ----------- | ------- |
| worst-case miss (~200ch URL)    | 0.46us/match | 0.17us/match | **2.7x** |
| worst-case hit (~200ch URL)     | 0.48us/match | 0.21us/match | **2.3x** |
| realistic mix (~40ch URL)       | 0.46us/match | 0.31us/match | 1.5x    |

Gate was >30%; achieved ~63% time reduction on the worst case.

Note: an earlier bench iteration showed no difference because
`findRouteMatch` memoizes per path via `matchCache`; numbers above bypass it.
The quadratic cost also requires many *segments* after the split point (not
just many characters in one segment).

## Correctness

- `tests/wildcard-suffix-differential.test.ts`: old implementation vendored as
  `tests/wildcard-suffix-fixture.old.ts`; 20,000+ generated tree/path/fuzzy
  comparisons (seeded PRNG) plus explicit edge cases (case-insensitivity,
  suffix containing '/', remainder shorter than suffix, trailing slash,
  empty suffix) — identical route ids and rawParams throughout.
- Full suite: router-core `test:unit` 107 files / 1608 tests passed,
  `test:eslint` and `test:types` passed.

## Semantics equivalence

`path.split('/')` then `parts.slice(index).join('/')` exactly reconstructs the
substring of `path` starting at `index + sum(len(parts[0..index-1]))`. The old
`.slice(-suffix.length)` yields the whole remainder when it is shorter than
the suffix (length mismatch ⇒ never equals); the new `endPos < start` check is
equivalent. Case-insensitive path lowercases only the extracted tail in both
versions. Suffixes containing '/' operate on the raw path in both versions.
