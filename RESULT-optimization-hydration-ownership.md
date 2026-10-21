# Hydration generation ownership and size

Work is isolated in the attached `pr6631-hydration-branch-removal` worktree so
unrelated API/type edits in the primary checkout do not contaminate comparisons.
Toolchain: Node 26.10.0, pnpm 11.21.0; identical installed dependencies.

## BEFORE

The implementation was explicitly stashed, excluding `FINDINGS.md`. Baseline
runtime is `3b3fa2f5c787` (documentation HEAD `bd75504dfa`); source SHA-256:
`5e356e2d8088fa99b9fac7bdfcffdbb9f63869c71751f8acbf041ee04811b55a`.
The test-only commits are `3949143343`, `bbbf5cd8fd`, `40488d7607`, and `987264a0f7`.

| Scenario             | Total gzip | Initial gzip |     Raw | Brotli |
| -------------------- | ---------: | -----------: | ------: | -----: |
| react-router.minimal |     86,247 |       86,110 | 268,402 | 75,179 |
| react-start.minimal  |     99,720 |       99,581 | 311,434 | 86,683 |

Run `hydration-before-all` measures all 18 scenarios with source analysis.
This reproduces `ss-codecs-final-all`. Original PR head measures 99,555 Start
gzip; the requested target is at most **99,455**, not 99,620.

Public adoption regressions fail before implementation: a parent and child
with `dehydrate: false` start during hydration, then a same-location load adopts
them. The child's parent snapshot loses success data or error/not-found state
when the hydration consumer is canceled. Both handlers run once. Three red
cases establish the bug; they do not mutate internal state. Tests also check
public generation signals through settlement and departure. The separate fresh,
frozen codec-arguments regression passes on baseline.

Validation was run through Nx with `CI=1 NX_DAEMON=false`, one command at a time,
`--outputStyle=stream --skipRemoteCache --skipNxCache`:

- Unit/types/ESLint/build matrix for core, React/Solid/Vue Router,
  start-client-core, start-server-core, react-start-client and react-start-server.
  All unaffected targets pass. The expected core unit failures are the three
  adoption cases. A benchmark annotation initially required `loaderData` rather
  than its actual optional property; the tests-only correction was committed,
  and the repaired baseline type matrix and unit suite were rerun. The final matching
  baseline run includes the additional codec-arguments test and has 3 failures,
  3,941 passes, 4 expected failures and 3 skips, with no type errors.
- Lifecycle e2e: 75 pass. Selective SSR e2e: 11 pass.
- Native production CJS measurements: the same hydration loader-work cases
  (`client-`, `rerun-`, `all-active`, depths 4/16, synchronous/asynchronous) and
  transformed serial-lifecycle cases. Router setup, real server transport,
  bootstrap replay and correctness assertions are outside the timed work.
  The adoption benchmark refuses to time baseline because its parent-data
  assertion fails. There is no valid baseline adoption timing.

Before commands/results are in `/tmp/pr6631-hydration-v11/before-commands.json`,
`before-*.log`, `baseline-type-repair-*`, `baseline-repaired-unit-*`, and
`baseline-codec-args-*`. The exact runner is `phase.py` in that directory.
Native test runs have roughly 5–9% relative margin of error and GC tails;
short screens alone are not proof of a universal CPU improvement. The later
matching resource extension has a depth-4 synchronous rerun outlier at 15.03%
RME; its large apparent speedup must not be used as a headline.

## Candidate and attribution

The shared generation produces a raw outcome. Ordinary lanes independently wait
and resolve redirects. Hydration consumes raw parent snapshots and uses its
existing single cancellation mechanism. Cancellation is no longer a possible
raw generation outcome in TypeScript. A detached hydration consumer may stop
waiting without destroying parent results used by adopted ordinary handlers.

A normal consumer's cleanup no longer needs a hydration-specific fetching branch.
The existing transaction owner still guards publication; the post-await flight
identity guard remains necessary for discarded background work.

Five independent reviewers checked outcome ownership, consumer cleanup, bounds,
coverage/performance and API contracts. Later independent reviews covered indexed
parent selection, fresh codec arguments and the rejected additional prototypes.
No supported-startup regression was found in the retained ownership draft.

## AFTER

Runtime commits: `d2fdee32de`, `12b2a12625`, `aee2e40de3`, `99c33764fd`,
and `5ff5291a24`. Final `load-client.ts` SHA-256:
`2f212b943497632cacc83d19e209e5bb80dcac47afe038239af5c1c08cd7b587`.
The function `hydrate` remains last in its original module.

