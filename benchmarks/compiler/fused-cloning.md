# Fused AST cloning and provenance

This change is stacked on PR #8504 at
`9594d49eaa19911d02fe25088897cffe4ccc02a9`. The baseline PR is unchanged.

## Implementation

`router-utils` copies AST fields and constructs provenance in one iterative
traversal. Each output remains independently mutable. The copying lookup
preserves shared objects within an output, including node aliases, arrays,
and comments; native RegExp values are copied explicitly. Primitive values,
BigInt, array holes, comments, source spans, and generated symbol/name references
are preserved. The work stack avoids a recursive clone depth limit.

The splitter consumes the source-to-copy lookup directly instead of walking the
copied program to reconstruct it. The lookup is local to one output and exposes
only `get`, because its private bookkeeping includes non-node AST records.
Copied-node-to-source provenance remains a WeakMap. There is no global cache,
shared mutable output, parser change, or selective-copy path.

## Correctness and workflow

The original implementation failed the public-builder 12,000-level generated
fragment test in `structuredClone`; the fused copier passes it. This establishes
clone depth handling, not unlimited parser or printer depth. Native-field,
source-map, generated-reference, alias, nested-mutation, sparse-array, numeric
value, and shadowing coverage also passes. React and Solid splitter fixtures
exercise shared RegExp/BigInt values in every grouping; 26 snapshots were
reviewed, including shared initializer ownership and empty shared outputs when
all consumers belong to one chunk.

The repository's bundle-size skill supplied five independent read-only reviews.
Their additional test/performance cases were incorporated. Tests and implementation
remained uncommitted during measurement. A separate baseline worktree kept the
before implementation intact while measurement variants were evaluated.

## Measurements

Final CPU measurements are below. Exploratory
WeakMap and property-enumeration variants are retained separately in
`results/fused-clone-weakmap-*.json` and
`fused-clone-enumeration-*.json`; they are not final acceptance results.

The property-enumeration variant removed temporary key arrays but slowed the
splitter, so it was rejected. An output-local Map performed better than a
WeakMap for the forward copying lookup and reduced observed peak memory in the
follow-up samples. Neither variation changes node ownership or emitted code.

Measurements use Node 24.8.0, pnpm 11.21.0, and Yuku 0.12.0 on macOS arm64.
Timing runs are serialized, with no concurrent tests/builds from this task.
Five fresh process pairs alternate baseline/candidate order. Compiler speedups
are workload-specific; percentages from separate workloads must not be added.
Peak RSS is the process high-water mark, not isolated allocation accounting or
retained memory. GC/allocator effects and run variation limit small memory claims.

## Reproduction

