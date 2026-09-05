# Navigation Promise overhead investigation

Baseline production commit: `07b3bc971d`. Tests and benchmark harnesses were
committed separately in `4d5896442d` and `d65e90ec19`.
Before/after measurements use identical benchmark files and
flags, temporarily restoring only the implementation under test in this worktree.

## Retained changes

- **Client chunk readiness:** combine the chunk task and its nested loader-outcome
  continuations into one async task. Catch only component-loading failures; await
  the loader outcome outside that catch. Publish readiness only after both are
  settled, with the existing success, pending-state, and cancellation checks.
- **Client completion:** remove an empty trailing `.then()` from the transaction
  completion chain.
- **Server SSR policies:** return static policy values directly. Functional
  results are assimilated with `Promise.resolve`; synchronous functional throws
  become rejected Promises so queued request cancellation still wins before
  context/error hooks run.

Client `beforeLoad`, `waitFor`, controller ownership, and public types stay
unchanged. The final patch reduces Promise allocation without assuming that an
apparently synchronous hook result can safely skip the existing wait boundary.

## Allocation results

Counts are Promise resources reported by `async_hooks` around one operation;
absolute counts include harness awaits. Each lane has a root plus eight nested
routes. The same-harness deltas are the useful result.

| Scenario                                        | Before | After | Fewer Promises |
| ----------------------------------------------- | -----: | ----: | -------------: |
| Client, no hooks/chunks                         |    147 |   119 |             28 |
| Client, eight synchronous beforeLoad hooks      |    187 |   159 |             28 |
| Client, eight Promise beforeLoad hooks          |    187 |   159 |             28 |
| Client, mixed hooks                             |    187 |   159 |             28 |
| Client, asynchronous component preloads         |    187 |   159 |             28 |
| Client, blocking loaders and component preloads |    275 |   247 |             28 |
| Server, static SSR policies                     |     68 |    50 |             18 |
| Server, synchronous functional policies         |     84 |    74 |             10 |
| Server, Promise functional policies             |     84 |    74 |             10 |
| Server, mixed policies                          |     72 |    56 |             16 |

The client saving is three Promise resources per match plus one per navigation
in these cases. **Controller allocation is unchanged.** Client loader controllers
belong to shared flights and cached data. Server controllers support request
cancellation, boundary retirement, and deferred data cleanup. A synchronous
loader return does not make those controllers disposable.

There is a separate server opportunity: fresh matching allocates controllers,
then server lane cloning allocates replacements. Removing that duplication would
need to distinguish private fresh matches from reused/exposed controllers;
blindly reusing the incoming controller is not safe for repeated loads. That
ownership change is not part of this patch.

## Candidate attribution and rejected ideas

| Independent client candidate                              | React minimal gzip delta | Decision                                  |
| --------------------------------------------------------- | -----------------------: | ----------------------------------------- |
| Skip awaiting synchronous beforeLoad results              |                     +7 B | Rejected: three regression tests fail     |
| Move chunk catch inside the async function only           |                     -2 B | Superseded by consolidated readiness task |
| Consolidate chunk and loader readiness                    |                     -5 B | Retained                                  |
| Remove completion's empty then                            |                     -5 B | Retained                                  |
| Skip Promise.all for synchronous head/scripts             |                    +18 B | Left out to limit bundle growth           |
| Clean up abort listeners in existing settlement callbacks |                     +2 B | Rejected: direct waits slowed down        |

The beforeLoad guard reads a custom `then` getter twice: once to detect it and
again during assimilation. A stateful getter resolves incorrectly on both client
and server. Removing the client await also lets a hook that queues a replacement
navigation schedule stale loader work before cancellation. All three regressions
pass with the original hook waiting behavior retained.

The listener-cleanup candidate removed one Promise per wait but added callback
work. In the same 80-wait harness, mean times regressed by 3.1% for plain values,
6.6% for fulfilled Promises, and 5.8% for rejected Promises (RME 0.12–0.42%). It
was removed despite reducing allocations. Direct-wait benchmark coverage remains
available for future alternatives.

## Bundle results

The final composition is **85,821 → 85,815 gzip bytes** in React Router minimal
(**-6 B**). Initial gzip is **85,681 → 85,676 B**; raw JS is **268,520 → 268,523 B**;
Brotli is **74,720 → 74,698 B**. Its two-file JS split is unchanged.

Across all 18 scenarios, 16 shrink, one is unchanged, and one increases by 2 B.
Gzip deltas range from **-7 to +2 B**. There are no chunk-count changes. Gzip
changes are not additive, so independent hunk results must not be summed.