| Scenario             | Total gzip | Initial gzip |     Raw | Brotli |
| -------------------- | ---------: | -----------: | ------: | -----: |
| react-router.minimal |     86,239 |       86,100 | 268,380 | 75,189 |
| react-start.minimal  |     99,710 |       99,570 | 311,487 | 86,540 |

The net changes against BEFORE are −8 SPA and −10 Start gzip bytes.
Start remains **155 above original PR head**, and **255 above the 99,455 target**.
No target crossing is claimed. The correctness extraction alone adds 15 bytes;
its selected simplifications recover 25. Hunk and composition measurements,
including rejected candidates, are recorded in `BUNDLE-SIZE.md`.

The same eight-package unit/type/ESLint/build matrix passes. Core: **3,944 pass**,
four expected failures and three skips; no type errors. All three adoption
regressions now pass. Lifecycle and selective-SSR browser runs again pass all
86 cases. The final full 18-scenario run is `hydration-after-all`.

Four combined-change outliers grow: React Start Rsbuild minimal +11 and IIFE
+12; Solid Start minimal +5 and full +9. The other 14 scenarios shrink. These
are reported as combined-change results. A later correctness-only full-18
counterfactual (`hydr17-correctness-all`) shows the optional simplifications
improve all 18 scenarios against the required extraction, by 8–42 gzip bytes.
Thus the four residual increases do not justify reverting the optional cuts.
This separates the dependent groups, not prices for each individual hunk.

Independent audit recompressed every before/after emitted JavaScript file
(76 total), matching all per-file, initial and total raw/gzip/Brotli sums.
All 18 application maps change only `load-client`; package maps embed the exact
final TypeScript source. Evidence: `/tmp/pr6631-hydration-v11/independent-ownership-final-full-audit.json`.

## Performance and allocation evidence

The resource extension uses the same benchmark and Node production CJS runtime
in both phases. It counts PROMISE async resources created while awaiting one
validated operation, outside timing. Counts include fixed harness overhead;
they are not retained promises, heap bytes or GC measurements.

| Hydration workload           | Depth 4 before→after | Depth 16 before→after |
| ---------------------------- | -------------------: | --------------------: |
| No active loader             |                34→34 |               106→106 |
| Alternating active codecs    |                55→51 |               193→177 |
| All synchronous codecs       |                74→66 |               266→234 |
| All asynchronous codecs      |                90→82 |               330→298 |
| Ordinary synchronous reruns  |                74→66 |               266→234 |
| Ordinary asynchronous reruns |                82→74 |               298→266 |

Thus the removed hydration consumer wrapper saves exactly **two created Promise
resources per active loader**. Ordinary client-load counts stay unchanged:
depth 4 sync/async 112/120; depth 16 328/360.

Matched extension means below are microseconds; RME is each run's relative
margin of error. Full JSON retains percentiles, samples and all distributions.

| Depth-16 workload                 | Before | After | Before/after RME |
| --------------------------------- | -----: | ----: | ---------------: |
| Active synchronous codecs         |  47.63 | 46.23 |    6.10% / 6.17% |
| Active asynchronous codecs        |  50.75 | 46.84 |    6.15% / 5.95% |
| Ordinary synchronous reruns       |  46.09 | 44.23 |    5.69% / 5.56% |
| Ordinary asynchronous reruns      |  48.28 | 44.80 |    6.10% / 5.68% |
| Ordinary client synchronous load  |  38.19 | 37.82 |    3.56% / 3.63% |
| Ordinary client asynchronous load |  40.00 | 38.01 |    3.83% / 3.35% |

The async/sync active-codec gap moves from 6.54% to 1.31% in this sample.
Intervals overlap; this is not proof that the historical 11.5% overhead is
eliminated. The asynchronous workload still creates 64 more Promise resources than its
synchronous counterpart at depth 16. It uses an async callback with an explicit
resolved-Promise await; these cuts do not remove that remaining callback and
assimilation work. This is not a lower bound for every async codec. The resource reduction has a direct structural explanation; the
larger first-pass timing gains are workload observations, not universal claims.

Serial transformed depth-16 means are 53.64→52.20 µs sync and 57.57→58.70 µs
async, with approximately 5.6–6.1% RME. This code path is structurally unchanged;
there is no resolved slowdown or speedup at this precision. Native adoption
measurements pass correctness AFTER; baseline failed its data assertion, so
there is **no valid before/after adoption timing**.

The broader React DOM hydration and loader-navigation guide benchmarks both
pass in each phase. Their reporter emits no numerical timing statistics;
report them as workload smoke coverage only. Server execution source is
unchanged, so no new SSR CPU speedup is claimed.