Install each checkout at its root with `CI=1 pnpm install --frozen-lockfile`.
Build workspace packages through Nx before using the standalone compiler harnesses.
Use the candidate fixture root for both checkouts so they read identical inputs.

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-plugin:build --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @tanstack/start-plugin-core:build --outputStyle=stream --skipRemoteCache
node --expose-gc benchmarks/compiler/clone.mjs --workspace /path/to/checkout --case route
node benchmarks/compiler/measure.mjs --workspace /path/to/checkout --fixtures-root /path/to/candidate --modes yuku-splitter --repetitions 1 --iterations 10 --warmups 2
node benchmarks/compiler/measure.mjs --workspace /path/to/checkout --modes yuku-splitter --bindings 1000 --repetitions 1 --iterations 5 --warmups 2
node benchmarks/compiler/route-heavy.mjs --workspace /path/to/checkout --routes 250 --repetitions 1
node benchmarks/compiler/hydrate-scaling.mjs --workspace /path/to/checkout --sizes 100,500 --env client --repetitions 1 --iterations 5
```

Repeat the commands in alternating AB/BA order five times. Direct clone cases
are `route`, `wide`, `literals`, `deep`, `identifier`, `generated`, and `shared`.
Code/map digest checks use a separate splitter run with `--digest-output
--repetitions 1 --iterations 1 --warmups 0`; diagnostic timing is excluded from
speed claims. The older Babel comparison driver is not used for this
native-to-native comparison.

## Final BEFORE / AFTER CPU and memory results

| Workload                                | Median ms, before → after | Time reduction | Timing CV, before / after | Median peak RSS MiB, before → after |
| --------------------------------------- | ------------------------: | -------------: | ------------------------: | ----------------------------------: |
| 56-fixture / 567-output splitter corpus |            101.91 → 64.27 |          36.9% |               5.2% / 4.5% |                       211.4 → 271.2 |
| 1,000 shared bindings                   |           185.95 → 123.61 |          33.5% |               2.6% / 1.9% |                       260.8 → 267.8 |
| 250-route production Vite build         |          1094.26 → 947.55 |          13.4% |               3.1% / 5.1% |                       647.8 → 649.2 |
| 100-boundary Start Hydrate compilation  |             13.94 → 12.36 |          11.3% |               7.2% / 5.7% |                         98.8 → 97.6 |
| 500-boundary Start Hydrate compilation  |             51.80 → 45.68 |          11.8% |               9.0% / 5.5% |                       211.2 → 211.8 |

[Raw alternating compiler samples](results/fused-clone-compiler.json) include every process, input hash, source/built fingerprint, timing, and memory sample. Splitter runs use two warmups and ten corpus passes; dense runs use two warmups and five passes. Hydrate runs use the harness's one warmup and five compiles. All source and executable fingerprints remain stable within each variant.

Peak RSS does **not** consistently improve. The final splitter workload has higher peak RSS despite essentially unchanged post-GC retained heap (about 8.2–8.3 MiB). Dense compilation also rises slightly; the production build and Hydrate peaks are nearly unchanged. Earlier exploratory samples varied substantially. This PR is justified by lower CPU cost; it does not establish lower compiler memory usage.

| Direct cloning case | Median process mean, µs before → after | Time reduction |
| ------------------- | -------------------------------------: | -------------: |
| route               |                          43.90 → 13.60 |          69.0% |
| wide                |                     10903.20 → 4401.94 |          59.6% |
| literals            |                       1623.32 → 626.58 |          61.4% |
| deep                |                         128.26 → 40.22 |          68.6% |
| identifier          |                            1.81 → 0.38 |          78.9% |
| generated           |                           15.10 → 5.67 |          62.5% |
| shared              |                            3.39 → 0.59 |          82.5% |

[Raw focused samples](results/fused-clone-focused.json) retain all 100 batch timings per process, standard deviation, and p99. These repeated-clone timings exclude parsing/printing. Tiny fragment results are batched to reduce timer overhead and are not whole-application speed claims.

## Attribution and bundle pass

The production diff has two dependent groups: the shared fused copier (including
generated fragments), and consuming its lookup in `createOutput`. The copier
alone is valid with the old splitter indexing walk, so that combination was
measured separately. With the final 56-fixture corpus, its five-process median
was 72.06 ms (71.19–75.76 ms), versus 64.27 ms for the complete change in the
alternating run. Both improve on the 101.91 ms baseline. These separate-run
figures attribute removed work; their percentages must not be added together.
See [copy-only raw samples](results/fused-clone-attribution-copy-only.json).

All 18 scenarios were rebuilt with source attribution for the baseline,
copy-only implementation, and final composed implementation. Every scenario
has **0 bytes delta** in gzip, initial gzip, raw, initial raw, Brotli, and initial
Brotli, with identical chunk lists and per-file byte metrics. All 38 final
emitted client JavaScript files are byte-identical to baseline. The compiler
implementation is build-time code; changing its copying mechanism changes no
client output. No output-specific minification or annotation changes are needed.

- [Baseline metrics and source attribution](results/fused-clone-bundle-before.json)
- [Copy-only metrics and source attribution](results/fused-clone-bundle-copy-only.json)
- [Final metrics and source attribution](results/fused-clone-bundle-after.json)
- [Baseline client JS hashes](results/fused-clone-bundle-hashes-before.json)
- [Final client JS hashes](results/fused-clone-bundle-hashes-after.json)

All 567 splitter code/map outputs match across baseline, copy-only, and final,
with combined digest
`d2a65814695b37df7e700b343e1172d9523f30800334de79dfef6ac5653d6e95`.
The final rebuilt source and executable compiler fingerprints match every final
candidate timing sample. Digest records: [before](results/fused-clone-digest-before.json),
[copy-only](results/fused-clone-digest-copy-only.json),
and [after](results/fused-clone-digest-after.json).
Exploratory variant measurements used the earlier 54-fixture corpus; compare
variants only with their matching inputs, not absolute numbers across corpora.

## Final validation

- `router-utils`, `router-plugin`, `router-generator`, `start-plugin-core`, and
  `react-start-rsc`: unit tests, TypeScript 5.6–7 matrix, ESLint, and package
  build/export checks passed through Nx. `solid-start` unit and build checks
  also passed (it has no corresponding type/lint scripts).
- Final unit counts: router-utils 59, router-plugin 734, router-generator 261
  runtime plus 12 fixture/type tests, start-plugin-core 584, react-start-rsc 61,
  and solid-start 4. Router-utils and router-plugin were rerun during the final
  bundle workflow after adding the fixtures.
- Production browser checks: React code splitting 6, Solid code splitting 5,
  Vue JSX routes 22, Start server functions with Vite 53 and Rsbuild 53: **139
  passed**. The shared Start compiler unit suites also cover both adapters,
  import protection, and deferred hydration.
- `pnpm format` and `git diff --check` passed. No dependency or lockfile changes.
- A patch changeset covers `router-utils` and `router-plugin`.
