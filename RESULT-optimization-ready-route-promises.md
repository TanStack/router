# Ready-route promise overhead

The final proposal retains the immediate async chunk wrapper. The accepted
tradeoff is smaller code and fewer promises, with an uncertain incremental
runtime effect that leans approximately 1–2% slower in pending-work cases.
No additional speedup is claimed for choosing this wrapper.

Production changes are confined to `packages/router-core/src/load-client.ts`:

1. Use `then` for cleanup after `waitFor`'s native resolve/reject callbacks, which
   return normally even when the public wait rejects.
2. Attach loader settlement work only when a blocking loader actually runs.
3. Start chunk loading in an immediate async wrapper and await `waitFor` only
   when a real chunk promise exists. Synchronous preload exceptions become
   rejected promises handled by the existing error normalization.

Navigation from inside component preload is undefined behavior; the test that
asserted it was removed. External cancellation, synchronous exceptions, loader
error precedence, parent snapshots, and pending-component readiness remain
covered. The wrapper changes preload invocation order relative to scheduled
loader callbacks; both remain in the parallel loading phase.

## Final implementation versus unoptimized main

Baseline production commit: `2f9150309bc472f4a75cbe98adcdb50c76b12c7a`.
The accepted wrapper is identical to the previously measured candidate; its
saved patch and source bundle hashes make that comparison reproducible.

| Eight-match cached workload                                       |   Before |    After |  Improvement | 95% paired bootstrap interval |
| ----------------------------------------------------------------- | -------: | -------: | -----------: | ----------------------------: |
| Production Chromium, warmed lazy component, navigation completion | 63.71 µs | 61.10 µs |        4.08% |                3.37% to 4.83% |
| Node CPU time per navigation                                      | 46.31 µs | 43.65 µs |        5.80% |                4.34% to 7.07% |
| Node wall time per navigation                                     | 42.08 µs | 42.42 µs | Inconclusive |               -8.05% to 7.51% |

The Node wall-time run includes a large outlier; no observations are discarded.
Its arithmetic means and paired geometric mean ratio differ, so no wall-time
speedup is claimed. Chromium's 12 pairs all favored the final implementation,
with a 1.30% baseline coefficient of variation.

Separate diagnostics observe 20,101 → 13,701 PROMISE resources over 100 cached
eight-match navigations, including the same fixed harness overhead. That is
**64 fewer PROMISE resources and eight fewer abort-listener registrations per
navigation** versus main. These counts come from instrumented processes and do
not measure heap bytes or production GC cost.

## Immediate wrapper versus the initial PR

Comparison implementation: `2a4a3fa6704e78fbb22a702d9216129326e04ad5`.
Test-only commit `1cfb377ea7` supplies identical fixtures to both variants.
Positive percentages below mean slower, except where explicitly marked faster.

| Eight-match workload                   | Initial PR → final wrapper |            Observed change |                 95% interval |
| -------------------------------------- | -------------------------: | -------------------------: | ---------------------------: |
| Cached loaders, components ready       |           39.36 → 38.67 µs |               1.69% faster | 0.60% slower to 5.53% faster |
| Cached loaders, pending components     |           41.74 → 42.57 µs |               1.97% slower | 1.11% faster to 6.02% slower |
| Async loaders, pending components      |           94.55 → 95.93 µs |               1.44% slower |        0.30% to 2.41% slower |
| Same async case, reversed-label repeat |           92.37 → 93.41 µs | approximately 1.04% slower |  Inconclusive; includes zero |

The first three cases use six fresh-process pairs; the reverse-label repeat
uses twelve. Every non-root component creates a new preload promise on every
navigation and resolves it in a microtask. The combined case also reruns its
async loaders every navigation, returning immediately fulfilled promises. There
is no network wait in these cases: they expose scheduling overhead, not a claim
that real page loads become 1–2% slower.

Both combined-workload comparisons lean slower, but the noisier repeat does not
establish a reproducible regression. The ready-route gain is also inconclusive.
The wrapper removes one further PROMISE resource per match in all three cases.
It reduces raw JavaScript by 26 bytes in every measured bundle; incremental gzip
deltas range from -11 to 0 bytes, including -9 bytes for React Router minimal and
0 bytes for React Router full. This tradeoff was explicitly accepted.

## Full bundle comparison against main

All emitted JavaScript is counted, including lazy chunks. Byte deltas are final
minus baseline. JavaScript file counts are unchanged.

