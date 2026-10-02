# Direct server-function AST construction

Stacked follow-up to [#8523](https://github.com/TanStack/router/pull/8523), implementing the compiler-owned AST construction proposal from [#8504](https://github.com/TanStack/router/pull/8504#issuecomment-5850719018).

## Change

`packages/start-plugin-core/src/start-compiler/serverFnAst.ts` provides named, independently testable builders used by `handleCreateServerFn.ts` to construct RPC calls, provider declarations and metadata, runtime imports, provider directives, and development HMR guards directly. It uses Yuku builders and explicitly typed node records for node kinds that share a discriminant with patterns or ordinary expression statements. All generated spans remain zero. Runtime/source references use `linkGeneratedReference`; callback-local `opts`, declaration identifiers, and member property names do not acquire source-binding ownership. Existing handler nodes are moved with their original provenance.

All five measured production groups remain. No AST templates, mutable-node sharing, new caches, compiler flags, dependency changes, or changes to unrelated snippet consumers were introduced. Existing snapshots require no changes. A patch changeset is included.

## Baseline and final state

- Baseline: #8523 at `6c228b37ad32b1cfa110c173caaea4ef8a12897b`, in an isolated managed checkout. The same new tests were run there without changing its production source.
- Measured candidate: `codex/direct-compiler-ast` on #8523 head `9148909cc5e578082c4d7b2e56ca08e531a987be`. That added commit only adjusts a Solid start-manifest test wait. The initial inline-builder measurements retained identical compiler fingerprints across that fast-forward. The extracted builders have separate, refreshed measurements below; [final verification](results/direct-ast-final-verification.json) records their current fingerprints.
- Stack base at publication: #8523 head `3dfc160aee69b580b08364449618947076930b60`. The advance from the measured candidate base only changes the Solid start-manifest CSS test; no compiler source changed. Measurements and validation below were collected before publication, and no checks were rerun to open the PR.
- Node 24.8.0, pnpm 11.21.0, Yuku 0.12.0, macOS arm64 / Apple M3 Max. Dependencies were installed at each checkout root with `CI=1 pnpm install --frozen-lockfile`. Package builds and validation used Nx, one Nx command at a time.

## Named builders and larger production builds (final follow-up)

Compound nodes now live in named functions in `serverFnAst.ts`: caller RPCs,
provider declarations, exports, runtime imports, and both HMR guards. The compiler
handler retains only simple directive/reference construction. Eight dedicated
builder tests assert generated JavaScript strings, including escaped values,
Unicode identifiers, export order, both HMR guards, and all three frameworks'
runtime imports. Public compiler execution and source-map tests remain intact.
The extraction is retained for the user's requested readability and unit testing;
the five previously attributed optimization groups remain unchanged in behavior.

The new `server-fn-build.mjs` builds a complete generated React Start app using
Vite's normal client/server `createBuilder()` / `buildApp()` pipeline. Each module
contains ten server functions; one rendered route references all functions in
button callbacks. Seven fresh-process pairs per size alternate baseline/candidate
order. No tests or package builds ran concurrently. Source hashes match, and each
variant's source, executable compiler, and dependency fingerprints stay constant.

| Server functions | Median build ms, #8523 → candidate | Reduction | CV, before → after | Peak RSS MiB, before → after |
| ---------------- | ---------------------------------: | --------: | -----------------: | ---------------------------: |
| 100              |                    333.07 → 326.33 |      2.0% |        4.0% → 4.1% |                329.8 → 324.2 |
| 1,000            |                    886.94 → 813.09 |      8.3% |        6.4% → 3.9% |                519.9 → 483.2 |
| 5,000            |                  6682.98 → 6048.85 |      9.5% |        2.6% → 2.2% |                883.8 → 849.5 |

At 1,000 and 5,000 functions, the candidate wins all seven paired comparisons.
The ranges of paired time reductions are 5.1–23.3% and 5.3–12.7%, respectively.
The 100-function difference is small relative to variation and does not establish
a useful build-speed improvement. The 5,000-function single-route fixture is a
stress case, not a claim about typical applications. Increasing function count
also grows import/reference processing, manifests, and bundling; these are full
build measurements, not isolated builder timings.

Timing includes builder creation, transformation, bundling, minification, and
output writes. It excludes fixture generation, plugin-module loading, validation,
and hashing. Fixed custom RPC IDs bypass default ID hashing in both variants.
Peak RSS covers the entire worker process, including setup. These measurements
use a different app and timing boundary from the existing-app build below.

Every expected RPC ID survives in both client/server output. Every unique handler
marker survives on the server; none leaks into client code. Across all 42 builds,
client JavaScript matches byte-for-byte. Complete emitted JavaScript also matches
after normalizing checkout/temp roots and references to content-hashed output
filenames, with collisions rejected. The three sizes emit 19, 109, and 509 total
JS files (two client files each). Input/output hashes and raw samples:
[100 functions](results/direct-ast-heavy-builds-100.json),
[1,000 functions](results/direct-ast-heavy-builds-1000.json),
[5,000 functions](results/direct-ast-heavy-builds-5000.json).

The extracted implementation also retains the focused compiler gains in a fresh
five-pair comparison, with four warmups and sixteen measured passes per worker:

| Workload | Median ms/pass, #8523 → candidate | Reduction | CV, before → after |
| -------- | --------------------------------: | --------: | -----------------: |
| client   |                     13.42 → 11.41 |     15.0% |        1.8% → 5.6% |
| ssr      |                     14.96 → 11.99 |     19.9% |        1.5% → 3.8% |
| provider |                     21.00 → 15.17 |     27.7% |        1.5% → 2.0% |
| dev      |                     23.71 → 16.76 |     29.3% |        1.7% → 1.5% |
| dense    |                     20.01 → 15.17 |     24.2% |        1.0% → 7.9% |
| single   |                     14.86 → 11.17 |     24.8% |        2.9% → 1.7% |
| control  |                       1.92 → 1.87 |      2.6% |       1.3% → 10.9% |

The dense and unchanged-control cases are noisier; the control is not an
optimization claim. Do not compare absolute times with the earlier protocol.
[Raw final compiler timings](results/direct-ast-builders-timings.json).
Separate diagnostic runs confirm identical complete generated code and source maps
for every workload: [final digests](results/direct-ast-builders-digests.json).

Current package validation passes: **608 Start plugin tests in 37 files**,
TypeScript 5.6/5.7/5.8/5.9/6/7, ESLint, build/export checks, and available
React/Solid/Vue Start consumer checks, including Solid's four unit tests.
Five follow-up coverage reviews found no production defect; their benchmark
suggestions supplied the full-build survival checks and stable fingerprints.
The extracted implementation also passes **165 browser tests**: React/Vite 53,
React/Rsbuild 53, Solid 29, Vue 27, and Rsbuild cache/watch 3. App sources edited
by the watch tests were restored.

The final full **18-scenario** bundle run has zero raw/gzip/Brotli/initial-load
size and chunk-count changes. All **38 client JS files are byte-identical** to
#8523. [Final bundle metrics](results/direct-ast-bundle-builders-final.json),
[file hashes](results/direct-ast-bundle-builders-final-hashes.json),
and [current compiler verification](results/direct-ast-final-verification.json)
refer to the extracted implementation, not the earlier inline candidate.

## Initial inline-builder compiler measurements

The same `server-fn-ast.mjs` drives both built checkouts through the public Start compiler host. Each pass creates a fresh compiler and compiles every source module, so there are no output-cache hits. Five fresh process pairs alternate baseline/candidate ordering, with two warmups and eight measured passes per process. Timed runs have no output hashing; separate diagnostic runs check complete generated code and serialized source maps. No builds or tests ran concurrently with timings.

Each row is a workload median across fresh processes. CV is the between-process coefficient of variation. Peak RSS includes Node and native allocations, including warmups; it is not a process-tree sum.

| Workload                          | ms/pass, before → after | Reduction | CV, before → after | Peak RSS MiB, before → after |
| --------------------------------- | ----------------------: | --------: | -----------------: | ---------------------------: |
| Client: 60 modules × 2 functions  |           14.90 → 12.91 |     13.4% |        4.3% → 1.2% |                146.4 → 114.9 |
| SSR caller: 60 × 2                |           13.72 → 11.63 |     15.2% |        3.6% → 2.5% |                151.5 → 121.6 |
| Provider build: 60 × 2            |           23.31 → 16.77 |     28.1% |        7.1% → 3.2% |                165.8 → 119.5 |
| Provider dev + directives: 60 × 2 |           26.00 → 19.00 |     26.9% |        3.5% → 4.1% |                171.2 → 116.4 |
| Provider build: 60 × 1            |           14.23 → 10.89 |     23.5% |        1.5% → 1.0% |                134.8 → 109.9 |
| No-candidate control: 60 modules  |             2.71 → 2.72 |     -0.4% |        7.0% → 1.2% |                  80.1 → 80.0 |

The control is unchanged within noise. These compiler gains are not whole-build speedup estimates. Raw final samples and post-GC retained-heap measurements are in [final timings](results/direct-ast-final-timings.json); the [pre-attribution run](results/direct-ast-timings.json) remains separate. The production source restored after attribution is byte-identical to the pre-attribution candidate.

The short final dense-module run had a 21.7% candidate CV, so its timing is not used as the dense result. A narrower seven-pair rerun used eight warmups and 64 measured passes in both variants:

| Workload                   | ms/pass, before → after | Reduction | CV, before → after | Peak RSS MiB, before → after |
| -------------------------- | ----------------------: | --------: | -----------------: | ---------------------------: |
| One module × 150 providers |           16.52 → 11.71 |     29.1% |        1.7% → 1.8% |                337.2 → 282.5 |

[Dense raw data](results/direct-ast-dense-refined-timings.json). The longer protocol has a different GC/steady-state profile; do not combine its absolute timings or RSS with the short-run table. Per-pass timing samples preserve tail/outlier behavior as well as the means and standard deviations.

## Hunk attribution

Each group was applied alone to the same baseline, rebuilt through Nx, checked for code/map identity, timed against baseline, and measured with the `react-start.full` client-bundle scenario. Literal/reference helpers were treated as dependencies, not standalone optimization groups. Each isolated bundle has zero raw, gzip, initial-load, and Brotli size delta; see [bundle records](results/direct-ast-hunk-bundles.json).

| Independent group                                       | Focused evidence                                                                                                      | Decision |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Caller RPC expressions                                  | [client: 14.75 → 12.77 ms (13.5%); ssr: 12.91 → 11.46 ms (11.3%)](results/direct-ast-caller-timings.json)             | Retain   |
| Provider declarations, metadata, and handler references | [provider: 20.56 → 16.30 ms (20.7%); dense: 18.64 → 13.64 ms (26.8%)](results/direct-ast-provider-timings.json)       | Retain   |
| HMR guards                                              | [dev: 20.08 → 18.46 ms (8.1%)](results/direct-ast-hmr-refined-timings.json)                                           | Retain   |
| Directives                                              | [provider: 18.49 → 17.82 ms (3.6%); dev: 20.75 → 20.57 ms (0.9%)](results/direct-ast-directives-refined-timings.json) | Retain   |
| Runtime imports                                         | [client: 11.80 → 11.57 ms (2.0%); single: 12.74 → 12.20 ms (4.3%)](results/direct-ast-imports-refined-timings.json)   | Retain   |

Caller/provider attribution uses five alternating pairs, two warmups, and 16 passes. Initial short HMR/directive/import results were noisy and are retained in the `direct-ast-*-timings.json` files. Their refined comparisons use seven pairs, eight warmups, and 64 passes. The nonempty-directive and client-import changes are small relative to their noise; retention is supported by the clearer default-provider and single-provider cases respectively. Hunk gains must not be added: normal allocation/GC and cleanup interact.

Longer HMR measurement establishes a benefit after the first short run suggested a small regression. No further template sharing or cloning path was added: direct construction preserves independent mutable nodes and explicit ownership without extra state. Emitted client code is unchanged, so there is no measured DCE/annotation opportunity in this diff.

## Initial existing-app production build

Five alternating fresh-process pairs build `e2e/react-start/server-functions` with Vite, after preparing both apps through Nx. Builds include config loading, compilation, bundling, minification, and writes; they exclude Nx orchestration and the separate TypeScript phase. The source hash matches in every sample.

Median build time is **950.26 → 962.54 ms** (+1.3%), with 1.2%/1.5% CV. This small difference does not establish a whole-build speedup or a reliable regression. Peak process RSS is **567.0 → 526.1 MiB**. [All build samples](results/direct-ast-builds.json).

All 47 production client JS files match byte-for-byte. The 160 total JS files differ only in the server manifest’s absolute checkout-root paths and the resulting manifest filename hash referenced by the server entry. Normalizing exactly those fields gives identical server code; [output audit](results/direct-ast-app-output.json).

## Initial validation before builder extraction

- Start plugin: **600 tests in 36 files**, passing on both baseline and candidate. New public compiler tests execute client/SSR/provider output across React, Solid, and Vue; cover escaped IDs/filenames, Unicode identifiers, generated callback ownership, directives and import order, both executable HMR guards, retained handler source maps, and recompilation after invalidation.
- TypeScript **5.6, 5.7, 5.8, 5.9, 6, and 7**, ESLint, build/export checks pass. Available consumer checks for React/Solid/Vue Start also pass (including Solid Start’s four unit tests). Shared Vite/Rsbuild adapter unit suites are included in the Start plugin run.
- Production browser tests: **React/Vite 53, React/Rsbuild 53, Solid 29, Vue 27**. Development Rsbuild warm-cache, uncached, and watch/invalidation browser tests: **3**. Total: **165 passing browser tests**. Test-modified app sources were restored.
- Complete code and source-map digests match for every focused workload and every isolated group. [Final digests](results/direct-ast-final-digests.json). Existing server-function snapshots remain unchanged.
- The final full **18-scenario** client bundle comparison has **zero raw, gzip, Brotli, initial-load size, or JS chunk-count delta**. All **38 emitted client JS files are byte-identical**. [Before](results/direct-ast-bundle-baseline.json), [pre-attribution candidate](results/direct-ast-bundle-pre-attribution.json), [final](results/direct-ast-bundle-final.json), [before hashes](results/direct-ast-bundle-baseline-hashes.json), [final hashes](results/direct-ast-bundle-final-hashes.json).

The mandatory five coverage reviews found no introduced defect; their suggestions drove executable HMR, property-name cleanup, escaping, invalidation, and focused benchmark coverage. The local Apple Git shim initially blocked bundle metadata on the Xcode license gate. Rerunning with the already-installed Command Line Tools (`DEVELOPER_DIR=/Library/Developer/CommandLineTools`) completed the normal runner; no repository workaround or license change was made.

## Reproduction

Use `.nvmrc` and the root package-manager version, install at each root, and build both checkouts through Nx. See [the compiler benchmark guide](README.md#direct-server-function-ast-construction) for commands. Isolate each production group for attribution, rebuild, and pass its relevant `--cases`; the recorded JSON contains exact iterations, warmups, source hashes, and built compiler fingerprints.

Final validation used `pnpm format`, Nx package unit/types/lint/build targets and the resolved Start e2e targets, followed by the full `pnpm --silent benchmark:bundle-size:run --analysis --test-projects @tanstack/start-plugin-core` comparison. Raw evidence is retained alongside this report.
