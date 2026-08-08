# Synchronous client-lane optimization

## Before

Production implementation: `4fa1df75402c09f350056a68c261d35177984b00`
Tests and benchmark: `443dfc883d`

### Correctness

- The focused unit run had 25 passing tests and the new architectural
  assertion failed as expected: baseline `waitFor` wraps a synchronous value
  in a Promise and subscribes it to cancellation.
- The queued-abort and pending-Promise cleanup regressions passed.

### Focused runtime benchmark

| Case                                                              |      Mean |       p75 |       p99 |   RME | Samples |
| ----------------------------------------------------------------- | --------: | --------: | --------: | ----: | ------: |
| 80 waits for synchronous values                                   | 0.0222 ms | 0.0231 ms | 0.0343 ms | 0.13% | 134,865 |
| 10 eager loaderless navigations                                   | 0.5901 ms | 0.5973 ms | 1.1069 ms | 0.41% |   5,084 |
| 10 retained loaderless navigations                                | 0.5191 ms | 0.5243 ms | 1.0596 ms | 0.42% |   5,779 |
| 10 navigations through 8 synchronous `beforeLoad` routes          | 0.6411 ms | 0.6452 ms | 1.1410 ms | 0.40% |   4,680 |
| 10 navigations through alternating sync/async `beforeLoad` routes | 0.6363 ms | 0.6396 ms | 1.1109 ms | 0.38% |   4,715 |
| 10 navigations through 8 resolved async `beforeLoad` routes       | 0.6445 ms | 0.6421 ms | 1.3004 ms | 0.64% |   4,655 |
| 10 navigations through 8 synchronous loader routes                | 1.0535 ms | 1.0021 ms | 3.1143 ms | 4.80% |   2,848 |

The synchronous-loader case is smoke coverage only because of its high
variance and long-tail outliers.

### Bundle

`react-router.minimal`: gzip 85,919 B; initial gzip 85,778 B; raw 268,915 B;
Brotli 74,684 B.

## After

### Correctness

- The same focused unit run passes all 26 tests, including the baseline-failing
  synchronous bridge assertion.

### Focused runtime benchmark

| Case                                                              |      Mean | Change |       p75 |       p99 |   RME | Samples |
| ----------------------------------------------------------------- | --------: | -----: | --------: | --------: | ----: | ------: |
| 80 waits for synchronous values                                   | 0.0035 ms | -84.2% | 0.0034 ms | 0.0073 ms | 0.10% | 861,211 |
| 10 eager loaderless navigations                                   | 0.6033 ms |  +2.2% | 0.6062 ms | 1.3068 ms | 0.73% |   4,973 |
| 10 retained loaderless navigations                                | 0.5201 ms |  +0.2% | 0.5256 ms | 1.1503 ms | 0.45% |   5,768 |
| 10 navigations through 8 synchronous `beforeLoad` routes          | 0.6223 ms |  -2.9% | 0.6230 ms | 1.2910 ms | 0.47% |   4,821 |
| 10 navigations through alternating sync/async `beforeLoad` routes | 0.6285 ms |  -1.2% | 0.6291 ms | 1.2953 ms | 0.45% |   4,774 |
| 10 navigations through 8 resolved async `beforeLoad` routes       | 0.6422 ms |  -0.4% | 0.6434 ms | 1.3423 ms | 0.48% |   4,672 |
| 10 navigations through 8 synchronous loader routes                | 1.0559 ms |  +0.2% | 1.0163 ms | 2.9400 ms | 3.83% |   2,842 |

The direct bridge result is high confidence. Navigation results are directional:
the synchronous `beforeLoad` case improved while the loaderless case moved in
the opposite direction, so broader alternating runs are used as smoke evidence
rather than an exact percentage claim.

### Bundle

`react-router.minimal`: gzip 85,922 B (+3 B); initial gzip 85,781 B (+3 B);
raw 268,955 B (+40 B); Brotli 74,706 B (+22 B).

### Existing client-nav scenario

The exact baseline and H1-only production bundles were alternated through the
React `nested-params` scenario in B→A, A→B, and B→A order.

| Metric | Baseline average | After average | Change |
| ------ | ---------------: | ------------: | -----: |
| Mean   |        5.7912 ms |     5.7436 ms | -0.82% |
| p75    |        5.9354 ms |     5.8879 ms | -0.80% |
| p99    |        6.8612 ms |     6.7377 ms | -1.80% |

All three mean pairs favored the candidate (+0.19%, +1.86%, and +0.41%). Each
individual run had 1,711–1,743 samples and 0.25–0.26% RME, so this supports a
small end-to-end improvement without treating 0.82% as a guaranteed effect.

### Full bundle suite

All affected scenarios stayed within +1 to +8 gzip bytes. The largest deltas
were `react-start.deferred-hydration` and `react-start.minimal` at +8 B;
`react-router.full` and `vue-start.full` were +7 B. Every emitted scenario grew
by the same 40 raw bytes, with Brotli deltas ranging from -207 B to +162 B.

### Final validation

- Router-core unit suite: 105 files, 1,539 passed, 3 expected failures.
- Router-core type suite: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed.
- Router-core ESLint target: passed with 26 pre-existing warnings and no errors.
- React basic-file-based redirect E2E: 33 Chromium cases passed, including
  navigation, preloading, direct visits, and `beforeLoad` redirects.
