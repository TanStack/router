# Native Yuku compiler migration

**Current status: the three CI regressions are fixed. Test, Preview,
Version Preview, and Bundle Size CI pass at `25fe0cedeb`; all five local compiler
package gates and the expanded local browser matrix also pass. The final
regression measurements show no observed performance or memory regression,
and all 38 client JavaScript files across 18 scenarios are byte-identical
before and after the fixes.** The
recorded Yuku 0.12.0 measurements below precede this CI follow-up: they show
lower build time and peak process memory than Babel on all three measured
workloads, with all 18 client bundle scenarios matching the Babel baseline.

## CI follow-up after the main merge

CI at `9594d49eaa` reported nine failed targets and 17 dependent targets that
could not execute. The failures exposed three integration regressions:

- Rsbuild received serialized source-map strings from the Start compiler host.
  Downstream JSX loaders require Source Map v3 objects. Both ordinary and
  virtual-module transform paths now return the objects directly; the existing
  Solid deferred-hydration Rsbuild build reproduced the failure and passes
  with the fix.
- External import transforms entered generic built-in alias tracing, causing
  the compiler to try loading bundler-owned RSC virtual modules as files.
  Configured external calls now retain their resolved transform kind and use
  exact import bindings. Public compiler regressions cover named aliases,
  static namespace calls, unrelated virtual imports, computed/member access,
  and local shadowing. The compiler test file passes all 66 cases after the
  failing regressions were established.
- Syntax errors lost readable line/column positions when the native diagnostic
  offset was embedded in the message. The error path now derives UTF-16
  line/column positions and exposes `loc`/`pos`, retaining the filename and
  native wording. Six public regressions failed before the fix and pass after
  it, covering Unicode and all JavaScript line terminators. The actual Rsbuild
  overlay passes its full client/server message and import-trace assertions.