## Reproduction and limits

Commands and toolchain/environment are saved in `before-commands.json`,
`after-commands.json`, `before-extended-commands.json` and
`after-extended-commands.json` under `/tmp/pr6631-hydration-v11/`.
The runners are `phase.py`, `phase-final.py` and `extended.py`. Each Nx command
runs alone with caches bypassed. The full source, logs, maps and emitted bundles
are preserved beside them. Independent resource/timing reconciliation is
`independent-ownership-resources-audit.json`.

A subsequent public nested-microtask probe reveals a separate pre-existing
queued-producer adoption bug on both BEFORE and AFTER. It is not fixed by this
round and must be considered before further startup simplification. It does not
invalidate the started-handler parent-data regressions fixed here. Its draft
public regression remains under `/tmp`, with red logs for both exact sources.

## Admission follow-up — matching BEFORE

Test-only commit `2b5589af14` adds public terminal/error/not-found and mixed
selective-SSR benchmark workloads. Five fresh reviewers checked the single
admission merge. The full accumulated implementation was stashed with an
explicit `load-client.ts` path in the isolated worktree; `FINDINGS.md` was neither
present in that stash nor committed. BEFORE is therefore the same **99,720 /
86,247** runtime (`5e356e…`), rather than the intermediate 99,710-byte commit.
The marginal admission saving remains the separate `hydr17-restore-admission`
comparison: 99,710→99,706.

The fresh full-18 baseline `hydration-v21-before-all` reproduces every earlier
BEFORE metric. All other 31 matrix targets pass; core has exactly the three
expected adoption failures, 3,941 passes, four expected failures and three skips,
with no type errors. Lifecycle 75 and selective-SSR 11 browser cases pass.
Matched native idle, client, active codec, ordinary rerun, shallow/deep terminal,
mixed selective-SSR and transformed serial cases all pass public correctness
assertions before timing. Command/environment/source records are in
`/tmp/pr6631-hydration-v11/v21-before-commands.json`; emitted snapshots are in
`emitted-v21-before`. AFTER is recorded below; rejected prototypes do not replace the
verified candidate.

Additional public readiness coverage was committed at `f406dbd062` before
restoring the implementation. Its real SSR/bootstrap test passes separately on
the exact baseline (included in `pending-after-shell-v22-baseline-probes.log`)
and fails on the rejected pending-prefix shortcut (`pending-only-readiness-v22-red.log`).
This adds one positive case to the final matrix; the original full BEFORE matrix
predates that test. The temporary handler round trip in the same probe group
remains red on baseline and stays outside the checked-in suite until its fix is
approved/retained. The shell-preserving correction passes 3,947 core cases, but
measures 99,721 (+15 against the 99,706 merge) and is not retained as an
optimization. The selected final implementation remains the admission merge
SHA `a4af4794048162245b039aa4a3fa6a4cb4734d31c6888b02bb779418629d15ed`.

## Admission follow-up — verified AFTER

Commit `7fe0c4154f` retains the admission merge on top of the five runtime
commits above. `hydrate` remains the final declaration in `load-client.ts`.
The final source SHA is
`a4af4794048162245b039aa4a3fa6a4cb4734d31c6888b02bb779418629d15ed`.
All 32 unit/type/ESLint/build targets pass. Core has 3,945 passes, four expected
failures and three skips; no type errors. Lifecycle 75 and selective SSR 11
browser cases pass. The extra readiness test was added after the full BEFORE
matrix and has its separately recorded baseline pass, so these test counts do
not imply identical full-suite contents. The other test/benchmark workloads
match across phases.

All 18 app scenarios are measured with source analysis:

| Scenario                         | BEFORE gzip | AFTER gzip | Delta |
| -------------------------------- | ----------: | ---------: | ----: |
| react-router.full                |      89,944 |     89,925 |   -19 |
| react-router.minimal             |      86,247 |     86,239 |    -8 |
| react-start.deferred-hydration   |     100,457 |    100,451 |    -6 |
| react-start.full                 |     102,847 |    102,848 |    +1 |
| react-start.minimal              |      99,720 |     99,706 |   -14 |
| react-start.query-integration    |     107,308 |    107,300 |    -8 |
| react-start.rsbuild.full         |     106,769 |    106,765 |    -4 |
| react-start.rsbuild.minimal      |     103,497 |    103,518 |   +21 |
| react-start.rsbuild.minimal-iife |     103,915 |    103,938 |   +23 |
| solid-router.full                |      39,398 |     39,378 |   -20 |
| solid-router.minimal             |      34,354 |     34,334 |   -20 |
| solid-start.deferred-hydration   |      51,032 |     51,022 |   -10 |
| solid-start.full                 |      53,050 |     53,056 |    +6 |
| solid-start.minimal              |      47,910 |     47,908 |    -2 |
| vue-router.full                  |      56,554 |     56,523 |   -31 |
| vue-router.minimal               |      50,820 |     50,817 |    -3 |
| vue-start.full                   |      71,398 |     71,391 |    -7 |
| vue-start.minimal                |      67,604 |     67,573 |   -31 |

