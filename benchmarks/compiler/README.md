# Compiler migration benchmarks

**Adoption is blocked:** Yuku 0.11.0 omits runtime references for standalone JSX
component names beginning with `_`, `$`, or Unicode. A public split-route case
using `_Widget` or `$Widget` in both a loader and component can produce an
unresolved component binding. Existing green suites do not override that known
semantic failure: a public Vite build-and-execute reproduction throws
`ReferenceError` for both names while the `Widget` control renders correctly.
The runnable reproduction is
[`jsx-prefixed-route-repro.mjs`](yuku-feasibility/jsx-prefixed-route-repro.mjs).
No local workaround has been implemented. The implementation
and local evaluation are complete, but the migration is not ready to land until
the upstream analyzer is fixed and correctness, performance, and bundles are
remeasured. Results below preserve current performance evidence pending that fix.
Linux GNU/musl and Windows native-package/compiler CI is also required before
adoption; local execution covered macOS arm64 only.

These local wall-clock measurements separate a Babel/Yuku toolkit feasibility
comparison from the complete existing route splitter and actual Vite builds.
They are not CodSpeed runtime benchmarks. A faster toolkit roundtrip does not
establish an equivalent speedup in a migrated compiler or application build.

## Final migration evaluation

After correctness fixes and application validation, five baseline/native pairs
were run in a quiet window. The order alternates AB/BA between repetitions for
each workload. `results/final-alternating.json` records every sample, order,
source hash, compiler source/dist fingerprint, dependency version, and Git HEAD.
Both checkouts have supporting commit `0ec43cd02c`; the baseline compiler source
is unchanged from `bb4423e`. Node 24.8.0 ran on an Apple M3 Max.

| Workload                                                           | Babel median (min–max), ms | Native median (min–max), ms | Time reduction | Median peak process RSS, Babel → native |
| ------------------------------------------------------------------ | -------------------------: | --------------------------: | -------------: | --------------------------------------: |
| Complete 52-fixture splitter, three configurations                 |     295.71 (294.85–302.86) |         88.70 (88.11–90.38) |          70.0% |                       397.3 → 200.7 MiB |
| Synthetic 250-route production Vite build                          |  1807.10 (1720.87–1871.08) |   1054.69 (1043.91–1104.89) |          41.6% |                       732.9 → 647.8 MiB |
| React Start server-functions production app, all Vite environments |  1530.60 (1467.79–1571.32) |   1038.35 (1013.42–1074.08) |          32.2% |                       658.7 → 545.6 MiB |

The splitter uses two warmups and ten measured corpus passes per fresh worker.
It produces 517 modules in both engines, with 858 versus 156 full-source
analyses per corpus. Both synthetic builds emit 751 chunks and 722,613 JS bytes.
The real Start app emits 1,214,457 versus 1,208,118 JS bytes; matching output
text is not required. All corresponding input hashes match. Builds exclude
Nx orchestration and the separate TypeScript check; both apps were first built
through their Nx targets. These results describe the measured workloads, not a
guaranteed speedup for every application.

Reproduce paired measurements after building both workspaces:

```sh
node benchmarks/compiler/compare.mjs --baseline /path/to/baseline --fixtures-root /path/to/frozen-original-52-fixtures --output final-alternating.json
```

The fixed comparison corpus is the original 52 fixture files, SHA-256
`db1fbf4179e31c63b623a3eb3e5ea3a148ff27b3300ea8dbed97afb396857a1e`.
New native-only syntax fixtures are excluded from both comparative engines.

Separate native reuse attribution (five workers, two warmups, ten passes)
measured 91.69 ms with reuse versus 130.85 ms without it, a 29.9% reduction;
peak process RSS was 199.0 versus 335.0 MiB. A diagnostic-only run hashes the
complete generated code and source maps and confirms identical hashes in both
modes. See `final-reuse.json` and `final-reuse-digest.json`.