Supporting commit `a5eac3fc2e` preserves the new tests and updated overlay
expectations; fix commit `25fe0cedebfd642f4181c2339dea876c2d432ab9` passes
[Test, Preview, and Version Preview CI](https://github.com/TanStack/router/actions/runs/36337536321)
and [Bundle Size CI](https://github.com/TanStack/router/actions/runs/36337536358).
The [Test job](https://github.com/TanStack/router/actions/runs/36337536321/job/108671150455)
reports 846 successful tasks and zero failures. This Linux GNU run exercises
the native packages and compiler; Linux musl and Windows remain uncovered.
These fixes use the existing native compiler architecture and do not work around
dependency defects.

All five local package gates pass: router-utils 57, router-generator 261 runtime
plus 12 fixture type tests, router-plugin 716, start-plugin-core 593, and
react-start-rsc 61, with TypeScript 5.6–7, lint, and package integrity/export
checks: 1,700 unit/fixture-type tests in total. Eight local application aggregates
and dedicated Vite/Rsbuild server-function suites pass 1,516 browser test
executions, with 20 existing skips and zero failures. These are executions across
modes and aggregate reruns, not unique test definitions. This includes the
previously unexecuted Rsbuild consumers and RSC browser suites; the separate
RSC Rsbuild production build also passes. The
[CI follow-up validation record](benchmarks/compiler/results/yuku-ci-validation.json)
preserves commands, target definitions, counts, and unchanged compiler
source/output fingerprints throughout validation.

The final workflow compared the native compiler before the fixes at
`a5eac3fc2e` with `25fe0cedeb`, using matching inputs and three fresh processes
per phase on the same macOS arm64 machine. Median splitter time was
100.70 → 100.88 ms (+0.18%, overlapping ranges), and Start build time was
1087.59 → 1051.18 ms (−3.35%). Median peak process RSS was
124.22 → 123.83 MiB and 567.33 → 550.81 MiB, respectively. These sequential,
nonalternating samples are a limited regression check, not evidence of a
statistically established speedup. The splitter used one warmup and three
measured passes per process; Start used one production build per process.
The [final workflow record](benchmarks/compiler/results/yuku-ci-workflow-after.json)
links all raw samples and input/compiler fingerprints.

All 18 final attributed client bundle scenarios have zero changes in aggregate
raw/gzip/Brotli, initial-load sizes, and chunk counts. All 38 emitted JavaScript
files also match byte for byte, with hashes checked independently. Both Hydrate
scenarios retain zero `H0` lazy factory calls in the initial entry and exactly
one in the deferred component chunk. See the
[final comparison](benchmarks/compiler/results/yuku-ci-bundle-comparison.json).
The earlier Babel/native measurements and validation counts below remain
evidence for their recorded revisions, not new measurements of this follow-up.

## Scope and architecture

The compiler packages use Yuku 0.17.0 for parsing, semantic analysis, AST
transformation, and code generation. The recorded measurements below used
0.12.0 and have not been repeated for 0.17.0. There is no Babel compatibility layer or
fallback in the migrated compiler. Babel can still occur transitively in
unrelated framework tooling.

The migration covers router-utils, route generation, route splitting and HMR,
Start server functions and environment transforms, import protection, deferred
hydration, and the React Start RSC CSS transform. Runtime route APIs remain
unchanged. Exported compiler extension interfaces intentionally change from
Babel nodes and traversal paths to native Yuku nodes and semantic context;
the changeset marks those packages as major releases.

An immutable source module owns syntax and symbol information. Each generated
output has its own cloned tree and a mapping back to source nodes. Chunk
ownership and dependency analysis use native symbol identity. Generated
references carry explicit binding provenance so lexical cleanup preserves
references introduced by transforms without guessing from identifier names.

Route analysis is reused across grouping detection, shared-binding planning,
and output generation. The bundler plugin keeps a bounded source-sensitive
cache and clears it at build completion. This is opportunistic reuse, not a
guarantee of one parse per route for every request order. In the initial
250-route Vite profile, the 128-entry bound caused each route to be analyzed
three times. Generated snippets also require parsing separately.

## Recorded 0.12.0 correctness and provenance before the CI follow-up

The comparison baseline is main commit `1e113034bdeccf696e6658d0b886439deb023bfd`.
The candidate starts at merge commit `c32cb041a25679107a2b22454499dcf98ff9ec75`
with the 0.12.0 dependency upgrade and expanded regression tests. Supporting
commit `d863fc26f5928780e3db179ce3118f65eafd9dd2` preserves the three added/expanded
test files for the final workflow; its restored source/output fingerprints match
the five-pair measurements. Runtime compiler
source required no changes for this upgrade. The baseline compiler source and
built JavaScript fingerprints match the earlier Babel baseline; new measurements
record both checkout revisions, compiler source/output hashes, dependency
versions, and input hashes. A source fingerprint includes package manifests,
so upgrading external native dependencies changes it even when built compiler
JavaScript is identical.

Package unit/typechecked counts are router-utils 51, router-generator 261 runtime
plus 12 fixture type tests, router-plugin 716, start-plugin-core 584, and
react-start-rsc 61. TypeScript 5.6 through 7, lint, and package integrity/export
checks passed. Public Vite regressions execute `Widget`, `_Widget`, `$Widget`,
`ÉWidget`, and `éWidget`, and verify function identity across separate loader and
component chunks. Hydrate checks positively identify bound captured references;
missing references can no longer pass through an empty unresolved-reference list.
See [Router verification](benchmarks/compiler/results/yuku-0.12-verification.json)
and [Start/RSC verification](benchmarks/compiler/results/yuku-0.12-start-rsc-validation.json).

Production browser checks passed for React/Solid route splitting (6/5), Vue
JSX/SFC (22/22), server functions under Vite/Rsbuild (53 each), deferred hydration
under React/Solid (16/15; one React development-only case skipped), and import
protection under Vite/Rsbuild (87 each). Live Vite HMR passed 28 tests. RSC's
production build passed; no RSC browser-suite run is claimed. Dependency builds
could use valid Nx cache entries; the recorded browser suites executed. See
[application verification](benchmarks/compiler/results/yuku-0.12-app-validation.json)
and the route-consumer section of the Router verification record.

Upstream [#204](https://github.com/yuku-toolchain/yuku/issues/204) and
[#202](https://github.com/yuku-toolchain/yuku/issues/202) are fixed in 0.12.0.
Installed-package checks report zero JSX-reference failures and preserve all
three tested purity-comment forms through default code generation. Issue
[#203](https://github.com/yuku-toolchain/yuku/issues/203) remains open for
invalid-AST crash hardening; it is not a demonstrated supported-input blocker.

Official Node 20.19.0 loaded Router's public CommonJS entrypoints and exercised
analysis/cloning/generation; Node 22.12.0 loaded Start's public ESM entrypoints.
These [0.12.0 smoke checks](benchmarks/compiler/results/yuku-0.12-node-smoke.json)
and the main Node 24.8.0 checks ran on macOS arm64; the Node 20/22 smoke checks
were not repeated for the CI follow-up. The successful Linux GNU CI run at
`25fe0cedeb` now adds native package/compiler coverage on that platform.
Linux musl and Windows native installation/import behavior remain unverified;
these results must not be presented as cross-platform certification.

## Recorded 0.12.0 performance and bundles before the CI follow-up

Five fresh baseline/candidate pairs alternate AB/BA order per workload. Compiler
processes use two warmups and ten measured corpus passes; application samples
are one production build per process. The quiet runs use Node 24.8.0 on Apple M3
Max. Input hashes match between engines, and compiler source/output fingerprints
and dependency versions remain stable across all 30 samples.

| Workload                                | Babel median (min–max), ms | Yuku 0.12 median (min–max), ms | Time reduction | Median peak process RSS, Babel → Yuku |
| --------------------------------------- | -------------------------: | -----------------------------: | -------------: | ------------------------------------: |
| Complete splitter, original 52 fixtures |     323.36 (310.05–340.62) |            94.18 (90.59–95.93) |          70.9% |                   405.25 → 260.98 MiB |
| Synthetic 250-route Vite build          |  1916.48 (1850.32–2013.52) |      1098.14 (1079.48–1233.97) |          42.7% |                   719.30 → 649.30 MiB |
| Start server-functions production build |  1588.83 (1544.65–1756.59) |      1061.93 (1054.32–1148.69) |          33.2% |                   659.14 → 547.72 MiB |

Sample coefficients of variation range from 2.6% to 5.6%. These are workload-level
medians, not tail-latency estimates or guarantees for every application. Both
splitters emit 517 modules; both synthetic applications emit 751 chunks and
722,613 JavaScript bytes. Both Start builds emit 163 files, with JavaScript bytes
of 1,214,457 versus 1,208,118. Counts and raw sizes do not replace the client gzip
bundle comparison. Raw samples and full provenance are in
[yuku-0.12-alternating.json](benchmarks/compiler/results/yuku-0.12-alternating.json).

Peak RSS includes each Node process and its in-process native allocations, not
simultaneous subprocess totals. These comparisons show lower memory than Babel;
they do not establish a memory improvement over the historical 0.11.0 runs. In
particular, the new splitter's median peak RSS is higher than the earlier native
measurement. Separate sessions do not establish a controlled 0.11.0-to-0.12.0
regression or its cause. Do not combine samples from the two measurement windows.

Separate native reuse attribution measured 88.67 ms with reuse versus 128.30 ms
without (30.9% lower), and median peak RSS of 246.20 versus 338.77 MiB. Five fresh
processes per mode used two warmups and ten measured passes, rotating mode order.
A separate diagnostic confirms identical generated code/source-map SHA-256
digests. See [reuse timings](benchmarks/compiler/results/yuku-0.12-reuse.json)
and [output digests](benchmarks/compiler/results/yuku-0.12-reuse-digest.json);
diagnostic timings are excluded from the speed comparison.

Separate sequential stress runs used three fresh processes per engine and
matching input hashes. At 500 Hydrate boundaries, client compilation measured
76.90 → 60.57 ms (267.77 → 164.11 MiB peak RSS), and server compilation measured
53.71 → 38.34 ms (204.53 → 124.14 MiB), using one warmup and three measured
compiles. The 1,000-binding splitter used one warmup and two measured passes:
3924.50 → 183.04 ms (364.19 → 173.94 MiB), with 12 outputs per engine. Generated
code/map sizes differ between printers; matching output counts are not a semantic
equivalence assertion. Records: [Hydrate client baseline](benchmarks/compiler/results/yuku-0.12-hydrate-client-baseline.json)
and [candidate](benchmarks/compiler/results/yuku-0.12-hydrate-client-candidate.json),
[Hydrate server baseline](benchmarks/compiler/results/yuku-0.12-hydrate-server-baseline.json)
and [candidate](benchmarks/compiler/results/yuku-0.12-hydrate-server-candidate.json),
[destructuring baseline](benchmarks/compiler/results/yuku-0.12-bindings-1000-baseline.json)
and [candidate](benchmarks/compiler/results/yuku-0.12-bindings-1000-candidate.json).

The larger 750-route workload measured 5004.05 → 2843.16 ms and 1296.31 →
1123.72 MiB median peak RSS across three fresh processes per engine. Both emitted
2,251 chunks and 1,641,651 JavaScript bytes from matching inputs, with the
production cache bound still 128. See [baseline](benchmarks/compiler/results/yuku-0.12-routes-750-baseline.json)
and [candidate](benchmarks/compiler/results/yuku-0.12-routes-750-candidate.json).
These sequential stress runs supplement the five-pair primary comparison.

Separate single-run process-tree diagnostics sampled every 50 ms: route-build
peaks were 755.69 → 625.17 MiB, and Start-build peaks were 654.73 → 547.34 MiB.
No descendants were observed, and peaks between samples may be missed. These
diagnostic timings are excluded from speed claims. See route
[baseline](benchmarks/compiler/results/yuku-0.12-process-tree-routes-baseline.json)/[candidate](benchmarks/compiler/results/yuku-0.12-process-tree-routes-candidate.json)
and Start [baseline](benchmarks/compiler/results/yuku-0.12-process-tree-start-baseline.json)/[candidate](benchmarks/compiler/results/yuku-0.12-process-tree-start-candidate.json).

## Recorded 0.12.0 client bundles and workflow before the CI follow-up

All 18 scenarios completed with source attribution enabled and package builds
through Nx. Baseline main `1e113034bd` and the restored 0.12.0 candidate have
identical raw, gzip, Brotli, initial raw/gzip/Brotli, and JavaScript chunk-count
metrics in every scenario. This includes all React/Solid/Vue Router and Start
cases, React Start query integration and Rsbuild variants, and both deferred
hydration cases. The old +65 raw-byte Hydrate residues and +33/+32 gzip increases
are absent. An independent byte-for-byte comparison also verified all 38 emitted
client JavaScript files across the 18 scenarios. In both Hydrate cases, the eager
entry contains no `H0` lazy factory and the component chunk contains exactly one.
Per-file hashes and emitted-code/source-map attribution are preserved in the
[comparison record](benchmarks/compiler/results/yuku-0.12-bundle-comparison.json).
Complete attributed snapshots are
[before](benchmarks/compiler/results/yuku-0.12-bundle-before.json) and
[after](benchmarks/compiler/results/yuku-0.12-bundle-after.json).

The same five-name public JSX test ran in the separate main baseline checkout
and restored candidate. Babel rendered and executed loaders for every name but
failed shared-function identity for `_Widget`, `$Widget`, and `éWidget` (2 passed,
3 failed). Yuku 0.12.0 passed all five, including identity. These are preexisting
baseline ownership limitations, not new rendering failures. The baseline test
file was restored afterward. See the durable
[workflow record](benchmarks/compiler/results/yuku-0.12-workflow-contracts.json).

The dependency upgrade was stashed and restored around this final workflow;
the Babel BEFORE implementation came from the separate main checkout. Matching
52-fixture smoke runs used one process, one warmup, and three measured passes:
355.22 → 99.99 ms and 382.52 → 123.36 MiB peak RSS. These verify the workflow,
not statistical precision; performance conclusions use the five alternating
pairs. Source/output fingerprints and dependency versions match those primary
runs. Raw [before](benchmarks/compiler/results/yuku-0.12-workflow-before.json)
and [after](benchmarks/compiler/results/yuku-0.12-workflow-after.json) records
preserve the configuration.

All baseline bundle measurements succeeded. Git metadata reporting initially
failed because that shell resolved Apple Git with an unaccepted Xcode license;
the report was regenerated from completed measurements using Homebrew Git. This
was a report-only repair, recorded in the workflow artifact; measurements were
not replaced or inferred.

## Historical 0.11.0 evaluation

Everything in this section records the earlier 0.11.0 evaluation, including its
source attribution, implementation corrections, and stash-workflow checks.
Its JSX correctness blocker was subsequently fixed by the upstream release;
current correctness and acceptance status are stated above. Preserve these
figures as historical evidence rather than combining them with fresh samples.

### Evaluation design

The baseline compiler is commit `bb4423e09872aee4f2544600d0eba3303fc7db56` in a
separate managed checkout. Supporting commits `0ec43cd02c` and `f69eb7a5aa`
add only tests and benchmark artifacts to both checkouts; they do not change
that baseline compiler. The five alternating pairs were recorded at the first
supporting commit; the later stash-workflow checks and bundles use the second.
Measurements use Node 24.8.0 and pnpm 11.21.0 on macOS arm64
(Apple M3 Max), the same input sources, and freshly built workspace packages.
Reported speed runs exclude concurrent tests, builds, and installations.
Instrumented profiling and process-tree memory sampling run separately from
uninstrumented timing.

The compiler corpus generates every configured output for three grouping
configurations. Application measurements include Vite configuration loading,
transforms, bundling, minification, and output writes; they exclude the separate
TypeScript check and Nx orchestration. Fresh processes still share warm OS
filesystem caches. Results are workload-specific.

The native AST model, symbol-based cleanup, and consuming transforms are a
dependent implementation group: the breaking AST interface cannot be switched
independently in one consumer. Analysis reuse is separately attributable with
the native benchmark's no-reuse mode, without adding a production fallback or
compatibility option. Test, documentation, and benchmark changes do not affect
emitted application code.

### Historical speed and process-memory results

Five fresh baseline/native pairs alternate execution order between repetitions.
Each compiler process performs two warmups and ten measured corpus passes;
application samples are one complete production build per fresh process. The
table reports medians across processes. Source and executable compiler hashes
were stable throughout, and baseline/candidate input hashes match.

| Workload                                     |      Babel |       Yuku | Time reduction | Median peak RSS, Babel → Yuku |
| -------------------------------------------- | ---------: | ---------: | -------------: | ----------------------------: |
| Complete splitter, original 52 fixtures      |  295.71 ms |   88.70 ms |          70.0% |           397.25 → 200.66 MiB |
| Synthetic 250-route Vite production build    | 1807.10 ms | 1054.69 ms |          41.6% |             732.9 → 647.8 MiB |
| Real Start server-functions production build | 1530.60 ms | 1038.35 ms |          32.2% |             658.7 → 545.6 MiB |

The compiler process averages ranged from 294.85–302.86 ms for Babel and
88.11–90.38 ms for Yuku. Production route builds ranged from 1720.87–1871.08 ms
and 1043.91–1104.89 ms respectively; Start builds ranged from 1467.79–1571.32 ms
and 1013.42–1074.08 ms. Sample coefficients of variation were 1.1–3.4% across
the six timing groups. Five processes support these workload-level conclusions,
not tail-latency estimates or guarantees for every application.

The synthetic route outputs remain 751 chunks and 722,613 JavaScript bytes.
Both Start builds emit 163 files; emitted JavaScript across the application
output decreases from 1,214,457 to 1,208,118 bytes. These raw output counts do
not substitute for the separate client gzip bundle-size comparison.

Raw samples, run order, source hashes, executable hashes, and dependency
versions are in [final-alternating.json](benchmarks/compiler/results/final-alternating.json).

Final native reuse attribution measured 91.69 ms with reuse versus 130.85 ms
without (29.9% lower), with median peak RSS of 199.0 versus 335.0 MiB. A
separate diagnostic SHA-256 check confirms identical generated code and source
maps; hashing is excluded from speed measurements.

Separate process-tree sampling at 50 ms intervals measured route-build peaks
of 751.3 → 633.8 MiB and Start-build peaks of 655.4 → 554.4 MiB. No descendant
subprocesses were observed in these runs. Short-lived peaks can fall between
samples; these diagnostic timings are not included in the speed table.

Cache experiments compared bounds of 128, 256, and 512. With 250 routes,
increasing the bound reduced full route analyses from 751 to 251. With 750
routes, the working set still exceeded each bound and analysis reuse remained
limited. Raising the bound to 512 lowered the observed median by about 3.3%
in that larger case while increasing peak RSS by about 4.0%; three speed
samples per variant do not establish a statistically reliable benefit. The
750-route diagnostics observed approximately 8/15/29 MiB heap drops across
cache clearing with forced GC at the respective bounds. These are observations,
not exact attribution of native allocations to the cache. The production
default remains 128: the small-workload gain does not justify greater retained
memory and weak gains when the working set exceeds the cache. The migration
therefore does not claim that every physical route is parsed exactly once.

### Initial measured results

Three fresh processes, two warmup passes and five measured passes per compiler
process; application builds use three fresh processes:

| Workload                                |      Babel |       Yuku | Median peak process RSS, Babel → Yuku |
| --------------------------------------- | ---------: | ---------: | ------------------------------------: |
| Complete splitter, original 52 fixtures |  313.16 ms |   92.05 ms |                     385.7 → 183.3 MiB |
| Production build, synthetic 250 routes  | 1800.76 ms | 1048.70 ms |                     729.3 → 631.7 MiB |

The first comparison is 3.40× faster; the production workload is 1.72× faster.
Both engines produced 517 compiler outputs. The application builds produced
751 chunks and 722,613 JavaScript bytes from identical source hashes.

A separate native reuse comparison measured 100.47 ms with reuse and 140.69 ms
without reuse (28.6% reduction), with identical code and source-map byte totals.
Peak process RSS was 186.5 versus 294.5 MiB. These initial measurements are
retained in `benchmarks/compiler/results/quiet-initial-*.json`. The five-pair
final comparison above is the primary performance evidence.

### Measured algorithmic corrections

Independent review identified repeated whole-tree searches for Hydrate spread
bindings and a complete graph between bindings in one destructuring declaration.
Focused stress cases measured those mechanisms before making further changes.
The Hydrate case exposed an actual migration regression at 500 boundaries;
the destructuring case was already faster than Babel but allocated redundant
dependency edges.

The retained changes are a single local object-expression index before Hydrate
mutation, including forward declarations, and bidirectional edges between one
representative and each sibling, with the same transitive reachability as the
complete graph. Neither change adds
a compatibility path or changes output ownership.

Three fresh processes, one warmup and three measured passes per process:

| Workload                             |       Babel | Native before correction | Native after correction |
| ------------------------------------ | ----------: | -----------------------: | ----------------------: |
| Hydrate, 500 boundaries, client      |    78.27 ms |                176.65 ms |                52.55 ms |
| Hydrate, 500 boundaries, server      |    56.08 ms |                103.62 ms |                36.80 ms |
| Shared destructuring, 1,000 bindings | 4302.65 ms¹ |                410.23 ms |               184.56 ms |

¹ The Babel destructuring sample is an exploratory single pass; the native
before/after comparison uses the identical repeated configuration. Do not infer
statistical precision from the exploratory Babel ratio.

Native peak RSS fell from 198.5 to 153.8 MiB for client Hydrate, 160.3 to
123.8 MiB for server Hydrate, and 284.8 to 202.8 MiB for destructuring. Code and
source-map byte totals were unchanged in every before/after sample. Behavioral
tests cover forward spread declarations. Executed-output tests verify that all
destructured getters evaluate exactly once when only the final sibling is used,
while the initializer is removed when no sibling survives.

Final-source dense checks also passed with matching input hashes. Three fresh
processes, one warmup and three Hydrate compiles per process measured 500-boundary
client compilation at 70.50 → 52.46 ms (265.3 → 153.0 MiB peak RSS), and server
compilation at 46.79 → 36.20 ms (203.3 → 122.5 MiB). With two corpus passes per
process, 1,000 shared destructured bindings measured 3793.85 → 187.40 ms
(354.9 → 166.5 MiB), producing 12 outputs in both engines. These sequential
stress comparisons are recorded in `final-hydrate-*.json` and
`final-bindings-1000-*.json`; they are separate from the alternating main runs.

### Integration checks

Final package checks passed for router-utils (45 unit/typechecked tests),
router-generator (261 runtime and 12 fixture type tests), router-plugin (708
unit tests), start-plugin-core (580 tests), and react-start-rsc (61 tests).
Affected package TypeScript 5.6, 5.7, 5.8, 5.9, 6, and 7 checks, lint, and
package integrity/export checks passed. Router-utils' previously disabled
unit-test script now runs its tests.

Production browser suites passed for React route splitting (6 tests), Solid
route splitting (5), Vue JSX (22), and Vue SFC (22). After the final Hydrate
index change, production deferred hydration passed for React (16 tests; one
development-only test skipped) and Solid (15). Vite import protection passed
87 integration tests, including development cold/warm analysis and production
output behavior.

The initial Rsbuild import-protection run stopped at its SSR build with
`RspackResolver(PackagePathNotExported(".", ".../@tanstack/react-start/package.json"))`
in cross-module safe-wrapper fixtures. A public baseline comparison identified
overly broad native candidate detection: an unrelated middleware chain was
being resolved as a possible direct factory. The Babel baseline made zero
resolver calls on that input; the initial native implementation threw. A
failing regression was added, then direct-call eligibility was corrected while
retaining parenthesized namespace support. Package tests and the actual Rsbuild
production build plus all 87 browser tests pass after the fix.

Server-function production suites pass all 53 tests under both Vite and Rsbuild.
These suites exposed another regression before passing: a server-action provider
retained an originally exported page's initialization graph and evaluated
`window` during server import. Native liveness now counts original export
records as original uses, so deliberately stripped exports can become dead.
This corrects shared ownership rather than special-casing browser globals.
Three public provider regressions cover named variable, named function, and
named default exports. The live Vite HMR suite passed all 28 browser tests,
including state preservation and transitive server-function invalidation.

### Final stash-workflow checks

After the supporting commits, implementation changes were stashed for the
BEFORE phase and restored for AFTER. The baseline checkout retained the Babel
compiler; restored native source and executable fingerprints matched those used
for the five alternating measurement pairs.

The same public HMR export-contract test ran in both phases. Babel passed 8 of
16 cases and failed 8 with automatic route splitting enabled: function,
overloaded function, shared function, variable, multiple variable, default,
class, and explicit alias exports. These tests express intended public export
semantics and reveal preexisting baseline deficiencies; they are not regressions
introduced by Yuku. The restored native compiler passed all 16. Full logs are
`/tmp/yuku-before-contract-tests.log` and `/tmp/yuku-after-contract-tests.log`;
the durable outcome record is
[workflow-contracts.json](benchmarks/compiler/results/workflow-contracts.json).

The same fixed 52-fixture performance harness was also rerun after stashing and
restoring. Each phase used one fresh process, one warmup and three measured
passes: Babel 358.39 ms per corpus / 384.14 MiB peak RSS, native 109.48 ms /
142.73 MiB. These are workflow smoke checks only, not additional evidence of
statistical precision. Primary conclusions use the five alternating pairs.
Raw records are [workflow-before.json](benchmarks/compiler/results/workflow-before.json)
and [workflow-after.json](benchmarks/compiler/results/workflow-after.json).

### Historical full client bundle comparison

Both phases completed all 18 bundle scenarios with source attribution enabled,
identical scenario selection, and package builds through Nx. The complete
snapshots, including per-file metrics and source attribution, are preserved as
[bundle-before.json](benchmarks/compiler/results/bundle-before.json) and
[bundle-after.json](benchmarks/compiler/results/bundle-after.json). The latter
records the 0.11.0 candidate before the upstream correction;
an immutable copy is [bundle-after-pre-cleanup.json](benchmarks/compiler/results/bundle-after-pre-cleanup.json).

Sixteen scenarios have identical raw, gzip, initial raw/gzip, Brotli, initial
Brotli, and JavaScript chunk-count metrics: all six React/Solid/Vue Router
scenarios; React Start minimal, query integration, full, and all three Rsbuild
scenarios; Solid Start minimal/full; and Vue Start minimal/full.

The two changed scenarios are:

| Scenario                       | Raw bytes, before → after | Gzip bytes, before → after | Initial gzip, before → after | Brotli bytes, before → after | JS chunks |
| ------------------------------ | ------------------------: | -------------------------: | ---------------------------: | ---------------------------: | --------: |
| React Start deferred hydration |     309272 → 309337 (+65) |        99248 → 99281 (+33) |          98386 → 98419 (+33) |          86209 → 86231 (+22) |     3 → 3 |
| Solid Start deferred hydration |     144879 → 144944 (+65) |        49997 → 50029 (+32) |          46805 → 46840 (+35) |          44635 → 44696 (+61) |     3 → 3 |

Initial raw bytes also increase by 65 in each case. Initial Brotli increases
by 14 bytes for React and 58 for Solid. Independent emitted-code review located
unused generated `lazyRouteComponent(..., 'H0')` calls in the eager route chunk
for both increases. Tracing them exposed the upstream JSX reference omission
described below, with broader semantic consequences than these size increases.
No local cleanup workaround was added. These snapshots describe 0.11.0; the
current 0.12.0 comparison is recorded separately above.

### Upstream findings and platform limits

The [upstream report](benchmarks/compiler/yuku-feasibility/README.md) contains
small executable reproducers and proposed fixes:

- **Historical 0.11.0 blocking semantic defect:** standalone JSX names beginning with `_`, `$`,
  or Unicode do not receive runtime reference records. The upstream binder's
  `binder.zig` handling checks only ASCII `A`–`Z` for standalone JSX names.
  For example, `const _Widget = () => 'hello'` used by a route loader and by
  `component: () => <_Widget />` should be shared across the separately split
  loader/component chunks. Native `computeSharedBindings` instead returns no
  shared binding and the component chunk references an unresolved `_Widget`.
  `$Widget` also fails; the ordinary `Widget` control is shared correctly.
  A public Vite build-and-execute reproduction confirms `ReferenceError` for
  `_Widget` and `$Widget`, while the `Widget` control renders an element.
  The same reproduction executes all three loaders/components successfully
  against the Babel baseline; it checks execution, not shared-function identity.
  The runnable companion is
  [jsx-prefixed-route-repro.mjs](benchmarks/compiler/yuku-feasibility/jsx-prefixed-route-repro.mjs).
  This is reachable public route usage, not only a generated-code corner case.
  This defect was fixed upstream in 0.12.0 and verified by the current checks
  above. No repository workaround was implemented.
- The default `comments: 'some'` policy drops whitespace-padded purity
  annotations. The native compiler uses the documented `comments: 'all'`
  policy to preserve source comments generally; it does not repair annotations.
- Passing an inconsistent object-method AST to codegen terminates the process
  with SIGBUS on macOS arm64. This was caused by an early invalid transform,
  which was corrected. The upstream proposal is validation and a diagnostic
  at the native boundary; it is invalid-input hardening, not a valid-syntax
  migration blocker.

Native import/analyze/clone/generate smoke checks passed on official Node
20.19.0 and 22.12.0 binaries, alongside workspace validation on Node 24.8.0.
During these earlier 0.11.0 measurements, only macOS arm64 native binaries were
executed; Linux GNU/musl and Windows installation/import checks were unverified
in that phase. The later Linux GNU CI coverage is recorded in the current
CI follow-up section above.