| Scenario                         | Gzip before | Gzip final | Gzip delta | Initial gzip delta | Raw delta | Brotli delta |
| -------------------------------- | ----------: | ---------: | ---------: | -----------------: | --------: | -----------: |
| react-router.minimal             |      85,772 |     85,766 |         -6 |                 -2 |       -30 |          +37 |
| react-router.full                |      89,362 |     89,365 |         +3 |                 +2 |       -30 |          -70 |
| solid-router.minimal             |      33,926 |     33,927 |         +1 |                 +2 |       -30 |         -101 |
| solid-router.full                |      38,868 |     38,871 |         +3 |                 +0 |       -30 |          +76 |
| vue-router.minimal               |      50,635 |     50,631 |         -4 |                 -2 |       -30 |          +13 |
| vue-router.full                  |      56,396 |     56,393 |         -3 |                 -1 |       -30 |          -35 |
| react-start.minimal              |      99,000 |     98,992 |         -8 |                 -6 |       -30 |          +36 |
| react-start.query-integration    |     106,513 |    106,508 |         -5 |                 -2 |       -30 |         -104 |
| react-start.deferred-hydration   |      99,743 |     99,731 |        -12 |                 -4 |       -30 |          -96 |
| react-start.full                 |     102,230 |    102,225 |         -5 |                 -5 |       -30 |          -61 |
| react-start.rsbuild.minimal      |     102,351 |    102,344 |         -7 |                 -7 |       -31 |          +10 |
| react-start.rsbuild.minimal-iife |     102,762 |    102,756 |         -6 |                 -6 |       -31 |          -69 |
| react-start.rsbuild.full         |     105,749 |    105,741 |         -8 |                 -8 |       -31 |         +162 |
| solid-start.minimal              |      47,074 |     47,078 |         +4 |                 +1 |       -30 |          +26 |
| solid-start.deferred-hydration   |      50,241 |     50,238 |         -3 |                 -2 |       -30 |           -2 |
| solid-start.full                 |      52,282 |     52,281 |         -1 |                 -2 |       -30 |           +2 |
| vue-start.minimal                |      67,186 |     67,185 |         -1 |                 +0 |       -30 |          -31 |
| vue-start.full                   |      71,095 |     71,095 |         +0 |                 +0 |       -30 |          -29 |

React Router minimal is 6 gzip bytes smaller than main; React Router full is
3 bytes larger. Across all 18 scenarios the gzip delta ranges from -12 to +4
bytes. The retained wrapper never increases gzip relative to the initial PR.
Complete per-file metrics are preserved in `results/preload-scheduling/bundles.json`.

## Measurement protocol and limitations

Measurements use an Apple M3 Max, Node 25.8.1, and Chromium 149.0.7827.55, with
minified production client bundles. Each group runs in a fresh process/browser
loading one implementation, using balanced AB/BA order. Three warmup batches
precede three measured batches. Node calibrates batches to roughly 350 ms;
Chromium uses 3,000 navigations per batch. Timing includes final promise cleanup
jobs and excludes assertions, test-library calls, fake timers, jsdom, and
per-navigation Playwright RPC.

Untimed checks after every batch verify state and exact loader/preload counts.
React additionally checks rendered-event counts, DOM data/params, and one warmed
lazy import. Bootstrap intervals use 10,000 resamples of independent pairs;
within-process batches are not treated as independent observations. Allocation
hooks run in separate processes that never contribute timing samples.

These are single-machine V8-family results, covering navigation completion and
React commits, not paint latency or a universal application speedup. Earlier
byte-identical controls showed apparent gains of 2.07% in Node cached routes and
1.00% in shallow Chromium routes; the deep Chromium control was -0.22%
[-0.88%, 0.35%]. Consequently, small positive percentages alone are insufficient
proof. The earlier jsdom percentage claim remains withdrawn.

The initial implementation's broader workload matrix, controls, reversed-label
replication, and independent hunk measurements remain in the raw data and the
[initial report](https://github.com/TanStack/router/blob/06afabb02cab1545ee10953788b94264adfb0af6/RESULT-optimization-ready-route-promises.md).
Those initial-version measurements are not substituted for final-version results.

## Validation and reproduction

The final implementation is checked with the repository's `pnpm test:eslint`,
`pnpm test:types`, and `pnpm test:unit` commands, plus the production React basic
Chromium e2e suite and all 18 bundle scenarios. The local React basic example is
also exercised with its development server. Focused core/React unit counts are
1,673 and 1,037 passing tests, plus four expected failures and one skip.

The earlier PR CI run (`2a4a3fa670`) passed correctness checks but CodSpeed flagged
seven memory regressions alongside a warning about different runtime environments.
Those memory flags remain unresolved; local latency results do not establish that
they are harmless.

Raw final-version samples, hashes, counts, per-file bundle metrics, and the
accepted patch are in
[`results/preload-scheduling`](scripts/benchmarks/ready-routes/results/preload-scheduling).
`incremental-reverse.json` preserves reversed labels: positive output from
`summarize.mjs` for that file favors the initial PR. The samples are unchanged;
only the retention decision metadata changed when the tradeoff was accepted.

To reproduce the incremental comparison, create two worktrees at `1cfb377ea7`,
install using the same lockfile, and apply `immediate.patch` to the candidate:

```sh
node scripts/benchmarks/ready-routes/compare.mjs --base /path/to/initial-pr --candidate /path/to/final --output /tmp/ready-core --cases cached:8,chunks:8,async-chunks:8 --pairs 6
node scripts/benchmarks/ready-routes/compare.mjs --base /path/to/final --candidate /path/to/initial-pr --output /tmp/ready-reverse --cases async-chunks:8 --pairs 12
node scripts/benchmarks/ready-routes/summarize.mjs /tmp/ready-core/samples.json /tmp/ready-reverse/samples.json
```

For main-to-final core results, override baseline `load-client.ts` with the file
from `2f9150309b` using `--base-source`, and use `--cases cached:8 --pairs 12`.
For Chromium, use that original baseline implementation with the identical
`ready-routes.tsx` fixture:

```sh
node scripts/benchmarks/ready-routes/browser.mjs --base /path/to/main-with-fixtures --candidate /path/to/final --output /tmp/ready-browser --cases lazy:8 --pairs 12 --iterations 3000
node scripts/benchmarks/ready-routes/allocations.mjs /tmp/ready-core/candidate.mjs cached 8
```

Run diagnostics separately from timing, and run one Nx invocation at a time.
The full bundle command in each worktree is:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build --outputStyle=stream --skipRemoteCache --skipNxCache
```
