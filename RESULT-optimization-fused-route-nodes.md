# Fused dynamic route-node construction

Baseline: `main` at `697ebb6ddbd433d052b6b4707938a5c595865d58`.

## Bundle result

`react-router.minimal`:

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| gzip | 89,200 B | 89,145 B | -55 B |
| initial gzip | 89,058 B | 89,004 B | -54 B |
| raw | 275,591 B | 274,715 B | -876 B |
| Brotli | 77,742 B | 77,571 B | -171 B |

All 17 bundle scenarios improved in gzip by 55–125 B and in raw size by
870–904 B. Initial gzip improved by 54–125 B. Brotli changed by -180 to
+83 B; 6 of 17 scenarios had a small Brotli regression despite the raw and
gzip reductions.

Hunk-level gzip attribution on `react-router.minimal`:

| Change | Isolated/cumulative change |
| --- | ---: |
| Record only dynamic sibling lists that need sorting | -16 B isolated |
| Cache parsed route fields | -1 B isolated |
| First two changes together | -19 B cumulative |
| Fuse required, optional, and wildcard construction | -36 B incremental |
| Complete group | -55 B cumulative |

Compression is nonlinear, so the isolated figures do not add exactly.

## Construction benchmark

Each value is the median mean time, in milliseconds, from three runs. Every
sample builds the tree ten times.

| Cumulative stage | Mostly static | Dense dynamic | Reused dynamic shape | Route masks |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 0.8106 | 0.6019 | 0.8167 | 0.0245 |
| Sparse sorting | 0.7658 | 0.5813 | 0.8007 | 0.0224 |
| Cached route fields | 0.7607 | 0.5686 | 0.7964 | 0.0222 |
| Fused construction | 0.7853 | 0.5785 | 0.8005 | 0.0224 |

The complete group was approximately 3.1%, 3.9%, 2.0%, and 8.6% faster than
baseline across those workloads. The fusion hunk alone moved the cumulative
median by +0.5% to +3.2%, so it should be treated as a size optimization, not
as an independent runtime-performance improvement.

## Correctness coverage

- Required, optional, and wildcard parser priorities are sorted only after
  parser metadata is assigned, including parser rejection and fallback.
- Same-shape required and optional nodes without parsers remain reusable.
- Same-shape wildcard aliases remain separate match candidates.
- Route-mask dynamic, optional, and wildcard sibling lists are sorted by
  specificity and can be run independently.
- Construction benchmarks validate representative matches and the sorted
  sibling arrays before collecting timing samples.

Validation passed:

- Router-core unit tests: 1,529 passed and 3 expected failures.
- Router-core type tests across all configured TypeScript versions.
- Router-core ESLint (no errors; existing warnings remain).
- React Router generator CLI end-to-end suite: 3 passed.
- Full 17-scenario bundle-size matrix.
