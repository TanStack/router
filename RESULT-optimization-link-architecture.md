# Link architecture optimization — validation and measured tradeoffs

**Functional validation, measurement workflows, and emitted-code auditing are complete
for the recorded scope. The smaller-overall-bundle aspiration was not met.**

All eighteen final application scenarios are larger by **1,844–2,422 gzip bytes**, with
unchanged JS file counts. Final minimal growth is React **+1,870 B**, Solid **+2,063 B**,
and Vue **+2,374 B**. The implementation trades these bytes and per-mount bookkeeping for
selective updates: measured departing-owner and isolated inactive-fanout work falls sharply.

The pre-generalization paired comparison finds eight clear client CPU improvements and
five inconclusive client cases; all thirteen SSR cases are inconclusive. Final SSR emission
is identical to that measured snapshot. The final activity-coverage refinement independently
improves relative-workload CPU **3.84%**; its mount comparison remains inconclusive.
The original-versus-candidate seven-pair mount result is also inconclusive. These results
support workload-specific benefits, not universal speedups or performance equivalence.
Final functional validation includes 7,047 core/binding runtime passes, consumer checks,
374 selected browser tests, hydration checks, and four final retention assertions.

## Current comparison and measurement identity

- Original implementation: `41ebd288677beacb8eb56953f5f8c26e9d33313e`.
- Runtime: Node 24.8.0; pnpm 11.21.0; production React/jsdom client and React SSR fixtures.
- Current composed export: `/private/tmp/link-composed-original-all.json`; `complete: true`.
  Its matching `.log` reports successful Nx execution on 2026-09-29.
- The measured composition retains sparse dependency-mask arrays, full-source path-index
  skipping, root-prefix stopping, shared refresh, and React's single destination memo.
  The subsequently retained generalized activity-coverage change is **not** included in
  the client comparison. SSR emission is identical after that change, as verified below.
- Client SHA-256: original `dcbc919cfb0e5746867350ad101bb3d6bf214da55d36359b472f5bf0c9a7d8a3`;
  current `bf166be4d7ffee8605e3acbf141a7c83469db744d32d0071df4d0e13b6e575c8`.
- SSR SHA-256: original `106c4ca5943f3cfb22c2fa4b27f2716e4fce79c082509819e20e5ad6796c2dbb`;
  current `0aaac7abaa6ffcdcacf67eb2a43aa64d5261d5216e8c7f0c764367481c556a20`.
- Final SSR emission was independently hashed after activity-aware coverage: current
  `benchmarks/client-nav/link-performance/dist/ssr/app.js` and the saved
  `/private/tmp/link-pre-coverage-attribution/ssr/app.js` both have the current SSR hash
  above. Therefore all thirteen paired SSR results still describe the final emitted SSR
  workload. This identity check does not extend the older client results to new code.

The stable runner uses fresh processes per case/replica, shared React runtime, separately
loaded router variants, two ABBA/BAAB rounds, approximately 500 ms calibrated fixed-work
blocks, at least 2 s/100 batches warm-up, main-thread CPU/wall timing, and fixed V8 seeds.
All rows below have four replicas. Values are CPU change and the runner's 95% interval;
negative means faster. Every SSR verdict is **inconclusive**.

| Workload          | Client CPU change [95% interval] | Client verdict | SSR CPU change [95% interval] |
| ----------------- | -------------------------------- | -------------- | ----------------------------- |
| shared-params     | -17.10% [-20.75%, -13.29%]       | faster         | +0.28% [-9.85%, +11.56%]      |
| unique-params     | -20.26% [-23.60%, -16.77%]       | faster         | +0.51% [-12.82%, +15.88%]     |
| param-updaters    | +0.37% [-4.31%, +5.27%]          | inconclusive   | +1.43% [-8.93%, +12.97%]      |
| location-updaters | +0.95% [-8.73%, +11.66%]         | inconclusive   | +0.44% [-5.37%, +6.60%]       |
| relative          | -3.14% [-8.16%, +2.16%]          | inconclusive   | +0.41% [-4.62%, +5.71%]       |
| middleware        | -2.39% [-9.76%, +5.57%]          | inconclusive   | -0.23% [-9.04%, +9.42%]       |
| numeric-params    | -0.79% [-2.21%, +0.66%]          | inconclusive   | +0.16% [-12.61%, +14.79%]     |
| optional-params   | -9.05% [-9.88%, -8.21%]          | faster         | +0.59% [-7.78%, +9.71%]       |
| splats            | -18.57% [-21.67%, -15.34%]       | faster         | +0.57% [-4.07%, +5.42%]       |
| encoding          | -26.32% [-30.03%, -22.40%]       | faster         | -0.37% [-7.23%, +7.00%]       |
| masks             | -58.52% [-60.98%, -55.91%]       | faster         | +0.93% [-5.89%, +8.24%]       |
| rewrites          | -20.91% [-22.57%, -19.22%]       | faster         | +0.02% [-5.37%, +5.73%]       |
| active            | -13.90% [-14.56%, -13.22%]       | faster         | +0.30% [-3.54%, +4.30%]       |

These results supersede the earlier original→pilot and seven-replica updater comparisons
for the primary 26-case conclusion. They do not measure first-mount or isolated-fanout
lifecycle cases, nor do they establish Solid/Vue runtime gains or Start request throughput.
The largest clear client gain is masks; shared/unique params, optional params, splats,
encoding, rewrites, and active links also improve. Fully source-dependent updaters still
perform substantial work; their intervals allow both improvement and regression.