Separate 50 ms process-tree sampling observed no child processes during either
workload in either checkout (26–46 samples per run). Sampled tree peaks were
751.3 → 633.8 MiB for 250 routes and 655.4 → 554.4 MiB for Start. These are
single instrumented diagnostics, not additional speed samples; short-lived
processes or peaks between samples could be missed. Kernel-reported worker
peaks are retained alongside them in `final-process-tree-*.json`.

The bounded cache remains 128 entries. Three fresh speed workers per variant,
plus separate analyzer-call/live-memory diagnostics, produced:

| Routes | Cache entries limit | Median build ms | Median peak RSS MiB | Full-source analyzer calls | Heap released by cache clear MiB |
| -----: | ------------------: | --------------: | ------------------: | -------------------------: | -------------------------------: |
|    250 |                 128 |         1109.41 |               658.1 |                        751 |                              7.3 |
|    250 |                 256 |         1028.04 |               624.1 |                        251 |                             14.2 |
|    250 |                 512 |         1040.04 |               643.0 |                        251 |                             14.2 |
|    750 |                 128 |         2782.43 |              1108.8 |                       2251 |                              7.9 |
|    750 |                 256 |         2783.74 |              1136.6 |                       2251 |                             14.8 |
|    750 |                 512 |         2689.50 |              1153.0 |                       1501 |                             28.6 |

The 256-entry cache helps the fitting 250-route case, but provides no measured
speed gain at 750 routes and retains more live memory. At 750 routes, 512 entries
save only 3.3% build time while peak RSS rises 4.0%. This does not justify changing
the default. Reuse is opportunistic: 128 entries still analyze each route three
times in the measured production request order. The cache is cleared at build
end. Heap deltas around explicit GC are observations, not attribution of every
native allocation; RSS need not fall when the allocator retains freed pages.
See `final-cache-*-timing.json` and `final-cache-*-profile.json`.

The cache-clear heap drops above are from the 750-route diagnostic where stated,
with forced GC before and after clearing; they do not isolate native allocation
ownership. The 3.3% difference is an observed median from three speed workers per
variant, not an established statistically reliable benefit.

Final dense-module checks also remain faster and use less peak process memory:

| Workload                                                       | Babel median ms | Native median ms | Median peak RSS, Babel → native |
| -------------------------------------------------------------- | --------------: | ---------------: | ------------------------------: |
| 100 bound Hydrate spreads, client                              |           19.95 |            12.60 |                125.8 → 89.3 MiB |
| 500 bound Hydrate spreads, client                              |           70.50 |            52.46 |               265.3 → 153.0 MiB |
| 100 bound Hydrate spreads, server                              |           16.32 |             8.16 |                121.2 → 78.8 MiB |
| 500 bound Hydrate spreads, server                              |           46.79 |            36.20 |               203.3 → 122.5 MiB |
| 1,000 shared destructured bindings, three split configurations |         3793.85 |           187.40 |               354.9 → 166.5 MiB |

These are three fresh workers per engine, one warmup, and three Hydrate compiles
or two splitter corpus passes per worker. They are sequential baseline/native
stress comparisons, separate from the alternating main workloads. Source hashes
and output counts match between engines. See `final-hydrate-*.json` and
`final-bindings-1000-*.json`. The earlier before/after files retain evidence for
the two measured scaling optimizations.

The earlier sections below preserve exploratory and optimization measurements;
the final paired comparison above is the main adoption evidence.

## Final stash-workflow artifacts

Supporting commits `0ec43cd02c` and `f69eb7a5aa` preserve tests and measurement
artifacts without changing the baseline compiler. The implementation was then
stashed and restored for the required BEFORE/AFTER checks. Identical public HMR
export-contract tests passed 8/16 cases on Babel and 16/16 on native Yuku. All
eight baseline failures involve automatic route splitting and expose preexisting
public-export deficiencies, not migration regressions. Details and original log
paths are in `results/workflow-contracts.json`.

`workflow-before.json` and `workflow-after.json` record one fresh process, one
warmup and three corpus passes per phase: 358.39 → 109.48 ms, with peak RSS
384.14 → 142.73 MiB. These are smoke checks for the stash workflow; speed
conclusions use the five alternating pairs above.