| Scenario                         | Before gzip B | After gzip B | Gzip delta | Initial gzip delta | Raw delta | Brotli delta |
| -------------------------------- | ------------: | -----------: | ---------: | -----------------: | --------: | -----------: |
| react-router.minimal             |         85821 |        85815 |         -6 |                 -5 |        +3 |          -22 |
| react-router.full                |         89430 |        89425 |         -5 |                 -4 |        +3 |          +68 |
| solid-router.minimal             |         33985 |        33982 |         -3 |                 -3 |        +3 |          +47 |
| solid-router.full                |         38927 |        38921 |         -6 |                 -5 |        +3 |          +44 |
| vue-router.minimal               |         50706 |        50700 |         -6 |                 -5 |        +3 |          +13 |
| vue-router.full                  |         56457 |        56453 |         -4 |                 -4 |        +3 |           -2 |
| react-start.minimal              |         99061 |        99063 |         +2 |                 +1 |        +3 |          -42 |
| react-start.query-integration    |        106571 |       106569 |         -2 |                 -3 |        +3 |          -66 |
| react-start.deferred-hydration   |         99804 |        99797 |         -7 |                  0 |        +3 |          -77 |
| react-start.full                 |        102303 |       102301 |         -2 |                 -3 |        +3 |          +23 |
| react-start.rsbuild.minimal      |        102446 |       102444 |         -2 |                 -2 |        +2 |          +50 |
| react-start.rsbuild.minimal-iife |        102856 |       102856 |          0 |                  0 |        +2 |          -46 |
| react-start.rsbuild.full         |        105840 |       105837 |         -3 |                 -3 |        +2 |         -158 |
| solid-start.minimal              |         47143 |        47138 |         -5 |                 -5 |        +3 |          +89 |
| solid-start.deferred-hydration   |         50295 |        50293 |         -2 |                 -5 |        +3 |           +7 |
| solid-start.full                 |         52342 |        52341 |         -1 |                 -4 |        +3 |          +31 |
| vue-start.minimal                |         67241 |        67238 |         -3 |                  0 |        +3 |           -9 |
| vue-start.full                   |         71150 |        71147 |         -3 |                 -4 |        +3 |          -57 |

## Timing results and limits

All times below are milliseconds per batch of ten navigations or server loads.
These are warm in-process microbenchmarks, not browser latency measurements.
The synchronous/mixed client and blocking-loader means have substantial outliers;
**do not interpret the mean deltas as a general navigation speedup or slowdown**.
For those cases, allocation counts are firmer evidence than timing. Static SSR
improved about 3% in the sampled runs with low within-run RME; that remains a
single-machine result.

| Case                        | Before mean ms | After mean ms | Mean delta | Before / after RME |
| --------------------------- | -------------: | ------------: | ---------: | -----------------: |
| Client: none beforeLoad     |         0.2718 |        0.2631 |      -3.2% |      2.84% / 2.62% |
| Client: sync beforeLoad     |         0.3549 |        0.3307 |      -6.8% |     12.84% / 8.71% |
| Client: async beforeLoad    |         0.3212 |        0.3063 |      -4.6% |      1.03% / 1.02% |
| Client: mixed beforeLoad    |         0.3152 |        0.3382 |       7.3% |     1.18% / 16.14% |
| Client: chunks beforeLoad   |         0.3283 |        0.2749 |     -16.3% |     18.30% / 0.99% |
| Client: blocking beforeLoad |         0.9235 |        0.9057 |      -1.9% |      7.81% / 5.42% |
| Server: static server hooks |         0.1263 |        0.1226 |      -2.9% |      0.30% / 0.34% |
| Server: sync server hooks   |         0.1435 |        0.1381 |      -3.7% |      0.47% / 0.37% |
| Server: async server hooks  |         0.1406 |        0.1390 |      -1.1% |      0.58% / 0.76% |
| Server: mixed server hooks  |         0.1348 |        0.1334 |      -1.1% |      1.13% / 1.30% |

<details>
<summary>Sampling details (times in milliseconds)</summary>