## Architecture and attribution boundary

Canonical build read-tracking, selective router publication, stable committed registrations,
immutable render views, and framework adapters form one dependent architectural group.
Removing these pieces independently would change subscription or concurrency semantics.
The [decision record](LINK-ARCHITECTURE.md) explains the design and alternatives.
This dependency grouping does not waive independent attribution for separable changes.

### Retained changes and focused attribution

Bundle deltas below are React minimal versus each experiment's named preceding snapshot,
not additive deltas versus the original. Independent timings use their own source snapshots.

| Change                                                          | Bundle evidence                                        | Runtime/correctness evidence                                                                          | Disposition                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Single listener                                                 | -13 gzip B                                             | Updaters -2.95% [-9.33%, +3.88%], four replicas                                                       | Retained for bytes; CPU inconclusive.                                                   |
| Stop false root candidate                                       | 87,841 → 87,835 gzip B (-6)                            | Isolated repeated-root/hash mean 2.320362 → 0.597407 ms; unique remains near 0.59 ms; focused 166/166 | Retained; removes work for a prefix that cannot match. Single-run timing is diagnostic. |
| Shared refresh                                                  | 87,835 → 87,804 gzip B (-31), raw -210 B, Brotli +75 B | First mount 18.713557 ms; persistent owners 14.902629 ms; focused 10/10                               | Retained consolidation; lifecycle deltas are unpaired, not proof of CPU benefit.        |
| Single React memo + current click inputs                        | 87,804 → 87,807 gzip B (+3), raw +49 B, Brotli -44 B   | Focused React 168/168; two public regressions fail both original and pre-fix candidate                | Retained with correctness fixes; not a claimed byte optimization.                       |
| Sparse mask array                                               | 87,807 → 87,805 gzip B (-2), raw -7 B, Brotli -12 B    | Focused React 20/20 and Vue 10/10; lifecycle samples below                                            | Retained for smaller representation; focused runtime deltas remain unpaired.            |
| Skip path membership when all active source fields are observed | Removing skip: 87,805 → 87,793 gzip B (-12)            | Removal slows updaters +3.59% [+3.17%, +4.01%], four replicas                                         | Keep skip: measured CPU regression outweighs removal's small byte saving.               |
| Generalized active-field coverage                               | +26 gzip B, +107 raw B, +57 Brotli B                   | Relative CPU -3.84% [-5.57%, -2.08%], seven replicas; mount inconclusive                              | Retained for resolved relative-workload benefit; final functional checks pass.          |

The path-skip reversal is `/private/tmp/link-full-path-perf.json` (`complete: true`), with
successful matching log. Its baseline client hash exactly matches the current composed
comparison above; the removal variant is
`972b0cb65ba1897ff5da7a5883c209151bf43f10c38cc9f389bc5b92382d5dcb`.
This resolves the earlier provisional path-skip attribution, whose interval was wide.

The React correctness fixes ensure changing `href` updates displayed target/activity and
subsequent intent/navigation, and changing only `reloadDocument` affects the next click.
`link-memo-baseline-tests.log` and `link-memo-before-tests.log` each show those two failures;
`link-single-memo-tests.log` records the focused passing result. Public APIs remain unchanged.

Attribution sources in `/private/tmp`: `link-listener-perf.json`, `link-root-*.json`,
`link-refresh-*.json`, `link-single-memo-*.json`, `link-mask-array-*.json`, and their test logs.
Bundle snapshots under `benchmarks/bundle-size/results/runs/`: `link-single-listener`,
`link-corrected-methods`, `link-root-candidates`, `link-shared-refresh`, `link-single-memo`,
`link-mask-array`, and `link-full-path-membership`.

### Rejected experiments

| Experiment                                      | Evidence against retention                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Differential reindex                            | +69 gzip B; CPU -2.02% [-4.98%, +1.02%], seven replicas.                                                  |
| Earlier dependency-mask grouping representation | +9 gzip B; CPU +1.26% [-5.98%, +9.05%], four replicas. This is distinct from retained sparse arrays.      |
| Initial staging/allocation rewrite              | +4 gzip B; CPU -0.35% [-1.99%, +1.31%], four replicas.                                                    |
| Explicit descriptor                             | +47 gzip B; first mount 18.811179 vs 18.821095 ms, no resolved gain.                                      |
| Static-unindex guard                            | +7 gzip B; first mount 19.019368 vs shared-refresh 18.713557 ms.                                          |
| Identical-adoption shortcut                     | +13 gzip B; first mount 18.736163 vs 18.713557 ms; 1000-Link mount 107.481716 ms, no established benefit. |
| Removing covered path skip                      | -12 gzip B but resolved +3.59% updater CPU regression, as above.                                          |

Sources: `link-reindex-perf7.json`, `link-mask-perf.json`, `link-allocation-perf.json`,
`link-{descriptor,static-unindex,same-adoption}-*.json`, associated bundle/test logs, and
named bundle snapshots. Each experiment uses its own preceding snapshot; deltas cannot
be summed across alternative implementations.

## Lifecycle evidence and remaining mount uncertainty

These are single-process benchmark exports, not paired confidence intervals for differences.
Times are ms per batch (eight navigations or six fresh mount/unmount cycles). Sanity checks
verify rendered href/activity and fixture lifetimes during untimed warm-up. RME is the
individual benchmark's relative margin of error, not a confidence interval for the delta.

