# Ready-route promise overhead

This proposal removes redundant promise work from client navigation. It keeps
asynchronous chunk invocation, waits for real chunk promises, and preserves
cancellation and error handling.

The production changes are confined to `packages/router-core/src/load-client.ts`:

1. Remove the `finally` adoption work after `waitFor`'s native resolve/reject
   callbacks. Both callbacks return normally, so the cleanup chain fulfills even
   when the returned wait rejects.
2. Attach the loader settlement continuation only when a blocking loader actually
   runs. Ready data and already-normalized reload failures need no such callback.
3. Add a cancellable chunk wait only when `loadRouteChunk` returns a promise.
   Keep the deferred call and common error normalization.

Baseline production implementation: `2f9150309bc472f4a75cbe98adcdb50c76b12c7a`.
Test/benchmark commits `985a611a46` and `1ef2d676d8` precede the implementation.
The baseline worktree contains the same fixtures and regression tests.

## Measurement protocol

- Apple M3 Max, arm64, macOS; Node 25.8.1 and Chromium 149.0.7827.55.
  Production, minified client bundles.
- Each sample group runs in a fresh Node process, or a fresh Chromium process
  with production React. Each process loads only one implementation.
- Twelve independent pairs per primary case, balanced AB/BA order. Three warmup
  batches precede three measured batches. Node calibrates batches to roughly
  350 ms; browser batches contain 3,000 navigations.
- Navigation loops contain no assertions, testing-library calls, jsdom, fake
  timers, or per-navigation Playwright RPC. Untimed checks after every batch
  verify the final state and exact loader/preload counts. React also verifies
  rendered events, DOM data/params, and the single warmed lazy import.
- Timed batches drain remaining microtasks before stopping the clock. Browser
  measurements cover navigation completion and React commits, **not paint or
  click-to-frame latency**.
- Report paired geometric mean ratios and 95% bootstrap intervals from 10,000
  resamples of independent pairs. Within-process batches are not treated as
  independent observations. CPU time is a secondary Node metric.
- Byte-identical A/A controls measure false-positive behavior. A second cached
  Node run reverses the implementation labels. All measured runs are retained;
  no outliers or unfavorable cases are discarded.
- Promise/listener counts run separately, in processes that never produce timing
  samples. `async_hooks` changes Promise execution and must not contaminate the
  latency comparison. Counts describe instrumented PROMISE resources, not heap
  bytes or a direct production GC measurement.
- Cases cover eager routes, cached loaders, synchronous loaders, fulfilled async
  loaders, always-pending chunks, an 80% ready / 20% pending chunk mix, and
  timer-delayed loaders. Depth includes the root match. Browser lazy routes use
  the actual `lazyRouteComponent` API after its first import.

The earlier jsdom-based percentage claim is withdrawn: its paired samples were
inconsistent and drifted over time. The measurements below supersede it. Small
positive percentages are not sufficient proof: the controls themselves can show
an apparent improvement. These are single-machine, V8-family results; they do
not establish a universal application speedup or a cross-engine result.

## Validation

Before implementation, router-core has 1,674 passing unit tests and 4 expected
failures; react-router has 1,037 passing unit tests and 1 skip. Both packages pass
their TypeScript 5.6–7.0 suites and lint. All 14 Vitest benchmark cases execute
successfully, and the baseline full bundle run completes all 18 scenarios.

The initial implementation passed the same unit counts, TypeScript suites, and
lint targets with `--skipNxCache`. The React browser fixture passes its type check,
and the production React basic e2e suite passes all 24 Chromium tests. All 14
Vitest benchmark cases pass again.

New regression cases exercise cached parents observed immediately by child
loaders, errors selected by `onError`, cached data waiting for new chunks,
chunk rejection, synchronous preload throws and retries, external navigation while a component chunk is pending, late chunk rejection
after cancellation, abort-listener cleanup,
and thenables with a throwing `then` getter.

## Runtime results