All 18 client bundle scenarios were also measured in both phases with source
attribution enabled. Complete attributed snapshots are preserved unchanged in
`results/bundle-before.json` and `results/bundle-after.json`. The latter is a
pre-cleanup candidate, also retained as `bundle-after-pre-cleanup.json`, not
final acceptance data. Sixteen scenarios
have identical raw, gzip, initial raw/gzip, Brotli, initial Brotli, and chunk-count
metrics. Deferred hydration changes by +65 raw/+33 gzip bytes for React and
+65 raw/+32 gzip for Solid; both remain at three chunks. Independent emitted-code
review found unused generated lazy-route component calls in the eager route
chunks. Tracing those calls exposed the blocking upstream JSX reference defect
above. An upstream fix and final revalidation are pending; the local
`RESULT-optimization-yuku.md` report contains the comparison.

Use the Node version in `.nvmrc` and the root pnpm version. Build both workspaces
through Nx before timing: workspace package imports consume `dist`. The default
modes benchmark the native compiler; select Babel modes against a baseline checkout.
Do not run builds, tests, installation, or other CPU-heavy work concurrently.

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:build --outputStyle=stream --skipRemoteCache
node benchmarks/compiler/measure.mjs > candidate.json
```

`--yuku-root` optionally selects a directory containing `node_modules/yuku-analyzer`
and `node_modules/yuku-codegen`; by default these resolve from the workspace's
router-utils package. The recorded evaluation uses version 0.11.0 of both.
The override was used for the initial isolated toolkit evaluation. Resolve Babel
from the baseline workspace dependencies. Preserve baseline build outputs/results
before rebuilding migrated packages.

The default is five fresh Node processes for each mode, two untimed warmup
passes, and twenty measured passes per process. Modes rotate order between
repetitions. `--repetitions`, `--iterations`, `--warmups`, and `--modes` override
these settings. A corpus hash protects against fixture edits during a run.

- `babel-roundtrip`: parse each React/Solid code-splitter fixture, traverse and
  resolve referenced identifiers through Babel scopes, and print the full AST
  with comments and source maps containing the original source.
- `yuku-roundtrip`: analyze the identical fixture source, materialize and query
  the resolved-reference records, and print the full AST with all comments and
  source maps containing the original source. Printing forces access to the
  complete lazily decoded AST. This performs no route transformation.
- `babel-splitter`: run grouping detection, shared-binding analysis, reference
  compilation, every configured virtual group, and an optional shared module for
  each fixture and all three existing snapshot grouping configurations. This is
  a deliberate complete-output workload; a real bundler may request fewer
  virtual groups. Parse counts are accounted from one full-source parse in each
  current compiler entry point, not a parser instrument or template parse count.
- `yuku-splitter`: run the same full-output workload with the native compiler,
  reusing one immutable analysis for all outputs of each grouping scenario.
- `yuku-splitter-no-reuse`: omit the optional analysis from each native compiler
  entry point to attribute the separate effect of analysis reuse.

`--digest-output` separately hashes every generated code string and serialized
source map to check reuse/no-reuse output identity. It marks the result as a
diagnostic; do not use these instrumented samples for speed comparisons.

Phase times include normal allocations and GC. Process wall time additionally
includes module loading, fixture loading, warmups, explicit GC, and process
startup/exit. `process.resourceUsage().maxRSS` is the peak process resident size,
including native allocations. Heap/RSS samples before, after, and following an
explicit final GC are also recorded. Peak RSS covers warmups and all measured
passes, so compare identical iteration counts. No AST cache is kept by this
harness; the memory numbers do not predict a future compiler cache's retention.

## Application builds

First inspect the app's Nx build target and build it through Nx with all required
package outputs current. Then run repeated fresh-process Vite production builds:

```sh
node benchmarks/compiler/build.mjs > app-baseline.json
node benchmarks/compiler/build.mjs --profile --repetitions 1 > app-profile.json
```

The default app is `e2e/react-router/basic-file-based-code-splitting`; `--app`
accepts another repository-relative Vite app. These timings include config
loading, route generation, transforms, bundling, minification, and disk writes.
They exclude TypeScript's separate `tsc --noEmit` phase and Nx/package-build
orchestration. Each run starts a fresh Node process, but OS filesystem caches
are warm and existing generated routes remain present. The harness checks that
app source content is stable between runs. It preserves the app's Vite config.

The optional profiler wraps TanStack/router Vite hooks for attribution. Run it
separately from reported uninstrumented timings; overlapping asynchronous hook
durations must not be summed as a fraction of wall time. Peak RSS describes the
Vite Node process, including in-process native threads, not the simultaneous sum
of every possible bundler subprocess. Full process-tree memory requires a
separate system-level measurement before an adoption decision.

## Recorded baseline

`results/babel-yuku-0.11.0.json` records the first longer comparison on Apple M3
Max, Node 24.8.0, with 53 fixtures (including `shared-runtime.tsx`). Five fresh
processes per mode, two warmups, twenty measured passes:

| Workload                             | Median ms per corpus |    Min–max ms | Median peak RSS |
| ------------------------------------ | -------------------: | ------------: | --------------: |
| Babel parse, references, print       |                13.48 |   13.25–13.80 |       302.6 MiB |
| Yuku analyze, references, print      |                 4.94 |     4.74–5.22 |       146.6 MiB |
| Full Babel splitter, three groupings |               302.43 | 299.19–313.72 |       404.5 MiB |

The toolkit roundtrip was about 2.73 times faster and used less peak process
memory in this workload. Full splitter phases were grouping detection 25.89 ms,
shared analysis 21.43 ms, reference compilation 112.03 ms, virtual compilation
134.73 ms, and shared compilation 8.20 ms. Each complete corpus pass accounts
for 877 full-source parses and produces 530 generated modules; 29 reference
requests pass through unchanged and 29 shared modules are generated.

No migrated compiler or whole-build speedup is demonstrated by these numbers.

The existing React code-splitting e2e app also completed five fresh-process Vite
builds with the baseline compiler: median 394.35 ms (391.89–409.58 ms), median
peak Vite process RSS 290.3 MiB, median total worker wall time 514.3 ms. A separate
profile found 14 reference transforms (32.28 ms), 13 virtual transforms
(13.80 ms), and one shared transform (2.10 ms). This small app spends much of its
build outside the router compiler, so it cannot demonstrate a dramatic overall
build reduction from parsing alone. Raw samples are in `app-babel-baseline.json`
and the separately instrumented `app-babel-profile.json`.

## Start output audit

The initial native Start compiler passed 123 existing tests across compiler
resolution, server functions (client, SSR caller, and provider), middleware,
isomorphic functions, environment-only functions, and server-side ClientOnly
JSX. All 36 updated snapshot files were independently parsed and compared with
their baseline versions. After ignoring locations, comments, formatting metadata,
and equivalent quoted object-property keys, their ASTs were identical. This is
an additional migration audit, not a requirement that future compiler output
remain textually or structurally identical. Runtime tests and source-map tests
remain the correctness authority.

These early measurements are exploratory: final adoption measurements must run
in a coordinated quiet window with no builds, tests, or dependency installation
running in parallel. Final comparisons use the same fixture corpus for both
workspaces via `--fixtures-root` and a separately built baseline checkout:

```sh
node benchmarks/compiler/measure.mjs --workspace /path/to/baseline --fixtures-root /path/to/candidate --modes babel-roundtrip,babel-splitter > baseline.json
node benchmarks/compiler/measure.mjs --workspace /path/to/candidate --fixtures-root /path/to/candidate --modes yuku-roundtrip,yuku-splitter > candidate.json
```

The native splitter mode shares one immutable route analysis across every output
within each grouping scenario. The three scenarios represent separate build
configurations, so each route is analyzed once per scenario (three source parses
per route across the complete corpus workload).
Its phase timings include this initial analysis. The production plugin's bounded
cache may have different reuse rates depending on bundler request order, so
application measurements remain necessary.

`build.mjs --workspace /path/to/workspace --app e2e/react-start/basic` uses Vite's
application builder (`createBuilder().buildApp()`), matching the CLI across all
configured Start environments. Earlier exploratory app samples predate that
harness change and used the single-environment `build()` API on a Router-only
app. Rerun both workspaces with the current harness for final comparisons.

The independent import-protection review added six failing parenthesis cases
before the fix: wrapped client/server safe-boundary functions and callees,
parenthesized namespace-member mock export discovery, and source-location
preference for a parenthesized call. The native implementation now unwraps
transparent expressions while retaining the direct-function-argument boundary
rule. An immediately invoked function remains an unsafe argument. All 109 tests
in the focused compiler/import-analysis run pass, including a public executable
regression that distinguishes same-name re-exports from different modules.

## Initial native compiler comparison

The first coordinated quiet window used the baseline checkout at `bb4423e`
and the native Yuku 0.11.0 implementation, Node 24.8.0 on Apple M3 Max.
No installation, builds, or tests ran concurrently. Both engines read the
same original 52 fixtures (43,238 bytes, corpus hash recorded in each JSON).
Three fresh processes per mode performed two warmups and five measured passes.

| Workload                                  |      Babel | Native Yuku | Time reduction | Peak process RSS, Babel → Yuku |
| ----------------------------------------- | ---------: | ----------: | -------------: | -----------------------------: |
| Complete splitter, three configurations   |  313.16 ms |    92.05 ms |          70.6% |              385.7 → 183.3 MiB |
| Synthetic 250-route production Vite build | 1800.76 ms |  1048.70 ms |          41.8% |              729.3 → 631.7 MiB |

The splitter produces the same 517 outputs and 26 shared modules, accounting
for 858 versus 156 full-source analyses. The synthetic production workload
uses shared route state, loader/component/pending/error split groups,
minification and source maps. Both builds emitted 751 chunks and 722,613
JavaScript bytes from identical input hashes. These are measured workloads,
not predictions for all applications. Results: `quiet-initial-babel.json`,
`quiet-initial-yuku.json`, and `quiet-initial-routes-{babel,yuku}.json`.

A separate native-only attribution comparison disables analysis reuse only
inside the benchmark harness: 100.47 ms with reuse versus 140.69 ms without
(28.6% reduction), with peak process RSS 186.5 versus 294.5 MiB. Outputs remain
517 in both modes. This comparison separates reuse from the native compiler
rewrite; it does not add a production compatibility mode.

Separate loader instrumentation of the actual 250-route Vite build counted
751 `analyzeRouteModule` calls: each route three times and the entry once.
The bounded 128-entry cache does not guarantee one analysis per route under
this bundler request order. This counts full route analyses, not parsing of
generated snippets. Instrumented timings are excluded from speed comparisons.
Raw results are `quiet-initial-reuse.json` and
`quiet-initial-route-analysis.json`.

For a separate process-tree memory diagnostic (including bundler subprocesses),
run `node benchmarks/compiler/process-tree.mjs route-heavy.mjs --workspace /path/to/workspace`.
It samples simultaneous process-tree RSS every 50 ms; short-lived peaks may fall
between samples. Its timings must not be used as uninstrumented speed results.
The worker's own kernel-reported peak RSS is also retained.

The optional `route-heavy.mjs --analysis-cache-limit 256` experiment substitutes
only the compiled cache-size constant with a benchmark-local module loader hook.
It asserts that the expected constant was found, does not modify package files,
and adds no production option. Compare limits against the default on both a
working set that fits and one that exceeds the larger bound. Analyze retained
memory before treating improved cache hit rates as an adoption reason.

`hydrate-scaling.mjs --workspace /path/to/workspace --env client` exercises the
same Start compiler host and Hydrate plugin APIs in either checkout. Repeat with
`--env server`. The default route contains 10, 100, or 500 boundaries, each
using its own single-use constant props object with a hydration condition and
fallback. This measures scaling inside one growing module, including native
binding lookup, fallback removal, analysis, code generation and source maps.
Each measured pass creates a fresh compiler and plugin; it does not time a warm
output-cache hit. Client boundary counts and server fallback removal are checked.
Virtual child-module generation is excluded so the per-spread lookup mechanism
can be assessed separately from repeatedly generating a growing source module.

`measure.mjs --bindings 100 --modes yuku-splitter` replaces the fixture corpus
with one synthetic route whose single object-destructuring declaration has that
many bindings, all consumed by both its loader and component. Compare 10, 100,
and 1,000 using `babel-splitter` in the baseline workspace and `yuku-splitter` in
the candidate. The same three grouping scenarios run in both engines. This
isolates scaling of declaration dependency expansion without leaving unused
bindings that could change the amount of generated work between engines.

Final JSON includes a hash of the built compiler JavaScript files consumed by
workspace imports. App input hashes exclude generated route trees and build/test
output directories. Ensure all affected packages are rebuilt before comparing.
Route-heavy runs additionally record memory before/after the build and after
final GC. The diagnostic `--profile-analysis` run samples memory with GC before
and after the plugin's build-end cache clear, alongside its live entry count.
Post-build retention therefore measures cleanup; it is not the live-cache size.
RSS differences around clearing are allocator observations, not exact attribution
of all native allocations to cache entries.

## Dense module scaling before optimization

Quiet scaling checks exposed a native Hydrate regression that the many-small-route
workload misses. Three fresh processes, one warmup and three measured compiles
per process, all using the same input source:

| Boundaries | Environment | Babel ms | Native before optimization ms | Peak RSS Babel → native |
| ---------: | ----------- | -------: | ----------------------------: | ----------------------: |
|        100 | client      |    22.07 |                         21.80 |        130.2 → 92.6 MiB |
|        500 | client      |    78.27 |                        176.65 |       277.9 → 198.5 MiB |
|        100 | server      |    20.31 |                         15.01 |        125.2 → 83.6 MiB |
|        500 | server      |    56.08 |                        103.62 |       204.9 → 160.3 MiB |

The native implementation repeatedly walks the cloned module to locate a bound
spread's object initializer. The 500-boundary result motivates a single native
provenance index per transformation. Raw files are
`scaling-hydrate-{client,server}-{babel,yuku-before}.json`.

The 1,000-binding destructuring fixture was already faster than Babel in an
initial cold single pass (4,302.65 → 466.72 ms; 308.1 → 269.7 MiB). A repeated
native preoptimization run (three fresh processes, one warmup, three passes)
measured 410.23 ms and 284.8 MiB. Its sibling dependency graph still creates a
quadratic clique; a structurally equivalent sparse representation can be tested
against these preserved measurements. Raw files are `scaling-initial-bindings-*`
and `scaling-bindings-1000-yuku-before.json`. Do not compare the cold exploratory
numbers directly with the warmed repeated measurements.

The native fixes preserve emitted code/map byte totals in every repeated sample:

| Workload                             | Native before ms | Native after ms | Babel ms | Native peak RSS before → after |
| ------------------------------------ | ---------------: | --------------: | -------: | -----------------------------: |
| Hydrate client, 100 boundaries       |            21.80 |           12.78 |    22.07 |                92.6 → 89.3 MiB |
| Hydrate client, 500 boundaries       |           176.65 |           52.55 |    78.27 |              198.5 → 153.8 MiB |
| Hydrate server, 100 boundaries       |            15.01 |            8.44 |    20.31 |                83.6 → 79.0 MiB |
| Hydrate server, 500 boundaries       |           103.62 |           36.80 |    56.08 |              160.3 → 123.8 MiB |
| Shared destructuring, 1,000 bindings |           410.23 |          184.56 |        — |              284.8 → 202.8 MiB |

Hydrate now builds one provenance lookup for object-expression clones per
transform. Destructuring siblings now connect through a representative instead
of a complete clique, preserving the same transitive liveness. The measured
wins justify both changes. Results retain the same source hashes, iteration
counts, output counts and generated-byte totals; see `*-yuku-after.json`.
The destructuring table deliberately omits the earlier cold Babel number to
avoid comparing different warmup/iteration configurations.