| Snapshot         | Case                        |    Mean ms |     p99 ms |     RME | Samples |
| ---------------- | --------------------------- | ---------: | ---------: | ------: | ------: |
| Original v4      | First mount                 |  17.962201 |  21.676750 | 0.5740% |     279 |
| Original v4      | Persistent owners           |  14.700311 |  19.241208 | 0.7873% |     341 |
| Original v4      | Isolated repeated 1000/hash |   2.112483 |   3.159250 | 0.5931% |    2368 |
| Original v4      | Isolated unique 1000/search |   2.151975 |   3.143625 | 0.6110% |    2324 |
| Root-prefix stop | Isolated repeated 1000/hash |   0.597407 |   1.967417 | 1.1468% |    8370 |
| Root-prefix stop | Isolated unique 1000/search |   0.591827 |   2.033833 | 1.1363% |    8449 |
| Single memo      | First mount                 |  18.576325 |  21.064917 | 0.5680% |     270 |
| Single memo      | Persistent owners           |  14.577009 |  18.542458 | 1.0988% |     344 |
| Single memo      | Mount 1000                  | 100.369483 | 115.335041 | 1.6747% |      50 |
| Sparse array     | First mount                 |  18.169319 |  20.930166 | 0.6311% |     276 |
| Sparse array     | Persistent owners           |  14.417900 |  18.565500 | 1.1248% |     347 |
| Sparse array     | Mount 1000                  |  99.224399 | 133.732958 | 2.2941% |      51 |
| Sparse array     | Mixed 200/hash              |   8.238044 |   9.574166 | 0.3349% |     607 |

Latest single-run first-mount/persistent-owner means are closer to baseline than early
versions, but this does not establish equivalence or a paired win. The 1000-Link sample
has only 51 batches and a pronounced p99. Isolated grids avoid parent reconstruction;
ordinary scaling cases include parent route rendering and changed Link props. Both matter.
Sources: `/private/tmp/link-{baseline-v4,root,single-memo,mask-array}-*.json`.

### Superseded thirteen-case lifecycle snapshot

The following complete earlier snapshot preserves evidence of both gains and regressions.
It is **not the current composition**. Baseline files are `link-baseline-v2-*.json` plus
`link-baseline-v3-formatter.*.json`; candidate files are `link-current-v3-*.json`, all under
`/private/tmp`. All thirteen candidate logs report successful benchmark execution.

| Case                                      | Before mean | After mean |  Mean Δ | Before p99 | After p99 |   p99 Δ | RME before/after | n before/after |
| ----------------------------------------- | ----------: | ---------: | ------: | ---------: | --------: | ------: | ---------------: | -------------: |
| departing owners                          |      27.030 |     21.220 | -21.49% |     29.845 |    24.978 | -16.31% |  0.348% / 1.443% |      185 / 236 |
| first mount                               |      17.774 |     19.085 |  +7.38% |     19.515 |    27.314 | +39.96% |  0.297% / 0.852% |      282 / 262 |
| formatter hash 0 external 200 internal    |       5.446 |      5.102 |  -6.32% |      6.413 |     6.325 |  -1.38% |  0.309% / 0.468% |      919 / 981 |
| formatter memory 0 external 200 internal  |       5.139 |      4.794 |  -6.71% |      6.196 |     5.774 |  -6.82% |  0.401% / 0.308% |     974 / 1043 |
| formatter opaque 0 external 200 internal  |      10.785 |     10.919 |  +1.24% |     12.172 |    12.612 |  +3.61% |  0.244% / 0.367% |      464 / 458 |
| formatter opaque 1000 external 8 internal |      27.567 |     26.794 |  -2.80% |     53.944 |    44.804 | -16.94% |  2.662% / 2.455% |      182 / 187 |
| persistent owners                         |      14.357 |     15.404 |  +7.29% |     18.280 |    18.330 |  +0.27% |  0.723% / 1.010% |      349 / 325 |
| scaling mixed 200 hash                    |       8.068 |      8.164 |  +1.18% |      9.199 |     9.596 |  +4.31% |  0.266% / 0.357% |      620 / 613 |
| scaling mixed 200 search                  |       8.114 |      7.949 |  -2.03% |      8.918 |     9.240 |  +3.61% |  0.252% / 0.324% |      617 / 629 |
| scaling mount 1000                        |      94.101 |     98.793 |  +4.99% |    107.489 |   115.567 |  +7.52% |  1.597% / 1.616% |        54 / 51 |
| scaling repeated 1000 hash                |      34.377 |     32.502 |  -5.46% |     62.916 |    56.272 | -10.56% |  2.989% / 2.614% |      146 / 154 |
| scaling unique 1000 search                |      32.628 |     30.767 |  -5.70% |     58.482 |    52.686 |  -9.91% |  2.513% / 2.267% |      154 / 163 |
| scaling unique 50 search                  |       1.735 |      1.723 |  -0.73% |      2.126 |     2.134 |  +0.40% |  0.218% / 0.221% |    2882 / 2903 |

These early results exposed departing-owner savings and persistent/mount regressions;
later changes supersede the source snapshot but do not erase those observations. Hash
formatting holds the outer `/shell` path stable, so it does not test outer-shell changes.
Opaque formatters read public source search; direct external Links bypass formatting.
The table source is `/private/tmp/link-current-v3-comparison.md`.

## Final eighteen-scenario bundle comparison — complete, size goal not met