| Case                                 |     Hz |     SD | Median |    p99 |    p999 | Samples |
| ------------------------------------ | -----: | -----: | -----: | -----: | ------: | ------: |
| Client: none beforeLoad (Before)     | 3679.7 | 0.2921 | 0.2497 | 0.9792 |  1.8268 |    5520 |
| Client: none beforeLoad (After)      | 3800.4 | 0.2658 | 0.2420 | 0.4923 |  1.9607 |    5703 |
| Client: sync beforeLoad (Before)     | 2817.5 | 1.5111 | 0.3077 | 1.3887 |  3.0216 |    4227 |
| Client: sync beforeLoad (After)      | 3024.1 | 0.9898 | 0.2955 | 1.1453 |  1.8660 |    4537 |
| Client: async beforeLoad (Before)    | 3113.6 | 0.1151 | 0.3024 | 1.1680 |  1.5653 |    4671 |
| Client: async beforeLoad (After)     | 3264.4 | 0.1116 | 0.2907 | 1.1553 |  1.6467 |    4897 |
| Client: mixed beforeLoad (Before)    | 3172.3 | 0.1311 | 0.2977 | 1.3473 |  1.6404 |    4759 |
| Client: mixed beforeLoad (After)     | 2956.9 | 1.8543 | 0.2916 | 1.3904 |  1.8401 |    4436 |
| Client: chunks beforeLoad (Before)   | 3046.0 | 2.0724 | 0.2674 | 2.4513 |  2.8285 |    4569 |
| Client: chunks beforeLoad (After)    | 3637.6 | 0.1026 | 0.2614 | 1.1515 |  1.3950 |    5457 |
| Client: blocking beforeLoad (Before) | 1082.8 | 1.4826 | 0.7633 | 6.9268 | 12.0854 |    1625 |
| Client: blocking beforeLoad (After)  | 1104.1 | 1.0201 | 0.7586 | 8.3123 |  9.4379 |    1657 |
| Server: static server hooks (Before) | 7919.3 | 0.0208 | 0.1228 | 0.2827 |  0.3400 |   11879 |
| Server: static server hooks (After)  | 8158.7 | 0.0235 | 0.1194 | 0.2931 |  0.3859 |   12238 |
| Server: sync server hooks (Before)   | 6970.9 | 0.0353 | 0.1367 | 0.2933 |  0.5290 |   10457 |
| Server: sync server hooks (After)    | 7241.7 | 0.0271 | 0.1336 | 0.2879 |  0.4732 |   10863 |
| Server: async server hooks (Before)  | 7113.7 | 0.0433 | 0.1356 | 0.3400 |  0.4499 |   10671 |
| Server: async server hooks (After)   | 7196.3 | 0.0559 | 0.1335 | 0.3129 |  0.5320 |   10795 |
| Server: mixed server hooks (Before)  | 7416.7 | 0.0817 | 0.1270 | 0.2965 |  0.5972 |   11126 |
| Server: mixed server hooks (After)   | 7497.8 | 0.0935 | 0.1236 | 0.2864 |  0.8237 |   11247 |

</details>

Each benchmark case samples for 1.5 seconds after 0.3 seconds of warmup. Client
and server cases batch ten operations; direct wait cases batch 80 waits on one
signal. Setup, assertions, and Promise instrumentation run outside timing. The
client harness asserts repeated chunk preload calls and includes a forced
blocking-loader case. Server cases isolate static and functional SSR policies
without beforeLoad work obscuring attribution.

Run the three files independently through:

`CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-core:test:unit --outputStyle=stream --skipRemoteCache -- bench tests/<file>.bench.ts --run --outputJson=<output>`

Files: `navigation-awaitable`, `server-awaitable`, `navigation-wait`.

Named bundle runs are under `benchmarks/bundle-size/results/runs/`:
`navigation-before` and `navigation-flat-full` hold the complete comparison;
`navigation-flat-alone` and `navigation-completion` isolate retained client
hunks. `navigation-final-before` repeats the original minimal bundle result.
Timing JSON and logs are in `/tmp/router-navigation-investigation/`, with final
client results named `client-final-before` / `client-final-after` and final
server results `server-before` / `server-final`.

## Validation

- Before: 1,717 core tests passed, four existing expected failures; the additional
  queued SSR cancellation test also passed separately on the original source.
- After: 1,718 core tests passed, four existing expected failures.
- Router-core type checks: TypeScript 5.6, 5.7, 5.8, 5.9, 6, and 7 passed.
- Router-core ESLint: no errors; 26 existing warnings.
- React pending/presentation regression tests: 27 passed.
- React Router Chromium redirect tests: 33 passed.
- React Start Vite SSR head and hydration tests: three passed.
- Prettier and `git diff --check` passed.

CI will provide the broader correctness and performance check: full unit and
E2E coverage, bundle-size comparisons, and CodSpeed CPU simulation benchmarks
for client navigation and SSR. CodSpeed memory benchmarks are excluded from
the performance assessment.
