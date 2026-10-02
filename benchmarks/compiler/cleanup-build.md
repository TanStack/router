# Cleanup metadata: complete-build conditions and lifetime

This follow-up compares unchanged #8524 (`c6c33e22857cdefcad00e217201f05e5bcd39551`)
with the immutable-cleanup-metadata candidate. Production code and
cache policy are unchanged from the [original evaluation](RESULT-optimization-cleanup-metadata.md).

## What remains alive

Metadata is owned by the reusable source analysis, not by a batch of siblings.
There is no last-sibling completion event or counter:

- Router retains it in the existing 128-entry LRU. It is eligible for collection
  after eviction, source replacement, or the plugin's `buildEnd()` cache clear.
  An entry can therefore remain through the module graph phase even after all
  of its requested outputs have finished. Build-end clearing happens before
  output rendering/minification/writing, not only when the entire build returns.
- Hydrate retains it with its environment-scoped source entry until source
  invalidation/replacement or collection of the owning plugin. Its source map has
  no corresponding build-end clear. The Vite compiler map's build-start reset
  does not clear the Hydrate plugin's separate map. Keeping a builder/plugin
  alive can therefore retain this metadata after the build completes.
- Standalone `removeUnusedBindings` creates local metadata for each call.

The source ASTs were already retained by those owners on #8524; the added cost is
maps/sets referring to existing nodes and symbols. Metadata is lazy, so an
analysis that never runs cleanup does not populate it. Releasing it precisely
on the last sibling would require a reliable bundler lifecycle signal; counting
configured groups alone is insufficient because requests can be skipped,
repeated, reordered, or served by output caches. This follow-up does not add a
second lifetime policy.

Source locations: `router-code-splitter-plugin.ts` (`getRouteAnalysis`,
`buildEnd`), `hydrate-when-transform.ts` (`SourceEntry`, `setSource`,
`invalidateModule`), and `vite/start-compiler-plugin/plugin.ts` (plugin ownership
and `buildStart`).

## Controlled complete builds

The old route-heavy workload had small sources, and its larger working sets
frequently missed the analysis cache. The new `cleanup-build.mjs` fixture varies
three independent conditions:

- 64 routes fit the cache, while 192 exceed it; neither changes the 128-entry
  production limit or bundler request order.
- Two, 12, or 48 helpers per loader/component/pending/error pipeline vary the
  number of source declarations and nested bindings. Every helper contributes
  to live output. The 48-helper case is a deliberately large stress fixture.
- One grouped split versus four separate groups changes sibling reuse with
  identical source files. Shared state is used by reference and component
  outputs, requiring the shared-module compiler path too.

Each sample is a fresh Node 24.8.0 process on an Apple M3 Max, with 11 alternating
baseline/candidate pairs per case. Builds run serially without simultaneous
agent tests or package builds. Package outputs come from the previously validated
Nx builds and are fingerprinted in every sample. Timing includes the production
Vite build, route generation, transforms, bundling, minification, source maps and
writes; it excludes fixture creation, plugin-module imports, post-build checking,
TypeScript checking and Nx orchestration. OS filesystem caches are warm.

The harness requires identical generated inputs and complete emitted JavaScript,
expected chunk counts, and live helper markers. Separate instrumented runs count
metadata construction and time cleanup work; their build times are excluded
from speed claims. Weak references and forced collection around the existing
build-end clear verify lifetime without adding runtime cleanup behavior.

## Results

Negative changes mean faster builds. Each row is 11 process pairs. Full
JavaScript output is identical within every baseline/candidate comparison.

|            Routes | Helpers per pipeline | Split groups | Baseline median ms | Candidate median ms | Change | Candidate faster pairs |
| ----------------: | -------------------: | -----------: | -----------------: | ------------------: | -----: | ---------------------: |
|                64 |                    2 |            4 |                664 |                 658 |  -1.0% |                   8/11 |
|                64 |                   12 |            1 |              1,347 |               1,321 |  -2.0% |                   7/11 |
|                64 |                   12 |            4 |              1,957 |               1,884 |  -3.8% |                  10/11 |
|               192 |                   12 |            4 |              5,831 |               5,855 |  +0.4% |                   6/11 |
|                64 |                   48 |            4 |              7,017 |               6,573 |  -6.3% |                   9/11 |
| 64 (confirmation) |                   12 |            4 |              2,011 |               1,947 |  -3.2% |                  10/11 |

The supported whole-build improvement is the 64-route, 12-helper, four-group
case: about 3–4%, repeated in a separate confirmation batch, with 20/22 pairs
faster. The original batch's between-process CV is 1.9% baseline and 2.5%
candidate. The confirmation batch is noisier (10.1% / 9.3%), but preserves the
median improvement and direction in 10/11 pairs. Module-graph completion medians
fall from 1,628 to 1,566 ms in the first batch and 1,678 to 1,590 ms in the
confirmation, consistent with savings during compilation.