Both `benchmarks/bundle-size/results/runs/link-architecture-baseline/current.json` and
`runs/link-architecture-final/current.json` report successful full-scenario measurements
with package builds and source attribution enabled. These are emitted application bundles,
not package-size proxies. The final snapshot records dirty source at commit
`719f0a437994f0b1aba9084b506ebf1e1fa45147`; its saved metrics identify this composition.

All byte columns below are compressed/raw emitted JavaScript totals as labeled; deltas
are final minus original. Initial denotes initial gzip bytes. JS file counts are unchanged
in every scenario; deferred hydration retains three files, all others two.

| Scenario                         | Gzip before → after B | Gzip delta B | Raw delta B | Brotli delta B | Initial gzip delta B | JS files |
| -------------------------------- | --------------------: | -----------: | ----------: | -------------: | -------------------: | -------- |
| react-router.minimal             |       85,961 → 87,831 |       +1,870 |      +6,237 |         +1,697 |               +1,868 | 2 → 2    |
| react-router.full                |       89,608 → 91,452 |       +1,844 |      +6,238 |         +1,592 |               +1,844 | 2 → 2    |
| solid-router.minimal             |       34,339 → 36,402 |       +2,063 |      +6,586 |         +1,772 |               +2,060 | 2 → 2    |
| solid-router.full                |       39,342 → 41,422 |       +2,080 |      +6,587 |         +1,702 |               +2,077 | 2 → 2    |
| vue-router.minimal               |       50,606 → 52,980 |       +2,374 |      +7,654 |         +2,094 |               +2,373 | 2 → 2    |
| vue-router.full                  |       56,357 → 58,752 |       +2,395 |      +7,658 |         +2,178 |               +2,395 | 2 → 2    |
| react-start.minimal              |      99,102 → 100,970 |       +1,868 |      +6,243 |         +1,566 |               +1,869 | 2 → 2    |
| react-start.query-integration    |     106,706 → 108,632 |       +1,926 |      +6,249 |         +1,519 |               +1,927 | 2 → 2    |
| react-start.deferred-hydration   |      99,844 → 101,712 |       +1,868 |      +6,243 |         +1,625 |               +1,867 | 3 → 3    |
| react-start.full                 |     102,317 → 104,219 |       +1,902 |      +6,246 |         +1,717 |               +1,903 | 2 → 2    |
| react-start.rsbuild.minimal      |     102,821 → 104,684 |       +1,863 |      +6,162 |         +1,653 |               +1,863 | 2 → 2    |
| react-start.rsbuild.minimal-iife |     103,239 → 105,103 |       +1,864 |      +6,162 |         +1,653 |               +1,864 | 2 → 2    |
| react-start.rsbuild.full         |     106,132 → 107,977 |       +1,845 |      +6,158 |         +1,604 |               +1,845 | 2 → 2    |
| solid-start.minimal              |       47,502 → 49,530 |       +2,028 |      +6,587 |         +1,721 |               +2,026 | 2 → 2    |
| solid-start.deferred-hydration   |       50,629 → 52,656 |       +2,027 |      +6,594 |         +1,790 |               +2,023 | 3 → 3    |
| solid-start.full                 |       52,686 → 54,745 |       +2,059 |      +6,583 |         +1,906 |               +2,057 | 2 → 2    |
| vue-start.minimal                |       67,042 → 69,445 |       +2,403 |      +7,658 |         +2,200 |               +2,404 | 2 → 2    |
| vue-start.full                   |       70,992 → 73,414 |       +2,422 |      +7,662 |         +2,102 |               +2,422 | 2 → 2    |

The final full measurement supersedes the earlier three-family size estimates. It confirms
that the architecture has **not achieved a smaller overall bundle** in any measured
scenario. Independent micro-optimizations reduced some overhead, but do not reverse the
architectural cost. The shared Link coordinator and adapter integration remain a dependent
change group; their bytes are accepted as an explicit tradeoff, not labeled a size win.

### Formal AFTER bundles with matching BEFORE flags

`runs/link-formal-after-final/current.json` uses the same three-minimal-scenario `--analysis`
filter as `runs/link-formal-before/current.json`. Both report success. Each final formal
scenario's complete metrics object exactly matches its entry in the final full eighteen-
scenario snapshot, including source attribution and file metrics. The formal BEFORE
objects likewise match the original baseline, as recorded below.

| AFTER scenario       |   Raw B | Gzip B | Brotli B | Initial gzip B | JS files |
| -------------------- | ------: | -----: | -------: | -------------: | -------: |
| react-router.minimal | 273,885 | 87,831 |   76,616 |         87,690 |        2 |
| solid-router.minimal | 104,886 | 36,402 |   32,830 |         36,273 |        2 |
| vue-router.minimal   | 147,705 | 52,980 |   47,909 |         52,853 |        2 |

### Final emitted-code audit — complete

The audit found no accidental retained code or chunk anomalies. Server emission contains
pure `readLinkState` derivation; client registry, record, view, and subscription machinery
is absent from the inspected SSR bundle. Its final SHA-256 remains
`0aaac7abaa6ffcdcacf67eb2a43aa64d5261d5216e8c7f0c764367481c556a20`, identical to the
measured SSR candidate. Client emission excludes developer diagnostics and the removed
`staticLocations` cache. This confirms expected elimination in the inspected production
artifacts, not a claim about arbitrary consumer bundler configurations.

