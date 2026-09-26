# Native Yuku compiler migration

**Status: blocked on Yuku 0.11.0 analyzer correctness. Implementation and local
evaluation are complete, but this migration is not ready to land. Adoption
requires an upstream analyzer fix and
subsequent correctness, performance, and bundle reruns.** A newly confirmed
semantic failure overrides the passing existing suites: standalone JSX component
names beginning with `_`, `$`, or Unicode are omitted from Yuku's reference
records, so the native route compiler can generate a chunk with an unresolved
component binding. No local workaround has been implemented.

All measurements below describe the current implementation before resolution
of that defect. They demonstrate potential performance improvements on their
recorded inputs, not a correctness-qualified adoption recommendation.

## Scope and architecture

The compiler packages use Yuku 0.11.0 for parsing, semantic analysis, AST
transformation, and code generation. There is no Babel compatibility layer or
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

## Evaluation design

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

## Final speed and process-memory results

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

## Initial measured results

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

## Measured algorithmic corrections

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

## Integration checks

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

## Final stash-workflow checks

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

## Initial full client bundle comparison — cleanup pending

Both phases completed all 18 bundle scenarios with source attribution enabled,
identical scenario selection, and package builds through Nx. The complete
snapshots, including per-file metrics and source attribution, are preserved as
[bundle-before.json](benchmarks/compiler/results/bundle-before.json) and
[bundle-after.json](benchmarks/compiler/results/bundle-after.json). The latter
is the candidate before the pending Hydrate cleanup, not final acceptance data;
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
There is no local cleanup workaround. Correctness, performance, and all-scenario
bundle checks must be repeated after the upstream fix; these snapshots do not
establish an acceptable final candidate.

## Upstream findings and platform limits

The [upstream report](benchmarks/compiler/yuku-feasibility/README.md) contains
small executable reproducers and proposed fixes:

- **Blocking semantic defect:** standalone JSX names beginning with `_`, `$`,
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
  The upstream fix must align JSX component reference classification with the
  language's component/intrinsic-name rules, with `_`, `$`, Unicode, ASCII
  component, and lowercase intrinsic regression coverage. The existing green
  suites do not cover or negate this known failure. No repository workaround
  is authorized or implemented.
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
Only macOS arm64 native binaries were executed. Linux GNU/musl and Windows
installation/import checks remain unverified locally.

## Required before adoption

1. Obtain a corrected upstream analyzer release with coverage for standalone
   JSX component reference classification. Preserve the public split-route
   runtime reproduction as a regression; do not add a local analyzer workaround.
2. Update the dependency and rerun affected compiler/package checks and consuming
   application suites, including the new binding regression, Hydrate, route
   splitting/HMR, and server functions.
3. Repeat identical baseline/native performance and memory workloads, plus all
   18 attributed bundle scenarios. Current improvements and the two Hydrate size
   increases are evidence for this candidate, not acceptance of the corrected one.
4. Validate native package installation/import and relevant compiler behavior in
   Linux GNU/musl and Windows CI, alongside the already exercised macOS arm64
   and supported Node versions.
