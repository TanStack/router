# Route match frame depth optimization

The same focused checks were run with the production implementation stashed
(BEFORE) and restored (AFTER). The behavior test and benchmark were present in
both runs.

## BEFORE

- Router-core unit test: `170 passed`, including
  `new-process-route-tree.test.ts`.
- Router-core type tests: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed.
- `react-router.minimal`: gzip `89,200`, initial gzip `89,058`, raw `275,591`,
  brotli `77,742` bytes.

Focused `findSingleMatch` benchmark (100 matches per sample):

| Case                  |      Mean |       p99 |   RME | Samples |
| --------------------- | --------: | --------: | ----: | ------: |
| Deep static           | 0.0348 ms | 0.0731 ms | 0.35% |  14,361 |
| All optionals present | 1.2670 ms | 1.5016 ms | 0.74% |     395 |
| All optionals skipped | 0.0909 ms | 0.1523 ms | 0.41% |   5,502 |
| Mixed optionals       | 0.9191 ms | 1.2922 ms | 0.92% |     544 |

## AFTER

- Router-core unit test: `170 passed`, including
  `new-process-route-tree.test.ts`.
- Router-core type tests: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed.
- `react-router.minimal`: gzip `89,164` (`-36`), initial gzip `89,023`
  (`-35`), raw `275,481` (`-110`), brotli `77,653` (`-89`) bytes.

Focused `findSingleMatch` benchmark (100 matches per sample):

| Case                  |      Mean |       p99 |   RME | Samples | Mean change |
| --------------------- | --------: | --------: | ----: | ------: | ----------: |
| Deep static           | 0.0347 ms | 0.0655 ms | 0.34% |  14,415 |       -0.3% |
| All optionals present | 1.2458 ms | 1.4979 ms | 0.80% |     402 |       -1.7% |
| All optionals skipped | 0.0894 ms | 0.1504 ms | 0.40% |   5,595 |       -1.7% |
| Mixed optionals       | 0.8908 ms | 1.1101 ms | 0.74% |     562 |       -3.1% |

No measured case regressed. The sub-1% RME and sample counts make the mixed
optional improvement the clearest result; the smaller changes should be read as
directional.

## Final validation

- Full bundle matrix: all 17 scenarios improved in gzip by 29–54 bytes and in
  raw output by 90–110 bytes. Initial gzip improved in every scenario.
- Brotli deltas ranged from `-115` to `+127` bytes across differently chunked
  applications; gzip is the benchmark's primary metric, and the underlying raw
  output decreased everywhere.
- Router-core unit suite: 105 files passed; 1,524 tests passed and 3 expected
  failures remained expected.
- Router-core ESLint: 0 errors (26 pre-existing warnings).
- React Router nested-pathless-layout e2e: 3 tests passed.