Source-map attribution explains the growth. In React minimal, the new shared `link-state`
module contributes an estimated 6,475 raw bytes, partly offset by React Link shrinking
652 bytes; router +238, history +118, and stores +61 bytes support the integration.
Vue additionally retains approximately 1,047 raw bytes of effect machinery required to
track native reactive callback inputs, while Vue Link itself shrinks 286 bytes. These
source estimates are diagnostic raw-byte attribution, not independently additive gzip
costs. Final emitted file totals in the eighteen-scenario table remain authoritative.

Final composition versus the pre-attribution `link-stable-fixed` minimal snapshots:

| Minimal family | Gzip delta B | Raw delta B | Initial gzip delta B | Brotli delta B |
| -------------- | -----------: | ----------: | -------------------: | -------------: |
| React          |          -16 |        -165 |                  -20 |            +19 |
| Solid          |          -21 |        -220 |                  -25 |             +2 |
| Vue            |          -31 |        -220 |                  -29 |            -90 |

These small reductions verify that retained attribution work reduced the intermediate
architecture's gzip cost; they do not turn the net growth versus original into a saving.
Runtime/mount confidence limits and larger bundles are measured tradeoffs, not missing
workflow steps.

## Allocation, retention, and superseded CPU evidence

An earlier single-listener candidate and original each ran 500 warmed dynamic batches
under Node 24.8.0 / V8 13.6.233.10-node.27. HeapProfiler used a 32,768-byte sampling interval
including collected objects. Summed allocation-tree self sizes were 33,617.095 versus
31,922.601 KiB/batch (-5.04%). This is a sampled allocation diagnostic for that earlier
snapshot, not exact allocated bytes, retained heap, or a current throughput claim.
Sources: `/private/tmp/link-baseline-alloc.json`, `link-listener-alloc.json`, and
`link-allocation-interpretation.md`; uninstrumented paired timing remains the CPU authority.

Focused retention passed 3/3 on both original and candidate with exposed GC and captured
stacks disabled (`link-retention-{baseline,candidate}-nostacks.log`, `link-stable-retention.log`).
These tests check object liveness, not allocated bytes or blanket absence of leaks. Earlier
captured stacks retained development navigation frames and were not isolated Link leaks.

```sh
RUN_LINK_RETENTION=1 CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-router:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/link-retention.test.tsx --pool=forks --execArgv=--expose-gc --execArgv=--stack-trace-limit=0
```

Earlier paired CPU snapshots are superseded for current conclusions: initial updater pilot
+8.71% [+7.42%, +10.01%], four replicas; intermediate updater +2.83% [-0.23%, +5.99%], seven;
initial shared-params client -18.23% [-19.42%, -17.02%], four, with SSR inconclusive.
Sources: `link-pilot-updaters.json`, `link-current-original-perf7.json`, `link-pilot-shared.json`.
Their progression documents real early overhead, not evidence that the final case is neutral.

## Correctness evidence and formal BEFORE/AFTER

Full v4 validation passed core 3626, React 1228, Solid client 979 (one skipped)/SSR 75,
Vue client 992/SSR 140, plus the requested type/eslint/build targets
(`/private/tmp/link-full-validation-v4.log`). This predates later changes.
A later staged-value race regression demonstrated stale Vue callback output; original
selected cases passed 2/2 (eight skipped), then fixed Vue passed 10/10 and React 20/20.
That aggregate invocation nevertheless failed because the filtered Solid SSR runner selected
zero files. Sources: `link-vue-ordering*.log`, `link-staging-validation.log`. It is not green.
Later single-memo and mask-array focused passing checks are listed above.

### Formal BEFORE — recorded baseline

The tests/benchmarks-only commit is `3aa8db20901b27a77adeffd84753d3c0f3740eaf`
(local unsigned). Runtime implementation and `LINK-ARCHITECTURE.md` are stashed as
`link-architecture-implementation-validation` (`stash@{0}` when created). The bundle
snapshot records a clean working tree at that commit. This is the formal implementation-
stashed baseline; completed matching AFTER results are recorded below.

**Focused public tests: 10 failures, 30 passes.** The command in
`/private/tmp/link-formal-before-tests.log` correctly exits unsuccessfully:

- React: six failures, 23 passes. Three failures assert newly requested avoided work:
  no redundant static-destination builder entry, no search-updater rerun on hash-only
  navigation, and no outgoing-owner work while a persistent Link updates immediately.
- React's other three failures are existing prop regressions: changing `reloadDocument`,
  changing `href` display/activity, and changing `href` intent/preload/navigation target.
  These are three tests covering two prop-behavior defects, not performance expectations.
- Vue: four failures, seven passes. Three assert outgoing-owner deferral on departure,
  redirect, and supersession; one rejects destination rebuilding for element-only props.
  All four fail unnecessary callback-count assertions, not missing final DOM updates.

Thus seven baseline failures establish new work-avoidance contracts and three establish
preexisting prop defects. The passing tests cover compatibility and edge behavior; the
baseline command is deliberately reported as failed rather than relabeled green.

**Retention: four passes.** `/private/tmp/link-formal-before-retention.log` reports React
3/3 and Vue 1/1, with successful Nx execution under the GC diagnostic configuration.
These remain object-liveness checks, not byte-allocation measurements.

**Lifecycle/native reactivity: eight measured baseline cases.** Both
`link-formal-before-lifecycle.log` (six React cases) and `link-formal-before-vue.log`
(two Vue cases) report successful Nx execution. Their same-named JSON exports supply:

| BEFORE workload                            | Mean ms/batch | p99 ms/batch |     RME | Samples |
| ------------------------------------------ | ------------: | -----------: | ------: | ------: |
| departing owners (react)                   |     27.857097 |    31.975417 | 0.5932% |     180 |
| persistent owners (react)                  |     14.319136 |    17.430250 | 0.4228% |     350 |
| first mount (react)                        |     19.105969 |    25.288250 | 1.0240% |     262 |
| isolated fanout unique 1000 search (react) |      2.328876 |     2.638875 | 0.1978% |    2148 |
| isolated fanout repeated 1000 hash (react) |      2.234324 |     3.125500 | 0.4342% |    2238 |
| isolated fanout active 1000 hash (react)   |     61.822071 |    74.172667 | 1.3960% |      82 |
| ref updates 200 reactive 0 static (vue)    |     11.453880 |    14.171000 | 0.7042% |     437 |
| ref updates 100 reactive 100 static (vue)  |      5.401472 |     6.316417 | 0.2087% |     926 |

React navigation cases perform eight navigations per batch; first mount performs six
mount/unmount cycles. Vue cases perform eight native reactive updates per batch, with
mounting/assertions/cleanup outside timing. These are single-process baseline exports;
no BEFORE/AFTER delta or confidence interval is claimed before matching AFTER results.

**Three-family minimal bundles reproduce the original exactly.** The successful
`benchmarks/bundle-size/results/runs/link-formal-before/current.json` measures React,
Solid, and Vue minimal scenarios at the tests-only commit. Each scenario's entire metrics
object, including file names, raw/gzip/Brotli/initial totals, per-file bytes, and source
attribution, equals its original `link-architecture-baseline` entry. This snapshot covers
three scenarios, not all eighteen.

| BEFORE scenario      |   Raw B | Gzip B | Brotli B | Initial gzip B | JS files |
| -------------------- | ------: | -----: | -------: | -------------: | -------: |
| react-router.minimal | 267,648 | 85,961 |   74,919 |         85,822 |        2 |
| solid-router.minimal |  98,300 | 34,339 |   31,058 |         34,213 |        2 |
| vue-router.minimal   | 140,051 | 50,606 |   45,815 |         50,480 |        2 |

Additional native-binding BEFORE runs completed successfully: Solid client-links mean
14.942325 ms, p99 18.593042 ms, RME 0.5795%, n=670; Vue client-links mean 5.753818 ms,
p99 8.522292 ms, RME 0.8669%, n=1738. Sources are
`/private/tmp/link-formal-before-native-{solid,vue}.json` and successful matching logs.
Earlier isolated snapshots remain supporting evidence, not substitutes for the restored
implementation comparisons below.

### Formal AFTER — completed recorded scope

Runtime implementation was restored for these formal AFTER runs. These results use the
same production composition as the completed 26-case comparison, before the subsequent
generalized activity-coverage experiment described below.

Focused public tests now pass **40/40**: React 29/29 and Vue 11/11
(`/private/tmp/link-formal-after-tests.log`, successful Nx execution). The same original
baseline had ten failures, including all seven work-avoidance contracts and three prop
regression tests. Retention again passes **4/4**, React 3/3 and Vue 1/1, with matching
GC configuration (`link-formal-after-retention.log`, successful Nx execution).

The matching six-case lifecycle export and log are complete and successful:
`/private/tmp/link-formal-after-lifecycle.json` and `.log`. Units remain ms per batch.

| React workload                     | BEFORE mean | AFTER mean | Mean delta |    p99 before / after | RME before / after | Samples before / after |
| ---------------------------------- | ----------: | ---------: | ---------: | --------------------: | -----------------: | ---------------------: |
| departing owners                   |   27.857097 |  21.386804 |    -23.23% | 31.975417 / 26.836333 |  0.5932% / 1.4716% |              180 / 234 |
| persistent owners                  |   14.319136 |  14.479453 |     +1.12% | 17.430250 / 15.312125 |  0.4228% / 0.2489% |              350 / 346 |
| first mount                        |   19.105969 |  18.841241 |     -1.39% | 25.288250 / 23.231958 |  1.0240% / 0.8457% |              262 / 266 |
| isolated fanout unique 1000 search |    2.328876 |   0.547176 |    -76.50% |   2.638875 / 0.838667 |  0.1978% / 0.1796% |            2148 / 9138 |
| isolated fanout repeated 1000 hash |    2.234324 |   0.555169 |    -75.15% |   3.125500 / 0.887375 |  0.4342% / 0.2183% |            2238 / 9007 |
| isolated fanout active 1000 hash   |   61.822071 |  59.783962 |     -3.30% | 74.172667 / 67.266250 |  1.3960% / 0.6569% |                82 / 84 |

These independently sampled BEFORE/AFTER means show substantial departing-owner and
isolated inactive-fanout savings. Persistent-owner mean is slightly higher; first-mount
mean is slightly lower. Neither small delta is a paired equivalence result. Active-heavy
fanout still performs substantial work. The lower sample counts and tails of that case
also merit caution. The separate mount diagnostic initially failed at loader startup;
that attempt is **not a measurement**. The loader issue is fixed, and its completed
replacement measurement is recorded below; it is no longer an execution blocker.

Vue reactive-update and Solid/Vue client-links AFTER benchmarks are now complete. All
three matching logs report successful Nx execution. The matching JSON exports are
`/private/tmp/link-formal-{before,after}-{vue,native-solid,native-vue}.json`.