Small modules and the single-group case are inconclusive. Their paired-mean
bootstrap intervals include zero. The overflowing-cache case has essentially
unchanged medians and only 6/11 faster pairs; its favorable paired mean depends
on slow baseline outliers and does not establish a reliable gain. The 48-helper
stress case has large swings (including a candidate slowdown above 20% in one
pair); its paired-mean interval also includes zero. Its favorable median alone
is not evidence of a repeatable 6% build gain.

[Summary and uncertainty estimates](results/cleanup-build-summary.json) preserve
all metrics. The first positive batch has a paired mean change of -3.35%, with a
95% bootstrap interval of -4.54% to -2.10%; confirmation is -5.52%, with an interval
of -9.28% to -0.99%. These descriptive intervals resample 11 local paired deltas
20,000 times with seed 8524. They do not predict effects across applications or
remove thermal, GC, and operating-system variation.

Timing records:
[small modules](results/cleanup-build-r64-h2-g4.json),
[one group](results/cleanup-build-r64-h12-g1.json),
[four groups](results/cleanup-build-r64-h12-g4.json),
[overflowing cache](results/cleanup-build-r192-h12-g4.json),
[large-source stress](results/cleanup-build-r64-h48-g4.json),
[independent confirmation](results/cleanup-build-r64-h12-g4-confirmation.json).

## Reuse and memory attribution

One separate instrumented pair per case counts the actual plugin work. The root
route adds an analysis but no cleanup. With four groups, each route runs six
cleanups: reference, shared module, and four virtual groups. One grouped split
runs three. The request stream is the ordinary production Vite stream.

| Routes / helpers / groups | New source analyses, both variants | Cleanup calls, both variants | Metadata builds before → after | Additional heap released at cache clear |
| ------------------------- | ---------------------------------: | ---------------------------: | -----------------------------: | --------------------------------------: |
| 64 / 2 / 4                |                                 65 |                          384 |                       384 → 64 |                                0.85 MiB |
| 64 / 12 / 1               |                                 65 |                          192 |                       192 → 64 |                                5.49 MiB |
| 64 / 12 / 4               |                                 65 |                          384 |                       384 → 64 |                                5.34 MiB |
| 192 / 12 / 4              |                                577 |                        1,152 |                    1,152 → 576 |                               10.31 MiB |
| 64 / 48 / 4               |                                 65 |                          384 |                       384 → 64 |                               20.37 MiB |

The overflow case rebuilds each route's analysis three times. Some reuse remains
(two cleanups per metadata build on average), but substantially less than six
cleanups per metadata build in the fitting four-group case. For that fitting
case, separately instrumented cleanup time falls from 325 to 255 ms; those
instrumented times are explanatory and excluded from the timing table above.

Additional released heap is the candidate's before/after-clear heap decrease
minus the baseline's decrease, after explicit GC. It estimates added cache cost,
not an exact allocation census. The positive workload's direct before-clear heap
difference is also about 5.3 MiB. All tracked analyses are unreachable after the
existing clear plus an event-loop turn and GC, in both variants and every case.
The additional retained heap is therefore source-cache lifetime, not a leak or a
last-sibling lifetime. RSS need not fall when objects become collectible.

Peak process memory is higher in the positive workload: median RSS is 705 →
736 MiB in the first batch and 716 → 750 MiB in confirmation. That 31–34 MiB
increase exceeds the measured live metadata and also reflects native allocation,
GC timing, and allocator high-water marks. This is a speed/memory tradeoff, not
a memory optimization.

Diagnostic records:
[small modules](results/cleanup-build-r64-h2-g4-diagnostic.json),
[one group](results/cleanup-build-r64-h12-g1-diagnostic.json),
[four groups](results/cleanup-build-r64-h12-g4-diagnostic.json),
[overflowing cache](results/cleanup-build-r192-h12-g4-diagnostic.json),
[large-source stress](results/cleanup-build-r64-h48-g4-diagnostic.json).

## Conditions supported by these measurements

The benefit becomes visible when source declaration indexing is a meaningful
part of compilation, multiple outputs reuse the same source analysis, and that
analysis survives until sibling requests arrive. Small sources leave too little
work to save; fewer outputs reduce reuse; cache eviction reduces reuse; very
large sources introduce enough allocation/GC variation to obscure the saving.
These are controlled React Router builds, not a new claim about complete Start
builds or an application-wide speed guarantee. Hydrate's longer metadata lifetime
is established from its ownership/invalidation code and the earlier retention
benchmarks; it is not changed here.

Only benchmark code and reports were added in this follow-up. The implementation
and all previous correctness/bundle validations remain unchanged.