Positive percentages mean faster. Times are microseconds per navigation (except
`waitFor`, which is per wait); intervals are paired bootstrap 95% intervals.

| Node case                                  |  Before |   After | Improvement |     95% interval |
| ------------------------------------------ | ------: | ------: | ----------: | ---------------: |
| No loaders, 2 matches                      |   21.48 |   20.69 |       3.64% |   2.18% to 4.88% |
| Cached loaders, 8 matches                  |   40.91 |   38.76 |       5.25% |   3.75% to 6.61% |
| Cached loaders, reversed-label replication |   39.53 |   37.35 |       5.52% |   4.55% to 6.52% |
| Synchronous loaders, 8 matches             |   92.79 |   92.33 |       0.58% |  -2.01% to 3.12% |
| Fulfilled async loaders, 8 matches         |   93.76 |   89.41 |       4.61% |   1.19% to 8.22% |
| Always-pending chunks, 8 matches           |   40.76 |   40.20 |       1.36% |   0.19% to 2.42% |
| 80% ready / 20% pending chunks, 8 matches  |   40.89 |   38.61 |       5.52% |   3.97% to 6.99% |
| Timer-delayed loaders, 8 matches           | 1571.73 | 1554.56 |       1.15% |  -6.51% to 9.04% |
| Direct fulfilled `waitFor`                 |   0.251 |   0.193 |      23.10% | 21.29% to 24.87% |

The cached Node case improves by 5.25% in the primary run and 5.52% with labels
reversed. CPU improvements also replicate: 5.15% and 5.09%. Baseline wall-time
coefficients of variation are 2.23% and 2.53%. The replication's individual pairs
all favor the change (3.11%–8.47%).

| Production React in Chromium                     | Before | After | Improvement |   95% interval |
| ------------------------------------------------ | -----: | ----: | ----------: | -------------: |
| Eager, cached loaders, 2 matches                 |  30.50 | 29.93 |       1.84% | 0.67% to 3.12% |
| Warmed lazy component, cached loaders, 8 matches |  63.02 | 59.91 |       4.93% | 4.20% to 5.74% |

The deeper browser case has a 1.16% baseline coefficient of variation and all
12 pairs favor the change (3.27%–8.02%). This independent production React
measurement supports the cached core result. The shallow browser effect is too
close to control noise to claim a speedup.

| Byte-identical A/A control      | Apparent improvement |    95% interval |
| ------------------------------- | -------------------: | --------------: |
| Node cached, 8 matches          |                2.07% |  0.20% to 3.92% |
| Chromium eager, 2 matches       |                1.00% |  0.30% to 1.74% |
| Chromium warmed lazy, 8 matches |               -0.22% | -0.88% to 0.35% |

The first two controls produce false-positive intervals despite identical code.
Consequently, the defensible headline is **about 5% lower navigation-completion
cost in the measured deeply cached routes**, supported by reversed-label
replication and production Chromium. No speedup is claimed for shallow React,
synchronous loaders, or always-pending chunks. Timer-delayed loads are too noisy
to resolve a change: their 13.8% baseline wall-time variation and 42.6% CPU
variation make that row a smoke test only. No tail-latency claim is made.

## Work removed

Separately instrumented counts over 100 navigations/waits, including the same
fixed harness overhead in both variants:

| Case                             | PROMISE resources before → after | Abort listener registrations before → after |
| -------------------------------- | -------------------------------: | ------------------------------------------: |
| No loaders, 2 matches            |                    8,101 → 6,701 |                                     200 → 0 |
| Cached loaders, 8 matches        |                  20,101 → 14,501 |                                     800 → 0 |
| Synchronous loaders, 8 matches   |                  27,801 → 20,801 |                                 1,500 → 700 |
| Always-pending chunks, 8 matches |                  21,501 → 18,001 |                                   800 → 700 |
| Mixed chunks, 8 matches          |                  20,381 → 15,201 |                                   800 → 140 |
| Direct `waitFor`                 |                        804 → 504 |                                   100 → 100 |