| Native workload                           | BEFORE mean | AFTER mean | Mean delta |    p99 before / after | RME before / after | Samples before / after |
| ----------------------------------------- | ----------: | ---------: | ---------: | --------------------: | -----------------: | ---------------------: |
| ref updates 200 reactive 0 static (vue)   |   11.453880 |  10.111741 |    -11.72% | 14.171000 / 12.519750 |  0.7042% / 0.5014% |              437 / 495 |
| ref updates 100 reactive 100 static (vue) |    5.401472 |   4.914015 |     -9.02% |   6.316417 / 5.458834 |  0.2087% / 0.1995% |             926 / 1018 |
| client-links navigation loop (solid)      |   14.942325 |   5.487767 |    -63.27% |  18.593042 / 8.047208 |  0.5795% / 0.6809% |             670 / 1823 |
| client-links navigation loop (vue)        |    5.753818 |   1.523403 |    -73.52% |   8.522292 / 3.163584 |  0.8669% / 1.0161% |            1738 / 6565 |

These are independently sampled descriptive comparisons, not paired confidence intervals
for differences. Native framework results apply to these explicit workloads and do not
establish a general all-application speedup or equivalence.

### Completed seven-pair first-mount diagnostic

`/private/tmp/link-mount-paired-fixed-result.json` records `complete: true`; the matching
`link-mount-paired-fixed.log` completes successfully. On Node 24.8.0/V8 13.6, fresh
sequential child processes alternate baseline/candidate order across seven pairs.
Each child performs at least two seconds/100 cycles of warm-up, then 1,500 timed cycles
in six-cycle batches with the same fixture assertions. No forced GC, profiler, or builds
run during measurement. The confidence sample is seven pairs, **not** 10,500 cycles.

| Metric          | Paired change |       95% interval | Verdict      |
| --------------- | ------------: | -----------------: | ------------ |
| Main-thread CPU |        +0.19% |   [-5.55%, +6.28%] | Inconclusive |
| Wall time       |        +0.15% |   [-5.61%, +6.25%] | Inconclusive |
| Process CPU     |        -1.75% | [-15.79%, +14.63%] | Inconclusive |

Intervals use Student-t on pair log ratios and assume independent, approximately normal
pair log ratios. Main-thread CPU means are 19.724425 versus 19.787523 ms per six-cycle
batch; the ratio estimate is paired and need not equal the ratio of arithmetic means.
These intervals do not prove equivalence or a mount improvement. Frozen bundle SHA-256:
baseline `7ac4460b9d0fa43f47f8f90469858aa1897161b40ca06ff7f668d8132435a405`,
candidate `90b5a9a4d1e28a2ecac9256838b23c0576d11d1b43820ec4794c84bafbf05d17`.
The measured candidate predates generalized activity coverage.

### Generalized activity coverage — retained after independent attribution

The retained refinement replaces the fixed all-source activity mask (`7`) for path-index skipping
with the actual active predicate's fields: pathname (`1`), search (`2`) when included,
and hash (`4`) when included. A destination already observing all of those fields can
skip redundant pathname index membership. The motivating common case is a dependency
mask of `3`, where 200 distinct destinations can otherwise create 200 redundant sets.
This extends the existing coverage argument; it is not the previously rejected removal
of path skipping.

Focused correctness passes **347/347**, React 184 and Vue 163, in
`/private/tmp/link-active-coverage-tests.log`; the additional activity matrix passes
**17/17** in `link-activity-matrix-tests.log`. Both logs report successful Nx execution.

The completed seven-pair mount comparison against the **pre-coverage candidate**, not
against the original implementation, is inconclusive: main-thread CPU **-1.15%**
**[-4.09%, +1.88%]**, wall **-1.10% [-4.08%, +1.98%]**, process CPU
**-4.93% [-16.14%, +7.78%]**. It uses the same fresh-process protocol as the mount
diagnostic above. Sources: `/private/tmp/link-active-coverage-paired.json` (`complete: true`)
and matching successful `.log`. Baseline hash is the prior mount candidate
`90b5a9a4d1e28a2ecac9256838b23c0576d11d1b43820ec4794c84bafbf05d17`;
experimental hash is `bdd30000b12e0814e26bb70ae5803502b9b55ca5015ac701dfe6be0fb775b9d2`.

Its independent six-case lifecycle run also completed successfully
(`/private/tmp/link-active-coverage-lifecycle.json` and `.log`). These unpaired ms/batch
results do not resolve a small performance benefit over the preceding composition.

| Activity-coverage workload         |   Mean ms |    p99 ms |     RME | Samples |
| ---------------------------------- | --------: | --------: | ------: | ------: |
| departing owners                   | 20.892939 | 33.527083 | 1.5834% |     240 |
| persistent owners                  | 13.939326 | 15.844125 | 0.3253% |     359 |
| first mount                        | 18.666905 | 21.645291 | 0.5982% |     268 |
| isolated fanout unique 1000 search |  0.552872 |  0.855958 | 0.4853% |    9044 |
| isolated fanout repeated 1000 hash |  0.553357 |  0.874708 | 0.2089% |    9036 |
| isolated fanout active 1000 hash   | 61.456605 | 72.188625 | 1.1041% |      82 |

