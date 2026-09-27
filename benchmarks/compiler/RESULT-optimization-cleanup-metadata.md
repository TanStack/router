# Immutable cleanup metadata

## Scope and ownership

This change stacks on #8524 at
`c6c33e22857cdefcad00e217201f05e5bcd39551`. It reuses compiler cleanup metadata in
`@tanstack/router-utils`, with Router and Hydrate integration; the base PR is unchanged.

`removeUnusedBindings` previously rebuilt all-scope declaration indexes, root
name lookup, declaration-owner lookup, and original-export membership for each
output. `createBindingCleanup(module)` now lazily retains these source facts with
an analysis that produces sibling outputs. Router's `RouteModuleAnalysis` and
Hydrate's `SourceEntry` each own one cleanup function. The declaration-symbol map
also serves as the owner lookup, eliminating its redundant copy. Readonly map/set
types prevent cleanup from mutating shared metadata. Root-only route dependency
analysis remains separate because cleanup needs nested bindings too.

Liveness, dependency edges, present symbols, lexical/owner stacks, and generated
references remain specific to each edited output. Replacing or invalidating a
source discards its existing analysis and cleanup owner together. One-off
`removeUnusedBindings` calls keep metadata local instead of retaining a cache.
There is no new production flag, invalidation counter, or output cache.

An initial module-keyed WeakMap prototype improved repeated cleanup but slowed
Start provider compilation by about 5% in a nine-process confirmation. Moving
metadata ownership to existing multi-output analyses removed that repeatable
cold-path regression. The rejected result is preserved in
[cleanup-weakmap-start.json](results/cleanup-weakmap-start.json). Object-shape and
module-property prototypes did not eliminate the cold-path cost and were not
retained. The final implementation does not modify analyzer objects.

## Method

Node 24.8.0, pnpm 11.21.0, Yuku 0.12.0, Apple M3 Max. Baseline and candidate
were separately installed with frozen lockfiles and built through Nx. Measurements
were serialized without concurrent builds, tests, or installs. The same harness
and inputs were used in both checkouts. Raw files retain input/output hashes,
compiler fingerprints, process samples, and variation.

The benchmark phase used a separate baseline checkout instead of a
test-commit/stash procedure. The behavior cases ran through the baseline's
existing API. Five independent read-only
reviews informed nested/merged declaration coverage, repeated generated-reference
cleanup, cold/warm benchmarks, and live-cache retention diagnostics.

## Correctness and validation

The 69 utility behavior tests were first run on unchanged #8524. Candidate
coverage exercises the new factory and adds an API type test (70 total). Both
baseline and candidate pass 734 Router plugin tests and 619 Start plugin tests,
including the new React/Solid Hydrate sibling/source-replacement test. This is an
optimization of existing output behavior, not a bug fix with an intentionally
failing functional baseline.

Tests cover independently edited sibling outputs, changed roots/preservation
settings, erased exports, generated references, merged namespaces/overloads,
repeated cleanup, source immutability, code/maps, and same-filename reanalysis.
Five independent reviews found no blocking correctness issue in the final design.

Final candidate validation through Nx:

- Unit tests, TypeScript 5.6–7 checks, ESLint, package builds, publint and attw for
  router-utils, router-plugin, and start-plugin-core.
- React Start server functions: 53 browser tests each for Vite SSR and Rsbuild SSR.
- Deferred hydration: React 16 and Solid 15 browser tests for each bundler.
- Router production apps: 6 React code-splitting and 22 Vue JSX browser tests.
- In total, 196 browser tests passed; deferred-hydration production modes skip
  their development-only HMR tests. Public plugin invalidation is unit-tested.
- Root formatting, patch changeset, and `git diff --check`.

## Measurements

### Focused cleanup

Five alternating fresh-process pairs per case, 40 batches per process. Batches contain 20 small/empty jobs, five nested jobs, or three wide jobs. Analysis, factory creation, cloning, edits, and printing are outside cleanup timers. Values below are medians of process medians in milliseconds per complete N-output module. Full samples and batch-average p99 values are in [cleanup-focused.json](results/cleanup-focused.json).