Thus a cached navigation with eight matches removes 56 PROMISE resources and
eight abort-listener registrations in this diagnostic. Pending chunks continue
to register their cancellation listeners. The timing claim comes from the
uninstrumented runs, not these counts.

## Independent hunk attribution

Each hunk was also bundled alone against the same baseline and measured in six
fresh-process pairs of the cached eight-match case. These exploratory timings
are not additive and are not substituted for the full-candidate replications.

| Hunk alone                    | Cached time change |    95% interval | PROMISE resources removed per navigation | React minimal gzip delta |
| ----------------------------- | -----------------: | --------------: | ---------------------------------------: | -----------------------: |
| `waitFor` cleanup             |       0.64% faster | -1.90% to 2.63% |                                       24 |                     -2 B |
| Conditional loader settlement |       1.22% faster |  0.37% to 2.09% |                                        8 |                     -7 B |
| Conditional chunk wait        |       7.45% faster |  5.03% to 9.81% |                                       48 |                    +10 B |
| All three                     |       5.25% faster |  3.75% to 6.61% |                                       56 |                     +3 B |

The cleanup hunk also accounts for the separately measured 23.10% direct-wait
improvement. Cleanup and settlement reduce gzip size as well as redundant work;
the chunk hunk provides the main ready-route improvement. Removing its wait also
removes work affected by the cleanup hunk, explaining overlapping promise counts.
All three are retained. The final composition is unchanged from the full
candidate used for the primary and replication runs.

## Reproduction and raw data

The committed JSON files in
[`scripts/benchmarks/ready-routes/results`](scripts/benchmarks/ready-routes/results)
contain every measured batch, variant bundle SHA-256 hashes, controls, and the
reversed-label replication. `core-reverse.json` preserves the original labels;
`core-replication.json` contains the same observations relabeled before/after for
the summary command. Use only one of these when combining observations.

Create a separate baseline worktree at test-only commit `1ef2d676d8`, install with
the same lockfile, and keep the final implementation in the candidate worktree.
Run the commands sequentially on an otherwise idle machine:

```sh
node scripts/benchmarks/ready-routes/compare.mjs --base /path/to/baseline --candidate . --output /tmp/ready-core --pairs 12
node scripts/benchmarks/ready-routes/compare.mjs --base /path/to/baseline --candidate . --output /tmp/ready-core-control --cases cached:8 --pairs 12 --control
node scripts/benchmarks/ready-routes/compare.mjs --base . --candidate /path/to/baseline --output /tmp/ready-core-reverse --cases cached:8 --pairs 12
node scripts/benchmarks/ready-routes/browser.mjs --base /path/to/baseline --candidate . --output /tmp/ready-browser --pairs 12 --iterations 3000
node scripts/benchmarks/ready-routes/browser.mjs --base /path/to/baseline --candidate . --output /tmp/ready-browser-control --pairs 12 --iterations 3000 --control
node scripts/benchmarks/ready-routes/summarize.mjs /tmp/ready-core/samples.json /tmp/ready-browser/samples.json
```

The browser script requires the repository's Playwright Chromium installation.
For hunk attribution, apply only the selected hunk to a copy of baseline
`load-client.ts` and pass that file using `--candidate-source /path/to/hunk.ts`.
The source override applies only to that module during bundling.

Run allocation diagnostics in separate processes, after timing is finished:

```sh
node scripts/benchmarks/ready-routes/allocations.mjs /tmp/ready-core/base.mjs cached 8
node scripts/benchmarks/ready-routes/allocations.mjs /tmp/ready-core/candidate.mjs cached 8
```