React minimal grows from **87,805 to 87,831 gzip B (+26)**, raw +107 B, Brotli +57 B.
Both named snapshots succeed: `runs/link-mask-array/current.json` and
`runs/link-active-coverage/current.json` under `benchmarks/bundle-size/results/`.
The change is **retained** after the seven-replica relative-destination comparison resolves
a benefit: main-thread CPU **-3.84% [-5.57%, -2.08%]** and wall time
**-4.02% [-5.93%, -2.07%]** against the pre-coverage attribution baseline. The completed
`/private/tmp/link-active-coverage-relative.json` and successful matching `.log` use the
stable ABBA/BAAB protocol described above. Baseline SHA-256 is
`bf166be4d7ffee8605e3acbf141a7c83469db744d32d0071df4d0e13b6e575c8`, matching the
pre-generalization composed client bundle; experimental SHA-256 is
`6fc22f6161865faa18e31c6a76faf42830dcf10dafd7eb13bcb552e832bcfa06`.
This focused benefit supports accepting +26 gzip B. First-mount evidence remains
inconclusive; the relative workload does not establish a general performance improvement.

The client portion of the full 26-case comparison, formal AFTER runtime benchmarks,
and original-versus-candidate paired mount results remain evidence for the
**pre-generalization** client composition. The thirteen SSR results remain applicable
because final SSR emission is byte-identical, as verified above. The seventeen activity matrix tests are committed in `b35ab99f3d`.
With runtime/docs temporarily stashed, the original implementation also passed **17/17**
(`/private/tmp/link-activity-matrix-before.log`, successful Nx execution). This matrix
therefore checks preserved public behavior rather than manufacturing a new failure.
Runtime/docs are restored. The six-step final package/consumer/hydration validation in
`/private/tmp/link-final-validation.py` has completed successfully, as detailed below.
Selected browser checks and final composed retention also pass, as recorded below;
the full eighteen-scenario bundle measurement also succeeds, as recorded above.

Final unit runtime assertions passed, but React's Vitest source typecheck found two new
fixtures missing the required `to` prop. Both dynamic-`href` fixtures now also provide
`to="/a"`; no production code changed. The corrected, type-valid public usages reproduce
the same **three failures and one pass** on the original implementation
(`/private/tmp/link-typed-memo-baseline.log`). This preserves the prop-regression evidence
without relying on invalid fixture inputs. Formatting-only wrapping was synchronized to
the baseline. The restarted final validation now completes successfully, including source
typechecks; the earlier failed invocation is preserved here rather than treated as green.

### Final composed package, consumer, and hydration validation — passed

All six sequential validation steps completed successfully on the composition including
activity-aware coverage. The source-typecheck fixture correction above is included.

| Step                | Verified scope/result                                                                                                                      | Log in `/private/tmp`            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Core/binding unit   | 7,047 runtime passes: history 122; core 3,626; React 1,250; Solid client 979 + SSR 75; Vue client 995. Source typechecks report no errors. | `link-final-core-unit.log`       |
| Core/binding checks | Types, eslint, and build targets succeed for history/core/React/Solid/Vue; Vue's additional type/SSR runner passes 140 tests.              | `link-final-core-checks.log`     |
| Consumer unit       | Successful unit targets for 14 projects, including generator/plugin, Start cores/bindings, devtools, SSR Query, and schema adapters.       | `link-final-consumer-unit.log`   |
| Consumer checks     | Types/eslint/build for 25 projects, 108 total tasks including dependencies; 16 task outputs reused from Nx cache.                          | `link-final-consumer-checks.log` |
| Start entries       | React Start, Solid Start, and Vue Start build targets succeed.                                                                             | `link-final-start-build.log`     |
| Hydration           | React 6/6 and Solid 3/3 unit tests; both client type targets succeed.                                                                      | `link-final-hydration.log`       |

The core runtime total excludes four expected core failures and ten existing skips
(core three, React four, Solid one, Vue two). Consumer logs retain their recorded expected
failures, skips/todo, and non-failing lint warnings; none is counted as a new ordinary pass.
Successful Nx targets may reuse valid dependency outputs; this is not a claim that every
task was uncached or that all repository tests were run.

### Final browser and composed retention validation — passed

All selected browser suites completed successfully, **374 tests total**:

| Suite                                                  | Passes | Log in `/private/tmp`            |
| ------------------------------------------------------ | -----: | -------------------------------- |
| React file-based router                                |    206 | `link-final-router-e2e.log`      |
| Solid file-based router                                |    120 | `link-final-router-e2e.log`      |
| Vue SFC file-based router                              |     22 | `link-final-router-e2e.log`      |
| Solid Start special-character navigation, Vite preview |     13 | `link-final-solid-start-e2e.log` |
| Vue Start special-character navigation, Vite preview   |     13 | `link-final-vue-start-e2e.log`   |

These are the explicitly selected router/Start suites, not the entire repository e2e suite.
Final composed GC retention also completed successfully: React **3/3**, Vue **1/1**, in
`/private/tmp/link-final-composed-retention.log`. This reruns the four object-liveness
assertions with the retained activity-coverage refinement included, under the diagnostic
configuration described above.

The required patch changeset is generated in `.changeset/busy-aliens-carry.md` for history,
router-core, and the React/Solid/Vue router packages. Recorded functional validation,
formal BEFORE/AFTER, retained-change attribution, and full eighteen-scenario bundle
measurement and emitted-code auditing have completed for the recorded scope.
Earlier pre-generalization client runtime snapshots retain their source qualification;
the unchanged emitted SSR hash validates reuse of all thirteen SSR results.

The measured outcome is selective client-work reduction with larger bundles. Initial-mount
and SSR performance remain inconclusive. This report makes no smaller-bundle, universal-
speedup, or performance-equivalence claim.