Start minimal is 99,706 total gzip, 99,566 initial gzip, 311,450 raw and
86,769 Brotli. SPA minimal is 86,239 total gzip, 86,100 initial gzip, 268,380 raw
and 75,189 Brotli. Admission alone saves four Start bytes against 99,710, but
adds 229 Brotli and 10/11 gzip bytes to Rsbuild minimal/IIFE. The complete
optional group improves every scenario against the correctness-only extraction,
by 8–47 bytes. These are measured composition effects, not additive feature
prices. Start still needs **251 gzip bytes** to reach the requested 99,455;
the target is not met.

Resource probes again remove exactly two created Promise resources per active
hydration loader. Idle counts remain 34/106 at depths 4/16, ordinary client
counts 112/120 and 328/360 (sync/async), shallow terminal 22, deep terminal
34/106, and selective pending 28/100. These include fixed harness overhead and
are neither retained-object nor heap measurements.

| Depth-16 workload               | BEFORE µs | AFTER µs | BEFORE/AFTER RME |
| ------------------------------- | --------: | -------: | ---------------: |
| Active synchronous codecs       |     44.74 |    45.02 |    5.56% / 5.83% |
| Active asynchronous codecs      |     48.16 |    44.16 |    5.96% / 5.33% |
| Ordinary synchronous reruns     |     48.08 |    45.85 |    6.26% / 5.83% |
| Ordinary asynchronous reruns    |     48.60 |    45.60 |    6.03% / 5.80% |
| Serial transformed synchronous  |     54.26 |    51.24 |    5.82% / 5.40% |
| Serial transformed asynchronous |     56.86 |    55.07 |    5.74% / 5.60% |

No resolved timing regression is established. The largest mean increases are
serial transformed depth 4 (+9.05%), idle depth 4 (+5.60%), and client async
depth 16 (+4.41%); their intervals overlap. Across this paired run, RME is
3.31–6.81% BEFORE and 3.51–7.08% AFTER. This does not establish a universal
async speedup or elimination of the historical 11.5% overhead.

The exact runner is `/tmp/pr6631-hydration-v11/admission-phase-v21.py`;
command, environment, exit status and source records are in `v21-*-commands.json`
and `v21-*-load-client.ts`. The resource environment flag is set explicitly
in the runner; the compact command record omits that field.
`independent-v21-performance-audit.json` preserves counts, means, RME, samples
and p999. `independent-v21-final-full-audit.json` independently recompresses all
76 JavaScript files with no file/total/initial mismatch. All 18 maps change
only `load-client`; package source maps and exact isolated source bind the SHA
above to both the Vite and Rsbuild output.

## Rejected full serial consolidation and final restoration

The v24 full shared serial-phase draft fails one existing public GC regression
and two type checks. Its planner closure newly captures the whole loader-promise
array. v25 fixes that lifetime by making the array local to the callback and
returning it, and passes core's 3,945 positive cases plus types. Its focused
performance screens pass their public correctness assertions; the short samples
do not establish a speedup.

It is rejected: `shared-phase-v25` measures Start 99,799 (+93) and SPA 86,488
(+249), against 99,706/86,239. Its extra helper await also changes cancellation
ordering. An independently verified public, stable-then getter navigation probe
ends on `/page` pending on actual a4 and `/other` success on actual v25.
The comparison and runner are saved under `/tmp/pr6631-hydration-v11/`; no
shared-phase draft is applied to the primary checkout.

Final source and built packages are restored to a4. The full-18 final bundle
run is `hydration-v26-restored-all`, with commands in `v26-commands.json` and
emitted snapshots in `emitted-v26-restored`. The retained target remains 99,706,
with the 251-byte gap explicitly unresolved. No unverified branch deletion or
feature removal is counted toward that target.

The final independent restoration audit (`independent-v26-restored-audit.json`)
finds all 18 metric objects and all 38 JavaScript files plus 38 maps identical
to the verified v21 AFTER artifacts. Per-file and initial/total recompression
also matches. The primary, isolated and built sources all bind the same a4 SHA.