For bundle size, run this in each worktree and save each `current.json` before
running the other version:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build --outputStyle=stream --skipRemoteCache --skipNxCache > /tmp/ready-bundle.log 2>&1
pnpm benchmark:bundle-size:diff --baseline /path/to/baseline-current.json
```

## Full bundle comparison

All 18 scenarios were rebuilt in both worktrees using the repository's actual
production bundle benchmark. Values below count **all emitted JavaScript**,
including lazy chunks. Byte deltas are after minus before.

| Scenario                         | Gzip before | Gzip after | Gzip delta | Initial gzip delta | Raw delta | Brotli delta |
| -------------------------------- | ----------: | ---------: | ---------: | -----------------: | --------: | -----------: |
| react-router.minimal             |      85,772 |     85,775 |         +3 |                 +3 |        -4 |          +12 |
| react-router.full                |      89,362 |     89,365 |         +3 |                 +2 |        -4 |          +72 |
| solid-router.minimal             |      33,926 |     33,928 |         +2 |                 +4 |        -4 |          -32 |
| solid-router.full                |      38,868 |     38,876 |         +8 |                 +6 |        -4 |          +76 |
| vue-router.minimal               |      50,635 |     50,640 |         +5 |                 +4 |        -4 |          -24 |
| vue-router.full                  |      56,396 |     56,394 |         -2 |                 +1 |        -4 |          +28 |
| react-start.minimal              |      99,000 |     98,996 |         -4 |                 +0 |        -4 |           -2 |
| react-start.query-integration    |     106,513 |    106,513 |         +0 |                 +1 |        -4 |          -69 |
| react-start.deferred-hydration   |      99,743 |     99,742 |         -1 |                 +0 |        -4 |         -108 |
| react-start.full                 |     102,230 |    102,231 |         +1 |                 +1 |        -4 |          +37 |
| react-start.rsbuild.minimal      |     102,351 |    102,350 |         -1 |                 -1 |        -5 |           -1 |
| react-start.rsbuild.minimal-iife |     102,762 |    102,761 |         -1 |                 -1 |        -5 |          -35 |
| react-start.rsbuild.full         |     105,749 |    105,748 |         -1 |                 -1 |        -5 |         +159 |
| solid-start.minimal              |      47,074 |     47,082 |         +8 |                 +4 |        -4 |          +65 |
| solid-start.deferred-hydration   |      50,241 |     50,241 |         +0 |                 +1 |        -4 |          +23 |
| solid-start.full                 |      52,282 |     52,282 |         +0 |                 +1 |        -4 |          -20 |
| vue-start.minimal                |      67,186 |     67,189 |         +3 |                 +3 |        -4 |          -37 |
| vue-start.full                   |      71,095 |     71,098 |         +3 |                 +4 |        -4 |          -44 |

React Router adds 3 gzip bytes in both scenarios while raw JavaScript shrinks by
4 bytes. Across all scenarios, gzip changes range from -4 to +8 bytes; the
largest proportional increase is 0.021% (Solid Router full). JavaScript file
counts are unchanged. Brotli compression is more sensitive to the changed code
layout: its largest increase is 159 bytes in React Start rsbuild full; its
largest decrease is 108 bytes in React Start deferred hydration. Complete
per-file metrics are included in `results/bundles.json`.

This is a small, explicit exception to strict zero bundle growth: approximately
5% lower completion cost in the validated cached cases for 3 gzip bytes in React
Router and no more than 8 gzip bytes in any measured scenario. No dependency or
new runtime helper is added. The tradeoff does not rely on a claimed universal
speedup or on the noisy shallow-navigation results.

Validation commands (run one Nx invocation at a time):

```sh
CI=1 NX_DAEMON=false pnpm nx run-many --targets=test:unit,test:types,test:eslint --projects=@tanstack/router-core,@tanstack/react-router --outputStyle=stream --skipRemoteCache --skipNxCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:types:react --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run tanstack-router-e2e-react-basic:test:e2e --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-core:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- bench tests/ready-routes.bench.ts
```

## Follow-up: undefined navigation inside component preload

Navigation initiated from inside a component preload is undefined behavior.
The two parameterized cases asserting that behavior were removed. They had not
required a dedicated production branch, so deleting them alone made no runtime
logic redundant. A supported simultaneous synchronous loader/preload failure
test was added instead, verifying that the loader error retains precedence.
The benchmark fixture also now includes async loaders combined with pending
component chunks (`async-chunks`).

An immediate async wrapper was investigated as an alternative to the deferred
chunk invocation. It conditionally awaited `waitFor` and used the same error
normalization. It passed the existing core/React unit, type, and lint checks.
Separately instrumented counts confirmed one fewer PROMISE resource per match
in cached, pending-chunk, and combined async-loader/pending-chunk workloads.
Its 18-scenario bundle run reduced raw JS by 26 bytes everywhere; gzip deltas
relative to the current PR ranged from -11 to 0 bytes, including -9 bytes for
React Router minimal and 0 bytes for React Router full.

However, a fresh-process comparison against the current PR did **not** establish
an additional runtime benefit:

| Immediate wrapper vs current PR              | Pairs |     Time improvement | 95% paired bootstrap interval |
| -------------------------------------------- | ----: | -------------------: | ----------------------------: |
| Cached loaders, 8 matches                    |     6 |               +1.69% |              -0.60% to +5.53% |
| Pending chunks, cached loaders, 8 matches    |     6 |               -1.97% |              -6.02% to +1.11% |
| Async loaders plus pending chunks, 8 matches |     6 |               -1.44% |              -2.41% to -0.30% |
| Combined workload, reversed-label repeat     |    12 | approximately -1.04% |   Inconclusive; includes zero |

The combined workload leaned slower in both comparisons, but the noisier repeat
could not establish a regression. This is a reason to avoid claiming a win, not
proof of a slowdown. The candidate also retained a 4.08% Chromium gain relative
to unoptimized main [3.37%, 4.83%], which does not establish an improvement over
the current PR. Its main-to-candidate Node wall-time comparison was inconclusive
because of a large outlier; all observations are retained. Node CPU time favored
the candidate over main by 5.80% [4.34%, 7.07%].

**Decision: discard the scheduling change.** The small byte saving and lower
promise count do not justify changing invocation timing without a convincing
runtime result, particularly with the combined pending workload leaning slower.
The production implementation and its original performance/bundle conclusions
remain unchanged. The unsupported test is removed regardless of this decision.

All experimental samples, allocation counts, per-file bundle metrics, and the
reproducible candidate patch are preserved under
[`results/preload-scheduling`](scripts/benchmarks/ready-routes/results/preload-scheduling).
They are explicitly marked as a discarded candidate. `incremental-reverse.json`
preserves reversed implementation labels; positive values from `summarize.mjs`
for that file favor the existing PR, not the experiment.

To reproduce the comparison, use test-only commit `1cfb377ea7` in both worktrees,
apply `immediate.patch` only to the candidate, then run `compare.mjs` with
`--cases cached:8,chunks:8,async-chunks:8 --pairs 6`. Repeat the combined case with
the base/candidate worktrees swapped and `--pairs 12`. The experiment's
main-to-candidate core comparison uses `--base-source` with `load-client.ts` from
`2f9150309b`; the browser comparison uses that original baseline worktree.

After removing the unsupported cases and adding the precedence case, uncached
checks pass with 1,673 router-core and 1,037 react-router unit tests, plus four
expected failures and one skip. TypeScript and lint suites pass again, as do all
24 Chromium e2e tests and all 16 Vitest benchmark cases. Rebuilding all 18 bundle
scenarios after discarding the experiment reproduces the current PR sizes exactly
for gzip, initial gzip, raw JavaScript, and Brotli.

The earlier PR CI run (`2a4a3fa670`) passed correctness checks but CodSpeed flagged
seven memory regressions and warned about different runtime environments. Those
memory results remain unresolved; the local latency measurements are not evidence
that the CI memory flags are harmless.