| Fixture | Outputs / metadata | Before ms | After ms | Change |
| ------- | ------------------ | --------: | -------: | -----: |
| route   | 1 / cold first     |   0.03751 |  0.03762 |  +0.3% |
| route   | 5 / cold first     |   0.12711 |  0.11019 | -13.3% |
| route   | 1 / warm           |   0.02793 |  0.02201 | -21.2% |
| nested  | 1 / cold first     |   0.98889 |  0.96116 |  -2.8% |
| nested  | 5 / cold first     |   4.33231 |  3.71869 | -14.2% |
| nested  | 1 / warm           |   0.86379 |  0.73404 | -15.0% |
| wide    | 1 / cold first     |   5.53112 |  5.31829 |  -3.8% |
| wide    | 5 / cold first     |  27.79403 | 25.89200 |  -6.8% |
| wide    | 1 / warm           |   4.67325 |  4.07072 | -12.9% |
| empty   | 1 / cold first     |   0.00498 |  0.00517 |  +3.7% |
| empty   | 5 / cold first     |   0.01432 |  0.01374 |  -4.1% |
| empty   | 1 / warm           |   0.00381 |  0.00331 | -13.0% |

The strongest supported result is reduced repeated cleanup: roughly 7–14% for five-output nonempty fixtures. First-output differences and the sub-microsecond empty-case differences should not be treated as meaningful application changes. The separate Start compiler run below covers the one-off API rather than the factory.

### Complete compiler and Vite builds

Seven alternating fresh-process pairs. Splitter passes use the same 56-file corpus, two warmups and ten measured passes; route-heavy samples are complete fresh builds with minification and source maps. [Raw results](results/cleanup-whole.json).

| Workload  | Before ms | After ms | Change | Process CV before / after | Peak RSS MiB before / after |
| --------- | --------: | -------: | -----: | ------------------------: | --------------------------: |
| splitter  |     68.09 |    64.96 |  -4.6% |               4.5% / 4.5% |               265.3 / 272.3 |
| routes64  |    397.97 |   390.03 |  -2.0% |               3.9% / 3.3% |               380.1 / 379.6 |
| routes250 |    961.15 |   950.21 |  -1.1% |               2.1% / 1.9% |               650.0 / 652.0 |
| routes750 |   2374.12 |  2376.44 |  +0.1% |               1.3% / 3.6% |             1229.7 / 1241.0 |

Whole-build differences are small and noisy; the 750-route median is effectively unchanged. These data do not establish a broad whole-build speedup or lower peak RSS. The fitting 64-route case and 250/750-route cache-eviction workloads limit claims based only on ideal sibling reuse.

The [whole-build follow-up](cleanup-build.md) varies declaration density, split
groups, and cache fit to identify when cleanup reuse produces a measurable total
build improvement. It also documents the exact metadata lifetime and additional
live-cache memory, keeping these original workloads as controls.

Separate digest runs produce identical code and serialized source maps for all 567 corpus outputs (36 shared modules). All focused-output digests match as well. [Digest and memory diagnostics](results/cleanup-diagnostics.json).

### One-off Start compilation

Nine alternating fresh-process pairs, five warmups and 30 measured passes per process; 60 modules with two server functions each. [Timings](results/cleanup-start.json), [identical code/map digests](results/cleanup-start-digests.json).

| Output   | Before ms | After ms | Change | Process CV before / after |
| -------- | --------: | -------: | -----: | ------------------------: |
| client   |     9.891 |    9.875 |  -0.2% |               1.0% / 2.0% |
| ssr      |    10.258 |   10.178 |  -0.8% |               3.5% / 3.6% |
| provider |    12.559 |   12.655 |  +0.8% |               2.0% / 4.0% |

The final ownership design no longer shows the repeatable provider regression of the global WeakMap prototype. Remaining differences are within process variation.

### Hydrate child generation

Five alternating fresh-process pairs, three warmups and 20 passes per process. Each pass compiles one parent and loads every distinct virtual child exactly once, in reverse order. Timings include analysis, transforms, cloning, cleanup, printing and source maps. They measure compilation, not browser hydration latency. Code/map digests match for every case. [Raw results](results/cleanup-hydrate.json).

| Children | Before ms | After ms | Change | Process CV before / after |
| -------- | --------: | -------: | -----: | ------------------------: |
| 1        |     0.477 |    0.468 |  -2.0% |               7.5% / 6.9% |
| 2        |     0.745 |    0.755 |  +1.4% |               5.5% / 3.5% |
| 10       |     3.131 |    2.390 | -23.7% |               4.1% / 7.1% |
| 25       |     9.763 |    9.394 |  -3.8% |               6.3% / 6.4% |

The ten-child case improves clearly in this workload; differences at one, two, and 25 children are small relative to observed variation. Do not generalize the ten-child percentage to whole apps.

### Retained memory

A diagnostic production route build holds 128 analysis entries. Clearing that cache releases about 0.4 MiB more JS heap on the candidate, consistent with the extra metadata. This is additional live memory, not a memory-saving optimization. Peak process RSS is noisy and includes native allocations.

The focused diagnostic holds 128 source analyses plus their cleanup owners. Median additional populated heap versus the matched baseline is:

| Source fixture (128 analyses) | Added populated heap |
| ----------------------------- | -------------------: |
| route                         |             0.27 MiB |
| nested                        |             6.07 MiB |
| wide                          |            31.39 MiB |

The wide case holds 25,600 exported factories and is a stress case. All 128 module weak references clear after dropping their owners in every diagnostic repetition. Released heap returns close to the baseline in both variants.

Hydrate has an environment-scoped source map rather than the Router LRU. With 64 source entries and 25 children each, additional populated heap is about 0.5 MiB; public invalidation releases it. The smaller Hydrate cases and all post-invalidation measurements are preserved in the raw results.

### Attribution and retained scope

The dependent ownership change consists of the lazy factory, shared cleanup implementation, and Router/Hydrate source-record wiring. A second independent change removes the redundant owner-map copy. A benchmark-local loader tested copy removal alone, caching with the copy restored, and the final combination without changing production files. The loader source is embedded in each attribution result. All focused code/map digests match.

| Variant    | Small route, 5 outputs ms | Nested, 5 outputs ms |
| ---------- | ------------------------: | -------------------: |
| baseline   |                   0.13650 |              4.73499 |
| copy-only  |                   0.12877 |              4.61373 |
| cache-only |                   0.11811 |              4.07856 |
| candidate  |                   0.11819 |              3.98570 |

[Focused attribution](results/cleanup-focused-attribution.json) identifies caching as the main saving, with a smaller contribution from eliminating the map copy. [Complete-corpus attribution](results/cleanup-attribution.json) has smaller, noisier differences. Both changes remain: they remove measured work and keep one immutable owner map. No further syntax-only optimization or cache policy was added; the cold-path regression ruled out global retention.

### Client bundles

The full 18-scenario suite has identical gzip, initial gzip, raw, Brotli, file
counts, and per-file metrics across baseline, full candidate, copy removal alone,
and reusable metadata with the copy restored. All 38 emitted client JavaScript
files are byte-identical between the baseline and full candidate. This changes
compiler work without changing the resulting client bundles.

- [Baseline metrics](results/cleanup-bundle-baseline.json)
- [Pre-attribution candidate metrics](results/cleanup-bundle-candidate.json)
- [Copy-only metrics](results/cleanup-bundle-copy-only.json)
- [Cache-only metrics](results/cleanup-bundle-cache-only.json)
- [Final rebuilt candidate metrics](results/cleanup-bundle-final.json)
- [Matching emitted-file SHA-256 digests](results/cleanup-bundle-hashes.json)

Bundle attribution applies the same exact substitutions recorded in the focused
attribution results to built compiler JavaScript, restoring each file afterward.
These two runs reuse unchanged package builds; the baseline, candidate, and final
composed runs rebuild through Nx. A Node load hook used for focused attribution
could not load Nx's native binary, so bundle attribution uses these temporary
artifact substitutions instead. No dependency or production-source workaround
was added. The baseline report was retried with the installed Homebrew Git after
Apple Git requested Xcode license acceptance; no license was accepted.
