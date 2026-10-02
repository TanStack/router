# Consolidated React Link presentation sources

Current selected revision **removes handler elision**, following the user's latest explicit decision to prioritize intent preload and publish this code. It matches the exact previously validated no-elision 12-state manifest. Current React minimal gzip is **86,190 bytes (+225 original / +31 PR)** and React full is **89,844 bytes (+236 original)**. All 18 scenarios fit the approximate 250-byte delta budget. No new performance samples or clean suites were run for this byte-identical selection.

The direct comparison uses previous **with-elision**, not original baseline. No-elision intent remount render is −1.56% [95% −9.36%, +6.91%] and task −6.01% [−14.28%, +3.06%], both unresolved. Removing elision has a measured disabled remount cost: render +8.94% [+2.00%, +16.35%] and task +11.46% [+5.01%, +18.30%] versus with-elision. The user deliberately chooses removal despite that mode-specific advantage. This is not a no-benefit claim or an established original-baseline performance acceptance. The historical with-elision intent remount regression remains labelled below and is not assigned to the new revision.

Exact no-elision React checks pass 1231 tests/one skipped, six-version types, lint and exports; 28 React Chromium cases pass. The other 11 runtime states are unchanged, so prior core/Solid/Vue checks are reused. Full 18-scenario actual bundles and minimal emitted/source analysis are preserved. Small tracked reproduction notes, runner and Link-only control patch are linked below; large raw artifacts remain ignored. This selected revision is prepared for publication.

The exact original baseline is `1f0f20a3206a28365d74fd2485b9a8eedbf74dd0`;
current PR control `root194` is `2a9bab85846d49e38b0a7164edaa1f2a781c4e43`.
All later runtime arms use explicit source SHA256 manifests rather than invented
commit identities. See the current continuation immediately below; older trials
remain historical evidence.

Nested routers are outside scope; the exploratory tests and unrun fixture have
been removed. Historical
iterations below are retained for attribution. Existing navigation means are
per workload iteration: 10 mixed ticks, 8 Link steps, 6 cold mounts, 18 deep
navigations. Deep nesting includes six root Links; it is not a zero-Link app.
The dedicated zero-Link control is measured below; its intervals are inconclusive.

Continuation of [phase one](RESULTS.md); earlier source/control snapshots and
metrics follow in their measured order.

## PR8587 destination reuse and publication continuation

Raw data, formatted source snapshots, production diffs, frozen browser binaries,
focused logs and minimal bundle metrics are retained in
`artifacts/pr8587-optimization/`. Navigation scale binaries remain frozen in
`/private/tmp/pr8587-optimization-controls/<arm>/navigation/route-tree-scale`;
identical workload source is tracked. The current twelve-state manifest includes
core `RouterProvider.ts` types and a deletion marker for React `matchContext.tsx`.
The isolated archive consumes its own built workspace packages; no cross-arm
workspace package symlinks or dependency/config changes were introduced.

| Arm                         | Minimal gzip | Delta vs baseline | Status                                           |
| --------------------------- | -----------: | ----------------: | ------------------------------------------------ |
| Original baseline           |       85,965 |                 0 | Exact control                                    |
| Current PR `root194`        |       86,159 |              +194 | Exact control                                    |
| Source + preload            |       86,218 |              +253 | Intermediate screen only                         |
| Initial click               |       86,276 |              +311 | Intermediate screen only                         |
| Control-memo combined       |   Unmeasured |        Unmeasured | Rejected public queued-preload regression        |
| Invocation controls         |       86,210 |              +245 | Focused gates pass; remount regression           |
| No-linear publication       |       86,188 |              +223 | Historical control; confirmed remount cost       |
| Handler-elision composition |       86,205 |              +240 | Final local prototype; intent remount gate fails |

The combined arm includes navigation controls in destination memo dependencies.
Changing only `replace` cancels an already queued intent preload: original
baseline and invocation pass the same public test; combined records zero
preloads where one is expected. It was rejected without spending timing on it.
The invocation arm instead passes current controls separately to `navigate`,
keeps the owned destination stable, and assigns its source immediately at the
event. Both speculative-render tests pass: an uncommitted suspended render does
not change the visible Link's destination or push/replace controls.

Production gates exercise browser `NODE_ENV=production`, separately from unit
`NODE_ENV=test`. A static destination reuses its prior public build result;
validation and middleware still rebuild and commit correct defaults. Adding a
public route params stringifier **after** cached render/preload changes the
committed path from displayed `/target/1` to `/target/v-1` without stale reuse.
Pending ancestor and leaf href/active DOM mutations occur before the click's
same enclosing Chromium task ends, including microtasks, before loader release.

`no-linear` passes 125 core tests and 35 React tests. Original baseline passes
queued preload, legacy fallback and fully retained updater controls, but fails
both public successor-source regressions: held `/a?visit=2` becomes
`/a?visit=3` before the successor loader completes. The candidate passes both.
Setup-only failed attempts (omitted twelfth type file; Nx regex pipe forwarding)
are preserved separately and excluded from red/green evidence; the valid baseline
log is `baseline/public-source-and-queued-filtered.log`.

Six-block dense confirmation uses 12 warmups, 24 untraced and 32 traced
navigations per arm/block, alternating arm order, and separates departure from
mount return. Each arm/direction therefore has 72 untraced and 96 traced samples;
six paired block means are the independent comparison units. All-Link preflight
checks all 1,000 href/active outputs, content, DOM identity and the original
workload updater counts. Builds and other CPU-heavy commands are stopped during
timing. `renderMs` is click to `onRendered`; `taskMs` is the click's enclosing CDP
`RunTask` end. Synchronous dispatch and timer opportunity are separate metrics.

| Arm          | Remount render vs baseline (95%) | Departure render vs baseline (95%) |
| ------------ | -------------------------------- | ---------------------------------- |
| PR `root194` | +15.50% [+7.15%, +24.50%]        | −59.30% [−61.31%, −57.20%]         |
| Invocation   | +12.06% [+7.21%, +17.13%]        | −56.91% [−60.47%, −53.03%]         |
| No-linear    | +9.04% [+3.10%, +15.32%]         | −59.86% [−63.58%, −55.76%]         |

No-linear remount block deltas are +0.78%, +7.77%, +15.33%, +4.57%, +14.13%,
and +12.42%. Direct arithmetic paired no-linear/invocation render delta is
−2.67% [−5.45%, +0.12%]; no-linear/PR is −5.44% [−11.76%, +0.87%]. These
intervals include zero, so helper removal is not established as a mount fix.
Raw/strict summary: `no-linear/paired-confirmation{,-summary}.json`.

Route-scale means are per **27-Link-click workload iteration**. Balanced order
baseline→PR→no-linear then no-linear→PR→baseline yields, respectively:
2.24952/2.26993/2.18977 ms and 2.20941/2.23425/2.28407 ms. No-linear/baseline
paired deltas are −2.66% and −3.27%; no-linear/PR are −3.53% and −1.11%.
Only two independent blocks were collected, so this is directional evidence,
not a robust interval. Initial unpaired screens and minimal sizes are retained;
remount acceptance is based on the six-block confirmation above.

The independent undefined-retirement snapshot was preserved but not rebuilt or
timed, because the same mechanism already failed an earlier six-block trial.
The new retained nonroot/deep fixture is authored but not measured yet; original
root-only controls cannot establish its publication/completion costs. The shared
batched departure-only helper and builder cold-path refactor remain separate
unmeasured candidates. Broader validation must wait for a candidate that addresses
both requested regressions.

### Iterative canonical builder trial

The isolated `builder-iterative` arm changes only `router.ts` relative to
`no-linear`; it removes the per-invocation nested main/mask worker in favor of
one main→optional-mask loop. Formatted twelve-state source hashes, its diff,
production binary and raw/summary samples are in
`artifacts/pr8587-optimization/builder-iterative/`. It passes an expanded 202 core
and 34 React tests under the corrected same-RouterProvider-instance scope.
Production static/validator/middleware/live-stringifier gates and same-task
pending DOM gates pass. Minimal gzip is 86,185 bytes (+220 baseline, −3 no-linear).

The two-block screen suggested remount −4.91% versus simultaneous no-linear;
six balanced blocks did not confirm it. Remount render is +4.90% versus baseline
[95% −4.23%, +14.89%], with block deltas +10.06%, −5.79%, +13.92%, −1.03%,
+15.70%, −1.51%. Direct paired iterative/no-linear arithmetic delta is −2.02%
[−8.15%, +4.11%]; iterative/PR is −4.56% [−12.85%, +3.74%]. Simultaneous
no-linear and PR baseline intervals also span zero in this run. The iterative remount signs also align with reversed arm order: +10.06%,
+13.92%, +15.70% when measured late, and −5.79%, −1.03%, −1.51% when early.
This is a design diagnostic, not a causal dismissal of regression. Counterbalancing
has not yielded a narrow interval. This variability
does not erase the prior confirmed no-linear remount regression or establish an
iterative fix. Departure remains faster: render −56.85% [−60.91%, −52.36%],
task −57.94% [−64.03%, −50.82%]. Iterative scale and broad acceptance checks
remain unmeasured; this arm is unaccepted pending the architect's decision.

### Shared helper and isolated builder attribution

The independently built `helper-root-skip` uses one batch-owning publication helper,
lazy departing sources and completion work only when needed, skipping the aliased
root source. It excludes iterative builder changes. Focused 202 core/34 React and
production cache/pending gates pass; minimal gzip is 86,196 (+231 baseline,
+8 no-linear). Its two-block remount point is −2.28% versus baseline, but block
deltas are +7.05% and −10.79%; direct helper/no-linear is +16.77% then −16.07%.
Departure render is 24.26% and 31.18% above simultaneous no-linear, with much
smaller task differences. These are directional, order-sensitive screens, not
proof of benefit. One unpaired scale screen is 2.17370 ms per iteration, close to
prior no-linear screens. The helper remains unselected; live runtime is no-linear.

The separate production public builder fixture excludes React, navigation,
source publication and destination allocation from its interval. Identical inputs
were built on exact baseline/PR/no-linear/iterative sources. Every batch calls
`buildLocation` exactly 1,000 times; preflight checks all outputs, including
`?page=0` validation defaults. Warm controls reuse 1,000 of 1,000 public results
in every arm. Eight Williams-balanced blocks rotate arm position/predecessor and
case order; 24 warmups and 48 timed batches per arm/case/block use the same legacy
mode option, without candidate-only positional arguments.

| Case (ms per 1,000 calls) | Baseline |     PR | No-linear | Iterative |
| ------------------------- | -------: | -----: | --------: | --------: |
| Fresh canonical build     |   0.7094 | 0.6560 |    0.7292 |    0.6076 |
| Warm cached result        |   0.0568 | 0.0516 |    0.0734 |    0.0729 |
| Fresh validated build     |   1.0456 | 1.0685 |    1.0732 |    1.0781 |

Fresh iterative/no-linear delta is −18.19% [95% −34.20%, +1.71%]; no-linear/baseline
is +2.64% [−12.00%, +19.71%]. Validated iterative/no-linear is +0.29%
[−11.03%, +13.06%]. No cold-builder effect is confirmed. Warm no-linear/baseline
is +28.99% [+8.57%, +53.25%], but 146–208 of 384 warm samples per arm are timer
resolution zeros. The absolute mean difference is 0.0166 ms per 1,000 calls;
that alone cannot explain roughly 0.5 ms dense remount cost. Results exclude
owned-spec allocation and React work, so they neither prove nor dismiss those
mechanisms. Raw/summary data and input hashes are
`artifacts/pr8587-optimization/build-location-paired{,-summary}.json` and
`build-location-fixture-sha256.json`; each arm also retains its emitted binary.
No additional runtime variant has been selected on this diagnostic alone.

### Preregistered params materialization screen

Before execution, the final isolated screen is fixed to eight alternating pairs:
baseline→`params-materialization` on even pairs, candidate→baseline on odd pairs.
The candidate is exactly no-linear plus the params materialization patch; no
iterative builder, shared helper, or later live Link dependency change is included.
Each arm/pair retains the original old-input main/pending fixture, 12 warmup
navigations, 24 untraced and 32 traced navigations. It is compared against exact
original baseline, not a favorable prior run. Primary endpoint is **untraced
remount click→onRendered**. Per-pair direct ratios, ordering and the paired 95%
interval will be reported; departure complete-task timing is separate.

The desirable practical remount band is ±2%. An interval including zero is not
proof of equivalence; intervals wider than that band remain unresolved, with any
confirmed improvement/regression stated separately. No opportunistic run extension
or new composition will follow a failed or unresolved screen. The live no-linear
prototype plus the stable-router dependency removal remains unaccepted until an
architecture addresses both requested regressions. Full validation/matrix commands
will be prepared but not executed before source selection.

## Source identity and bundle attribution

The nine runtime source inputs are identified in
`artifacts/consolidated/source-sha256.json` (with preparation) and
`artifacts/no-preparation/source-sha256.json` (without preparation), with complete
production diffs alongside. Both consolidate router/source context and
branch before server reactive setup; the public server provider works before
history is configured. Preparation removal restores the baseline pathname
algorithm and direct cached-location values while retaining captured source,
configuration invalidation and cache ownership correctness.

| React minimal production bundle                    | Gzip bytes | Baseline delta | Initial delta | Raw delta | Brotli delta |
| -------------------------------------------------- | ---------: | -------------: | ------------: | --------: | -----------: |
| Baseline                                           |      85965 |              0 |             0 |         0 |            0 |
| Previous separate context prototype                |      86187 |           +222 |          +222 |      +834 |         +281 |
| Corrected consolidated context with preparation    |      86235 |           +270 |          +269 |      +904 |         +333 |
| Corrected consolidated context without preparation |      86174 |           +209 |          +206 |      +777 |         +194 |

Removing preparation saves 61 bytes gzip. Results use the official runner,
identical `react-router.minimal` scenario and package rebuilds. Raw metrics:
`artifacts/consolidated/bundle-minimal.json`,
`artifacts/no-preparation/bundle-minimal.json`, and `artifacts/bundle-baseline.json`.
Full final matrix remains pending.

## Correctness gates

The no-preparation candidate passes 123 focused core tests across four suites
and 17 React tests across four suites. The core cases cover location building,
search middleware, masks, source snapshot and cache ownership; React covers
departing/staying sources, redirect/supersession, intent
preload, SSR and public useRouter identity/null behavior. Logs are in
`artifacts/no-preparation/{core,react}.log`.

The SSR-before-history regression failed on initial consolidation and passed
on exact baseline; corrected consolidation passes it. Red/green evidence is
retained under `artifacts/consolidated/`.

A pending-navigation browser fixture holds the destination loader while ancestor
and retained leaf Links inherit changed search and hash. Both anchors preserve
identity and show current href/active attributes by the first prequeued timer.
A MutationObserver mark proves both DOM updates happen before the click's
enclosing Chromium renderer task ends, including its microtasks. All three
production arms pass; raw evidence is `artifacts/pending-urgency.json`. This is
a behavioral gate, not an effect-size estimate.

## Paired browser performance

The twelve-block comparison confirms the departing-Link gain and a remount
regression in both consolidated arms. Removing preparation does not resolve
that regression. Each direction has 144 untraced render samples and 192 traced
task samples per arm; twelve paired block means are the independent comparison
units. All atRender row href/active states equal settled states. Raw samples:
`artifacts/consolidation-narrow.json`; summary:
`artifacts/consolidation-narrow-summary.json`.

| Direction / metric | Baseline mean ms | Full preparation paired delta (95% interval) | No preparation paired delta (95% interval) |
| ------------------ | ---------------: | -------------------------------------------: | -----------------------------------------: |
| Departure task     |            4.838 |                        -56.7% [-59.4, -53.8] |                      -57.8% [-61.2, -54.1] |
| Departure render   |            5.145 |                        -59.5% [-63.0, -55.7] |                      -60.6% [-64.5, -56.3] |
| Remount task       |            5.360 |                         +11.2% [+4.2, +18.5] |                       +12.1% [+5.8, +18.9] |
| Remount render     |            5.462 |                         +10.9% [+3.5, +18.7] |                       +11.5% [+3.3, +20.4] |

Both candidates fail the measured no-regression gate. Consolidating the
context into a tuple does not validate the original mount-cost hypothesis.
Preparation removal is retained for its 61-byte saving with no lost measured
complete-task benefit. The next isolated experiment changes the consolidated
context representation from tuple to object while preserving source ownership
and lifecycle. Broad validation remains paused until a candidate passes the
performance gate. Identical production
harness, warmup, click mechanics and Chromium trace categories are used in every
arm. Untimed preflight validates every one of the 1000 hrefs and active states,
route content, retained node identities and updater counts before timed samples.
Departure and return/mount directions are reported separately. Heavy builds and
tests stop during browser timing.

Timing definitions match phase one: synchronous `dispatchMs`, actual
click-to-enclosing-task-end `taskMs` from Chromium tracing, and public
click-to-`onRendered` `renderMs`. Timer opportunity includes queue delay and is
not a precise yield measurement; rAF is not treated as proof of paint. Trace and
untraced samples remain separate. Paired confidence intervals use log ratios
of block means and Student t across alternating blocks.

## Remaining validation

After candidate selection: affected core/React/Solid/Vue unit, type and lint
checks, relevant production browser e2e, existing links/mixed/mount/nested-params
navigation benchmarks, all bundle scenarios, and final source identity/diff
checks. Five independent coverage reviews are coordinated by the architect.

## Object representation attribution

The object-only context experiment preserves the same source identity,
lifecycle, public router identity and SSR behavior. It passes the same 17 focused
React tests and exact-task pending urgency gate, but adds 16 gzip bytes.

A separate twelve-block baseline/tuple/object comparison uses the identical
frozen application harness. Object departure task improves 62.1% (95% interval
[-64.6, -59.4]) and render improves 62.2% [-65.4, -58.8]. Object remount task
regresses 6.7% [+2.7, +10.9] and render regresses 11.1% [+5.7, +16.7]. Tuple
control remount render also regresses 8.2% [+4.5, +12.1], while task delta is
unresolved at +0.6% [-1.9, +3.1]. This variability reinforces keeping trace
and untraced render measurements separate.

Object property reads do not solve the mount regression; the extra 16 bytes
have no demonstrated benefit. The next step is profiling mount work before
another architectural experiment. Raw evidence and exact source identity are
under `artifacts/object-context/`. Broad validation remains paused.

## Mount profiling and exact work counts

Saved baseline and `tuple209` production bundles were profiled without rebuilding:
two reversed-order blocks, 24 warm-up navigations and 80 profiled navigations
per block, for 80 mount intervals per arm. CDP CPU sampling interval is 100 us;
matching Chromium traces identify click marks and first task boundaries. Full
click-to-render intervals reconstruct each click mark plus the sample's public
render duration; tiny pre-mark setup makes this approximate at sub-sample
precision. These diagnostic profiles do not replace the untraced timing result.

Profiling suppresses much of the timing gap (baseline block mean renders
3.868/3.930 ms, tuple 3.952/3.935 ms), so sampled hotspots cannot establish
causality. Inclusive sampled time per mount is 1.393→1.487 ms in useLinkProps,
0.223→0.451 ms in buildLocation and 0.634→0.705 ms in useSelector. Function
inlining and stack attribution can shift these values. GC overlaps only one
baseline interval by 0.010 ms and no candidate interval. Reconstructed work
beyond the first task averages 0.010–0.018 ms, near reconstruction precision.

Separate copies of emitted bundles were instrumented for untimed exact counts.
The instrumentation leaves originals untouched and uses the same full workload
preflight. All six mount samples per arm have identical counts:

| Mount work for 1000 row Links                             |     Baseline |    Tuple 209 |
| --------------------------------------------------------- | -----------: | -----------: |
| useLinkProps invocations                                  |         1000 |         1000 |
| Selector runs                                             |         1000 |         1000 |
| buildLocation calls / full canonical builds               |  1000 / 1000 |  1000 / 1000 |
| Complete-location cache hits                              |            0 |            0 |
| Subscriptions / unsubscriptions / notify callbacks        | 1000 / 0 / 0 | 1000 / 0 / 0 |
| Snapshot reads                                            |         2000 |         2000 |
| Source equals latestLocation and global location snapshot |         1000 |         1000 |

Counts at public onRendered equal counts after timer/frame settling, with no
extra mount update. Including the control Link and route hooks, totals also
match: 1001 Link invocations, 1003 builder calls, one complete-cache hit and
1008 context reads. The mount regression is not explained by duplicate work,
stale mount snapshots or extra subscription count.

Departure counters demonstrate the removed work directly: baseline notifies
1000 row subscriptions, runs 1000 selectors/builders and renders 500 row Links;
`tuple209` performs zero of each before departure completion, then unsubscribes
all 1000. Raw profiles, exact counts and reproducible diagnostic scripts are in
`artifacts/mount-attribution/`.

## Builder correctness hunk attribution

An isolated arm starts with exact baseline bindings, stores and load pipeline,
then applies only three buildLocation hunks: captured source, cache eligibility
and final cache ownership guard. It excludes source rewrite propagation. Its
source hashes and diff are under `artifacts/correctness-only-builder/`; the
isolated source tree was restored after freezing the production bundle.

Six paired alternating blocks compare baseline, correctness-only builder and
`tuple209`, with strict preflight and matching trace/block validation. The primary
mount gate is untraced full click-to-render:

| Arm                      | Mount render mean ms | Paired delta / 95% interval | Paired block deltas                     |
| ------------------------ | -------------------: | --------------------------- | --------------------------------------- |
| Baseline                 |                4.728 | 0%                          | —                                       |
| Builder correctness only |                5.142 | +8.6% [+1.6, +15.9]         | +1.8, +8.2, +13.7, +13.6, +15.5, -0.5   |
| Tuple 209                |                5.543 | +17.4% [+9.8, +25.6]        | +14.5, +31.4, +15.3, +13.8, +21.2, +9.7 |

Builder-only departure render is unresolved (-2.3% [-7.5, +3.2]); `tuple209`
departure improves 64.4% [-67.9, -60.5]. Mount task trace for builder-only is
unresolved (+0.5% [-11.3, +13.7]), while tuple task increases 20.0% with a wide
interval [+2.3, +40.8]. Task variability does not invalidate the repeated
untraced render cost. Raw six-block evidence is retained as
`artifacts/correctness-only-builder/attribution{,-summary}.json`.

The measured builder cost justifies the next isolated diagnostic: pass the
captured source as an explicit inner build parameter rather than a closure
slot, preserving capture and cache correctness. No other architecture or
algorithm is changed; broad validation remains paused.

## Explicit source parameter diagnostic — rejected

This arm only passes the captured source into the inner build function at its
three call sites, removing a closure slot. It passes 123 core and 17 React
tests and exact-task pending urgency. Six paired blocks find no improvement:
mount render is +12.0% versus baseline (95% [-1.2, +27.0]), while simultaneous
`tuple209` control is +2.4% [-4.6, +9.9]. The direct parameter-versus-tuple paired
comparison is +9.4% [+0.7, +19.0], with block deltas +16.3, +5.5, -0.4, +17.6,
+18.4, +1.0. Departing render/task gains remain around 63%. Task metrics remain
unresolved and do not justify ignoring render cost.

The diagnostic is rejected; minimal bundle work is skipped for this failed
performance arm. Source identity, exact diff, correctness logs and raw/summary
results are in `artifacts/parameter-source/`. Next attribution changes only
cache lookup eligibility while retaining source capture and cache ownership.

## Cache lookup and first-mount guards — rejected

Restoring baseline cache lookup eligibility while retaining insertion ownership
adds no demonstrated benefit. Six paired blocks show mount render +8.1% versus
baseline [95% +0.2, +16.6]; direct lookup-versus-tuple delta is +6.5%
[-6.6, +21.4]. Focused 123 core/17 React tests and pending urgency pass. Evidence
is in `artifacts/cache-lookup/`.

Skipping stable-value normalization comparisons on first mount also adds no
demonstrated benefit: +7.7% mount render versus baseline [+1.9, +13.8], compared
with simultaneous tuple control +8.1% [+2.1, +14.4]. Direct guard-versus-tuple
delta is -0.4% [-8.8, +8.8]. Guard block deltas versus tuple are +9.8, +8.5,
-0.8, -0.1, -5.7, -12.1. It passes 124 core/23 React tests including selector
rerender coverage and fresh production declaration/browser builds. An initial
readonly-generic comparison type error was fixed before actual browser timing;
red/green logs are preserved. Evidence is in `artifacts/mount-guard/`.

Both diagnostics are rejected and no minimal bundle runs are spent on failed
performance arms. Exact `tuple209` is restored for the existing React navigation
screen: links, mixed navigation, cold router mount and deep nested parameters.
This broad screen tests whether dense 1000-Link remount cost generalizes to
existing mount/deep workloads before another architectural change.

A seventh public core regression now proves an href parseSearch callback can
change real history before location construction finishes. Baseline incorrectly
inherits changed state instead of the original source; tuple source capture
passes. Raw baseline-red/current-green logs are retained in
`artifacts/mount-guard/href-{baseline-red,candidate-green}.log`.

## Existing React navigation screen

Exact baseline and `tuple209` run identical existing production apps through
`@benchmarks/client-nav:test:perf:react`, selecting four absolute benchmark file
paths with one worker and no file parallelism. Each case uses its existing
10-second calibration and warm-up. Build dependencies include fresh package
and scenario builds. One baseline→candidate pair and one candidate→baseline
pair repeat the direction; per-process RME does not provide an across-pair
confidence interval. No hydration bench is selected.

| Workload                  | First pair mean delta | Reverse pair delta | Geometric paired delta |
| ------------------------- | --------------------: | -----------------: | ---------------------: |
| Mixed navigation          |                +2.67% |             +1.57% |                 +2.12% |
| Mounted Links             |                +3.63% |             +2.83% |                 +3.23% |
| Cold router mount         |                +3.41% |             +0.74% |                 +2.07% |
| Eight-level nested params |                +6.36% |             +6.73% |                 +6.54% |

The deep nesting / match-subscriber workload repeats the strongest broad cost.
Its root includes six Links; the eight dynamic levels contain none. The mean
is per existing 18-navigation benchmark iteration, not per single navigation.
All workloads
complete their built-in public behavior assertions. Complete mean/hz/RME/sample
count/p 99/p 999 data and logs are in `artifacts/navigation-screen/`.

Before the next consolidation, six public match-provider CSR/SSR tests pass
both exact baseline and `tuple209`, including new nearest/parent/child+Outlet
and explicit-from switching cases. TypeScript reference audits identify all
private match contexts and confirm useMatches is public and must retain its
export; logs are in `artifacts/context-reference-audits/`. The next experiment
unifies the match and router provider while preserving those public scopes.

## Unified match/router provider — frozen measurement

The unified arm adds route identity to the existing router/source tuple and
replaces the separate private match provider at the same shell/boundary scope.
Link and all core runtime hashes remain identical to `tuple209`. Its 11-entry
source manifest records the deleted matchContext file explicitly; exact sources,
production diff and logs are retained in `artifacts/unified-context/`.

Focused React validation passes 177 tests across 13 suites, including nearest,
parent/child, explicit-from switching, pending/error/not-found context and server
streaming. Fresh production declarations and browser builds pass. All 12 arm/case
untimed preflights validate all 1000 row href/active states, counts/content,
retained node identity, departure unmount and exact updater counts. The pending
ancestor/same-leaf probe passes baseline, tuple and unified: both retained Links
become current while the loader is held and before the enclosing click task
ends. These probe times are behavior evidence, not a timing comparison.

React minimal gzip is 86172 bytes, +207 versus exact baseline 85965 and -2 versus
`tuple209`. Initial gzip delta is +206, raw +702 and Brotli +273. This targeted result
is provisional; the mandatory full scenario matrix remains deferred until an
acceptable architecture is selected.

Six balanced browser blocks retain 72 untraced samples and 96 traced samples per
arm/direction. Comparisons below use paired block log ratios and Student t 95%
intervals. Untraced click-to-onRendered is the primary remount gate; traced
click-to-enclosing-task-end includes microtasks and is reported separately.

| Arm             |   Departure render delta |     Departure task delta |    Remount render delta |     Remount task delta |
| --------------- | -----------------------: | -----------------------: | ----------------------: | ---------------------: |
| Baseline        |    +0.00% [+0.00, +0.00] |    +0.00% [+0.00, +0.00] |   +0.00% [+0.00, +0.00] |  +0.00% [+0.00, +0.00] |
| Tuple 209       | -64.77% [-71.99, -55.70] | -62.29% [-66.93, -57.01] |  +9.92% [+4.21, +15.95] | +7.42% [+0.40, +14.94] |
| Unified context | -62.76% [-66.68, -58.38] | -60.71% [-67.69, -52.23] | +10.15% [+4.81, +15.77] | +7.33% [+0.45, +14.68] |

Unified remount render block deltas are +4.62, +6.95, +9.24, +19.44, +8.13, +13.16%.
Its mean is 6.086 ms versus baseline 5.524 ms and tuple 6.075 ms. Consolidating the
providers does not fix the dense 1000-Link remount regression. Departing gains
remain strong. Existing broader navigation workloads are next to test whether
removing a match provider reduces deep nesting/match-subscriber overhead.
Raw samples and summaries are `artifacts/unified-context/paired{,-summary}.json`.

First broad baseline→tuple→unified screen: unified remains +2.11% mixed, +7.20%
mounted Links, +1.99% cold mount, +4.77% deep nesting versus baseline. Tuple
controls are +3.52, +5.56, +3.13, +7.47% respectively. Mean units are per 10 mixed
ticks, 8 Link steps, 6 fresh-router cold mounts and 18 deep navigations. One
order provides no across-pair confidence interval; reversed order is required
before interpreting modest differences. All built-in public assertions pass.
Exact production app binaries and raw full mean/hz/RME/p 99/p 999/sample-count
records are preserved under unified-context/navigation snapshots/artifacts.

Six-block retained controls validate all href/active/updater behavior but show
no established render or complete-task benefit or regression: every 95%
interval includes zero. Exact paired block stats are retained in
`artifacts/unified-context/retained{,-summary}.json`.

| Workload            | Arm             | Render delta versus baseline | Task delta versus baseline |
| ------------------- | --------------- | ---------------------------: | -------------------------: |
| fixed-path-updaters | no-preparation  |      -1.49% [-14.28, +13.21] |      +0.70% [-7.36, +9.46] |
| fixed-path-updaters | unified-context |      -2.02% [-13.00, +10.34] |     -1.48% [-10.56, +8.52] |
| retained-fixed      | no-preparation  |      +0.00% [-10.65, +11.93] |     -9.55% [-21.89, +4.74] |
| retained-fixed      | unified-context |       +4.57% [-8.39, +19.37] |     +6.23% [-2.23, +15.42] |
| retained-updaters   | no-preparation  |       -2.67% [-13.67, +9.74] |     -5.05% [-15.30, +6.45] |
| retained-updaters   | unified-context |       -3.30% [-10.30, +4.24] |      +0.83% [-7.53, +9.95] |

## Supported root provider revision

Following the user's unsupported-nested-router correction, the root provider
uses its own router/source only and performs no parent context read. Match
triples remain unchanged. This arm differs from `unified207` only in
RouterProvider.tsx. Unsupported tests/fixture were removed; ordinary nearest,
parent/child/Outlet selections remain covered. The historical replacement-only
assertion was later removed under the stable-router contract.

The revision passes 175 focused React tests/13 suites with no type errors and
fresh production declarations/browser builds. Supported baseline public
provider/hook tests pass 9/10; the single red test is the intended departing
intent-preload fix (baseline advances displayed href while the loader is held).
All 12 browser arm/case preflights and exact-task pending urgency pass. The 6
production harness input hashes match exact baseline/current.

Minimal React gzip is 86159, +194 versus baseline 85965; initial +195, raw +674,
Brotli +189. Sources, 11-entry manifest (including deleted matchContext),
harness hashes, public baseline-red/candidate-green logs, bundle and browser
proof are retained in `artifacts/unified-root/`.

Six balanced blocks with 72 untraced/96 traced samples per arm/direction:

| Arm            |   Departure render delta |     Departure task delta |    Remount render delta |     Remount task delta |
| -------------- | -----------------------: | -----------------------: | ----------------------: | ---------------------: |
| baseline       |    +0.00% [+0.00, +0.00] |    +0.00% [+0.00, +0.00] |   +0.00% [+0.00, +0.00] |  +0.00% [+0.00, +0.00] |
| no-preparation | -62.28% [-69.58, -53.22] | -61.60% [-64.78, -58.14] | +11.58% [+3.21, +20.62] | +7.77% [-2.51, +19.14] |
| unified-root   | -62.75% [-68.62, -55.77] | -62.40% [-64.28, -60.41] | +10.85% [+3.20, +19.07] | +5.72% [-3.45, +15.76] |

Remount render remains slower: baseline 5.606 ms, tuple 6.244 ms, supported unified
root 6.207 ms. Its paired block deltas are +14.43, +8.93, +5.91, 0, +19.75, +17.36%.
The complete-task mount interval is unresolved; this does not negate the
confirmed untraced render cost. Strong departure gains remain. Root-provider
simplification does not repair the supported single-router dense remount gate.
No further timing is run on this revision. Full package/type/lint/e2e and full
bundle-matrix finalization remain pending an acceptable final architecture,
not claimed complete for this rejected performance arm.

## Reusable location worker — rejected

Only router.ts changed: the nested location-construction body moved into a
reusable private prototype method. 124 core/23 React focused tests and fresh
production declarations/browser builds pass, as do exact-task pending urgency
and all 12 arm/case 1000 Link public DOM preflights. No algorithm or cache
semantics changed. Source/diff/proof are in `artifacts/worker/`.

Six balanced blocks retain the remount regression: render +7.86% versus baseline
[95% +3.39, +12.53], baseline 5.550 ms→worker 5.985 ms; simultaneous `root194` +6.20%
[+1.27, +11.36]. Direct worker/root delta +1.57% [-6.23, +10.01] shows no established
improvement. Departure render -60.24% [-65.48, -54.20], task -60.19% [-65.46, -54.11].
The worker is rejected and minimal bundle work skipped for this failed arm.
Exact `root194` 11-state source manifest was restored before the final isolated
source-retirement shape trial (delete→undefined, no new state).

Final package/type/lint/export checks exist for core, React, Solid, Vue. Relevant
production Chromium e2e targets are their three basic apps (app.spec.ts and
params.spec.ts). These 16 package checks, 3 e2e targets, full bundle matrix and
mandatory review/test-only commit/stash/baseline/pop workflow remain explicitly
pending until architecture performance clears the gate. This phase is bounded
React prototype evaluation, not production acceptance.

## Final source-retirement shape trial — rejected

Only source retirement changes from deleting MatchStore.location to assigning
undefined. This is an allocation/shape hypothesis, not a proven dictionary-mode
claim. 124 core/25 React focused tests, fresh production declarations, exact-task
pending urgency and all 12 public 1000 Link preflights pass. Both new source-path
cases pass candidate; pending fallback reproduces on baseline (/b/return?visit=3
instead of retained /b/next?visit=2), while input rewrite already passes baseline
and is coverage rather than a new baseline bug.

Six balanced blocks still show remount render +10.55% [95% +4.58, +16.86] versus
baseline 5.532 ms→shape 6.122 ms. Simultaneous `root194` is +12.53% [+6.67, +18.72];
direct shape/root -1.76% [-10.46, +7.77] demonstrates no improvement. Departure
render -64.49%, task -62.76% retain the intended gain. Exact source/diff/proof/raw
data are in `artifacts/shape-retirement/`. The trial is rejected; size work is
skipped. All 11 runtime states, including the private matchContext deletion,
restore exactly to `root194` manifest. No further builder/context/shape trials
are planned in this bounded prototype phase.

## Final zero-Link control and bounded verdict

The independent no-links Vite config builds only no-links.html into
dist-no-links; default main+pending build inputs remain byte-identical. Baseline
and exact restored `root194` run identical retained eight-level dynamic routes
and departure/remount cycles. Every level reads params and route context:
16 route-hook consumers, without claiming all Match/Outlet subscriptions were
counted. The button calls public router.navigate. Untimed preflight validates
all params/context trails, retained DOM identity and departure unmount; a
MutationObserver plus every sample confirms zero anchors, including transient
insertions. Separate production build logs and raw/summary records are retained
in `artifacts/no-links/`.

Six balanced blocks use 144 untraced/192 traced retained samples per arm and
72 untraced/96 traced per departure or remount direction. Means below are per
single button navigation; task traces include microtasks to the enclosing task
end. No builds run during timed blocks.

| Zero-Link case      | Root 194 render mean ms | Render delta (95% interval) | Task delta (95% interval) |
| ------------------- | ----------------------: | --------------------------: | ------------------------: |
| departing:departure |                   1.251 |     -6.85% [-26.02, +17.30] |  -10.40% [-36.69, +26.82] |
| departing:mount     |                   1.267 |     -7.17% [-23.96, +13.32] |   -8.19% [-26.37, +14.49] |
| retained:all        |                   1.301 |      +7.13% [-6.60, +22.88] |  -11.49% [-33.82, +18.36] |

All intervals include zero. This control proves valid zero-Link behavior but
provides no established performance win or regression; it cannot rule out
moderate cost. No additional timing is used to narrow that result in this phase.

Final supported runtime is exact `root194` (11-state manifest including deleted
matchContext), +194 React-minimal gzip bytes. The final focused run passes
25 React tests including both new source cases; earlier 175-test supported
context/Link/boundary/SSR suite and 124 core source/cache/mask tests are preserved.
The prototype strongly validates removing urgent work for departing Links, but
its repeated dense remount render regression fails the overall acceptance gate.
Rejected trial sources/binaries remain for review; worker and retirement-shape
runtime changes are reverted. Full production checks and mandatory full bundle
workflow remain pending; this is a bounded prototype, not a final optimization.

## Params materialization — unresolved, rejected

This isolated arm changes only literal params materialization on exact `no-linear`; function updater writes keep the existing owned-target setter/descriptor behavior. The two new public semantics guards pass baseline and `no-linear`; the candidate passes 204 core tests across 8 files and 34 React tests across 7 files. All four production cache/callback gates and fresh baseline/candidate pending urgency gates pass. The source manifest has 12 runtime states; router.ts SHA-256 is `0a740784655716c96a4def5a7a301587c472a39f2bb0c7d8fb4025a05f90b148`.

The preregistered eight alternating pairs used the unchanged old main/pending input, 12 warmups, 24 untraced and 32 traced samples per arm/pair. Each direction therefore has 96 untraced and 128 traced samples per arm. No builds or tests ran during timing. The primary endpoint remains untraced click→onRendered remount; complete click-task duration is reported separately. No opportunistic extension was run.

| Direction | Metric        | Baseline mean ms | Params mean ms | Paired delta, 95% interval |
| --------- | ------------- | ---------------: | -------------: | -------------------------: |
| mount     | render        |           6.0219 |         6.1677 |     +2.31% [-6.87, +12.38] |
| mount     | complete task |           5.9224 |         5.9908 |      +1.10% [-3.85, +6.32] |
| departure | render        |           5.3469 |         2.0458 |   -61.99% [-66.13, -57.34] |
| departure | complete task |           5.0556 |         1.9684 |   -61.11% [-64.27, -57.66] |

| Pair | Arm order         | Remount render delta |
| ---- | ----------------- | -------------------: |
| 1    | baseline → params |               -3.95% |
| 2    | params → baseline |              +18.42% |
| 3    | baseline → params |               -3.67% |
| 4    | params → baseline |              -16.73% |
| 5    | baseline → params |               +9.35% |
| 6    | params → baseline |              +14.03% |
| 7    | baseline → params |               +4.78% |
| 8    | params → baseline |               +0.68% |

The remount interval is wider than the desired ±2% practical band. Inclusion of zero does not establish equivalence or a repaired remount regression. This params arm is rejected as unresolved; no bundle measurement or composition is justified by these results. The shared helper and iterative builder remain unselected. Raw samples, summaries, source manifests, browser binaries and gate/test logs are retained in `artifacts/pr8587-optimization/params-materialization/`.

## Preregistered intent-handler-elision screen

This independent arm uses exact `no-linear` plus the required stable-router destination memo cleanup and only elides unused intent event assembly. Params materialization, the iterative builder and the shared publication helper are excluded. The primary endpoint is untraced remount click→onRendered against original baseline. Eight alternating arm pairs use 32 warmup navigations, 120 untraced navigations and 32 traced navigations per arm/pair: 60 remount observations per untraced block and 16 per traced block. This fixed stronger sample plan is declared before any timing for this arm. All pair order and deltas, paired 95% intervals, and departure complete-task duration will be retained. A confidence interval including zero is not equivalence; ±2% remains the desired practical remount band. No opportunistic extension or repeat follows this run. Correctness and equivalent production outputs precede timing.

Handler validation before timing: the original expanded run passed 218 cases and failed five legacy assertions on departed anchor references. Exact `no-linear` reproduced all five; original baseline passed all 17 matching cases. The reviewed test-only corrections re-query the mounted destination Posts anchor after asserting the old anchor is detached, and place the three splat Links in the retained root layout. They preserve active/aria/href/params/trailing-slash/navigation checks on meaningful mounted UI. Corrected baseline Link/events pass 166/166; the handler candidate passes 223/223 across 11 affected React suites. The unchanged core source matches its validated `no-linear` manifest, so its focused result is reused. Original red/green logs are retained alongside corrected logs. Four production cache/callback gates and fresh exact-task pending urgency pass. Five emitted default fixture input hashes match the frozen baseline; project.json only adds independent entry targets and its default build command is unchanged.

## Handler-elision primary result and final coverage declaration

Eight fixed alternating pairs (32 warmup, 120 untraced, 32 traced navigations per arm) yield remount render baseline 6.2350 ms→candidate 5.7554 ms, −7.69% [95% −12.00, −3.16]. Pair deltas are −6.25, −8.52, −3.04, −12.37, −0.21, −15.11, −3.12, −11.80%; baseline is first on even zero-based pairs. Remount complete-task is −6.09% [−12.51, +0.79], unresolved. Departure render is −62.26% [−63.38, −61.11]; departure complete-task is −59.80% [−62.93, −56.41]. Minimal React gzip is 86,205 bytes (+240 baseline, +46 PR); initial +238, raw +593, Brotli +237. This establishes the composed primary improvement; it does not attribute all gains to presentation sources or prove all architectural mount overhead removed.

Final coverage is declared before timing: rebuild exact baseline/final with identical latest main/pending input plus the query-selected preload layouts. Disabled, enabled and 50/50 mixed dense departure/remount each use eight alternating pairs with 32 warmup/120 untraced/32 traced, rotating layout order per pair. Disabled nonroot/deep fixed/updater cases form a 2×2 matrix of one/eight retained sources and fixed/source-dependent destination at exactly 1000 rows; each uses eight alternating pairs, rotated case order, 12 warmup/24 untraced/32 traced. All-row output/active/identity preflight must pass. New updater counts are diagnostic against baseline, including atRender/settled equality, rather than an invented count contract. No opportunistic extensions follow these runs; wide intervals remain unresolved. The separate pending gate proves root and one nonroot href/active urgency inside the click task before loader release, not eight-source pending urgency.

## With-elision composition: Exact final production gates

The final 12-state runtime manifest matches the selected composition. Compared with the primary handler screen, runtime changes are only the required const/let declaration split in `router.navigate` and the event cancellation explanation comment. Root alias and context/source consolidation have dependent-group evidence, not an independently established remount benefit; handler elision is a separate mechanism whose benefit depends on preload mode.

Before final timing, the new eight-source retained fixture exposed an unreachable terminal id-only pathless route in the original baseline. Replacing only that terminal option with public index `path: '/'` makes the intended eight nonroot row-owner matches reachable without adding a ninth route. No timed samples were taken from the invalid fixture. Both arms were rebuilt from identical corrected inputs; `src/main.tsx` SHA-256 is `df325b9024e4ba335eb7551713a3a0868eb775907447d53df15cbf8167d7cc44`. All 20 untimed layout/retained preflights now pass, including all 1000 hrefs, active states and anchor identities. One-source and eight-source updater cases both record 1000 calls at render and 1000 settled in baseline and final, without additional completion calls.

Fresh blocked-loader gates prove retained ancestor and leaf Links update inside the enclosing click task before loader release in both arms. Final production destination gates preserve static-result reuse and rebuild for search validation, middleware, and a stringifier added through public route.update after the rendered destination was cached.

## With-elision composition: Final preload-layout result

Eight fixed alternating pairs use the identical corrected final fixture; each mode has 480 untraced and 128 traced samples per direction and arm. The primary metric is untraced click→onRendered; task duration is mark→enclosing Chromium task end, including microtasks. Builds and tests were stopped during timing.

| Preload mode | Direction | Baseline render ms | Final render ms | Render paired delta (95% interval) | Baseline task ms | Final task ms | Task paired delta (95% interval) |
| ------------ | --------- | -----------------: | --------------: | ---------------------------------: | ---------------: | ------------: | -------------------------------: |
| disabled     | mount     |             5.4546 |          5.5938 |              +2.52% [-1.03, +6.19] |           5.5270 |        5.4690 |            -1.14% [-4.48, +2.31] |
| disabled     | departure |             4.6338 |          1.6519 |           -64.37% [-65.69, -63.00] |           4.7388 |        1.6878 |         -64.44% [-66.10, -62.70] |
| intent       | mount     |             5.6187 |          6.0806 |             +8.15% [+0.60, +16.26] |           5.5738 |        5.9238 |           +6.20% [+1.17, +11.48] |
| intent       | departure |             4.8590 |          1.7281 |           -64.50% [-66.75, -62.09] |           5.3303 |        2.1740 |         -59.24% [-60.69, -57.74] |
| mixed        | mount     |             5.7058 |          5.6975 |              -0.09% [-4.72, +4.77] |           5.5007 |        5.6609 |           +3.27% [-4.49, +11.66] |
| mixed        | departure |             4.8117 |          1.7850 |           -62.95% [-65.72, -59.95] |           4.9099 |        2.0089 |         -59.01% [-62.54, -55.14] |

The intent-mode remount regression fails the overall acceptance gate. Handler elision chiefly removes work from non-intent Links; its disabled-only compensation does not prove the source architecture remount cost is repaired. Disabled and mixed intervals do not establish equivalence within the desired ±2% practical band. Raw paired blocks/order and partitioned summaries are preserved without opportunistic extensions.

## With-elision composition: Final retained-source matrix

Eight alternating pairs rotate the four workloads at fixed 1000 row Links, with 12 warmup, 24 untraced and 32 traced navigations per arm/case/pair (192 untraced and 256 traced observations per cell/arm). Both arms use the reachable identical eight-source fixture. All row output/active/identity/topology preflights pass. Updater preflights record 1000 calls at render and 1000 settled in every block of both arms, with no late calls.

| Retained workload             | Baseline render ms | Final render ms | Render delta (95% interval) | Baseline task ms | Final task ms | Task delta (95% interval) |
| ----------------------------- | -----------------: | --------------: | --------------------------: | ---------------: | ------------: | ------------------------: |
| deep-retained-fixed:all       |             6.4302 |          6.5333 |       +1.77% [-4.77, +8.76] |           6.5944 |        6.7543 |    +2.67% [-5.75, +11.83] |
| deep-retained-updaters:all    |             7.2922 |          7.0427 |      -2.85% [-13.40, +8.99] |           7.2790 |        7.2073 |     -0.73% [-6.66, +5.59] |
| nonroot-retained-fixed:all    |             6.3495 |          6.1161 |      -4.06% [-10.97, +3.38] |           6.6295 |        6.7914 |     +2.42% [-2.65, +7.76] |
| nonroot-retained-updaters:all |             6.8448 |          6.6854 |       -1.95% [-8.91, +5.54] |           7.0426 |        6.6744 |    -5.72% [-13.00, +2.17] |

All intervals include zero and extend beyond the desired ±2% practical band. These fixed runs establish valid retained behavior without an established penalty or benefit; they do not prove equivalence. The pending fixture proves urgency for root plus one nonroot source, not eight-source pending urgency. Fixed DOM attributes cannot measure equality-suppressed notifications; the no-linear source path has no held sources or completion reaction when all matches stay.

## With-elision composition: Final affected-package and app validation

All 16 unit/type/eslint/export-build checks for router-core, React, Solid and Vue pass through serial Nx targets. Full unit results are core 3636 passed/4 expected fail/3 skipped; React 1231 passed/1 skipped; Solid client 972 passed/1 skipped plus server 75 passed; Vue 980 passed/1 skipped plus 140 type cases. React and Solid type matrices cover all six configured TypeScript versions. All four package export checks pass publint and attw.

The initial package run found test typing/style failures, corrected in the affected fixtures and retried only where needed. The source-capture regression now uses the supported typed public router.navigate href API; its original-baseline failure is retained. Runtime lint correction splits const to/reloadDocument from mutable href/publicHref in the same getter-read order. The final runtime manifest remains unchanged after validation.

Production Chromium e2e passes 74 cases: React basic 24, React match-params 4, Solid basic 24, Vue file-SFC basic 22. Logs preserve target resolution, package retries, public regression red/green evidence and app builds. Hydration and memory remain outside the requested scope. A generated patch changeset describes departing/retained Link behavior, owned destinations, live validation/callbacks, invocation controls and user-event cancellation without claiming performance success.

## With-elision composition: Final existing React navigation screen

The unchanged production workloads compare original baseline, PR `root194`, and exact final composition in forward baseline→PR→final then reversed final→PR→baseline order. Each arm/window uses the existing ten-second workload setting and fresh scenario lifecycle. Two windows provide directional confirmation; no across-window confidence interval or equivalence claim is justified. Within-window RME, sample counts, variance and p99/p999 are retained in raw Vitest JSON, not substituted for independent block uncertainty.

Means are milliseconds per workload iteration: mixed 10 ticks, links 8 steps, mount 6 fresh mounts, nested-params 18 navigations, route-scale 27 clicks, history 8 click steps plus 10 history traversals, rewrites 18 clicks, control-flow 14 clicks including redirects. Deep nesting has six root Links; it is not a whole-app zero-Link control.

| Workload         | Baseline mean ms | PR mean ms | Final mean ms | Final/baseline forward, reverse | Final/PR forward, reverse |
| ---------------- | ---------------: | ---------: | ------------: | ------------------------------: | ------------------------: |
| route-tree-scale |           2.2253 |     2.2496 |        2.1724 |                  -2.76%, -2.01% |            -4.44%, -2.43% |
| mixed            |           1.7645 |     1.8420 |        1.7288 |                  -3.72%, -0.31% |            -6.50%, -5.80% |
| history          |           1.6224 |     1.6488 |        1.6268 |                  -1.93%, +2.47% |            -0.15%, -2.45% |
| rewrites         |           1.6394 |     1.5995 |        1.5634 |                  -6.06%, -3.17% |            -2.48%, -2.04% |
| control-flow     |           3.7180 |     3.6939 |        3.6728 |                  -1.42%, -1.01% |            -1.09%, -0.04% |
| links            |           1.7023 |     1.6846 |        1.6103 |                  -6.21%, -4.59% |            -4.27%, -4.55% |
| mount            |           1.3187 |     1.3077 |        1.2976 |                  -1.69%, -1.51% |            -0.89%, -0.66% |
| nested-params    |           4.4995 |     4.3730 |        4.3262 |                  -5.85%, -1.72% |            -1.55%, -0.58% |

These broader directional gains do not supersede the confirmed all-intent dense remount failure. No clean workload was repeated beyond the declared reversed comparison. The mixed project selector initially failed shell parsing before any measurement; its setup error is retained and the quoted selector resumed completed windows without rerunning them.

## With-elision composition: Exact final full bundle matrix

The complete identical 18-scenario workflow rebuilds workspace packages through Nx for the original baseline and exact final source composition. No scenario filter or stale-package bypass is used. The final const/let style split and cancellation comment increase React minimal gzip by 2 bytes relative to the pre-attribution primary candidate: 86,207 bytes, +242 original baseline/+48 PR. The split is required style and preserves getter-read order; the comment explains cancellation semantics.

| Scenario                         | Baseline gzip | Final gzip | Gzip delta | Initial gzip delta | Raw delta | Brotli delta |
| -------------------------------- | ------------: | ---------: | ---------: | -----------------: | --------: | -----------: |
| react-router.minimal             |        85,965 |     86,207 |       +242 |               +242 |      +597 |         +271 |
| react-router.full                |        89,608 |     89,880 |       +272 |               +272 |      +632 |         +264 |
| solid-router.minimal             |        34,339 |     34,556 |       +217 |               +213 |      +636 |         +124 |
| solid-router.full                |        39,345 |     39,553 |       +208 |               +207 |      +631 |         +159 |
| vue-router.minimal               |        50,615 |     50,825 |       +210 |               +211 |      +636 |         +246 |
| vue-router.full                  |        56,366 |     56,572 |       +206 |               +209 |      +635 |         +241 |
| react-start.minimal              |        99,110 |     99,350 |       +240 |               +243 |      +611 |         +186 |
| react-start.query-integration    |       106,704 |    106,945 |       +241 |               +243 |      +610 |         +302 |
| react-start.deferred-hydration   |        99,847 |    100,090 |       +243 |               +240 |      +611 |         +311 |
| react-start.full                 |       102,336 |    102,599 |       +263 |               +261 |      +639 |         +145 |
| react-start.rsbuild.minimal      |       102,741 |    102,973 |       +232 |               +232 |      +818 |         +292 |
| react-start.rsbuild.minimal-iife |       103,161 |    103,393 |       +232 |               +232 |      +818 |         +155 |
| react-start.rsbuild.full         |       106,069 |    106,313 |       +244 |               +244 |      +846 |         +237 |
| solid-start.minimal              |        47,504 |     47,707 |       +203 |               +200 |      +633 |         +196 |
| solid-start.deferred-hydration   |        50,633 |     50,843 |       +210 |               +206 |      +631 |         +211 |
| solid-start.full                 |        52,704 |     52,904 |       +200 |               +198 |      +633 |         +255 |
| vue-start.minimal                |        67,052 |     67,264 |       +212 |               +214 |      +634 |         +204 |
| vue-start.full                   |        71,013 |     71,217 |       +204 |               +203 |      +638 |         +107 |

All scenario JavaScript file counts match baseline; the largest gzip change is retained explicitly in the table. Full per-file/initial metrics and logs are preserved. Deferred-hydration entries are bundle-size coverage, not hydration performance measurements. Sources are identified by the saved manifests; final metadata labels an uncommitted snapshot rather than an invented commit.

## Independent original-baseline handler hunk

This arm starts from all 12 exact original-baseline runtime states and changes only intent event assembly, preserving baseline destination/preload arguments, router memo dependencies, source contexts, stores and core. The public Link/event/state/memo suite passes 189 tests. Both arms use the exact old frozen main input (SHA-256 `483fd382d353df9317526ef1e66d656271e3dc062001d5eef53391967b78f69d`) and the fixed eight alternating pairs (32 warmup, 120 untraced, 32 traced navigations), without enabled/mixed layout additions. Minimal gzip is 86,004, +39 baseline; initial +36, raw +59, Brotli +53.

| Direction | Baseline render ms | Handler-only render ms | Render delta (95% interval) | Baseline task ms | Handler-only task ms | Task delta (95% interval) |
| --------- | -----------------: | ---------------------: | --------------------------: | ---------------: | -------------------: | ------------------------: |
| mount     |             5.3694 |                 5.4662 |       +1.70% [-5.10, +9.00] |           5.3668 |               5.2974 |     -1.25% [-6.29, +4.06] |
| departure |             4.6400 |                 4.5296 |       -2.32% [-7.59, +3.25] |           4.6788 |               4.4387 |    -5.44% [-11.82, +1.41] |

No independent timing benefit is established. Removing unused handler assembly is concrete work removal, but these intervals do not prove a net runtime win. The earlier composed disabled-only primary improvement cannot be assigned to this hunk alone, and the fresh final disabled interval did not establish equivalence. No repeat or further variant follows this result. The absence of optional no-user/non-intent handler props is intentional; supplied callbacks retain cancellation guards and selected state-prop overrides.

## With-elision composition: Exact emitted-JavaScript/source attribution

Both original and exact final minimal analysis builds preserve emitted JavaScript and hidden maps in the artifact directories. Analysis metrics match the non-analysis full workflow exactly: baseline 85,965 gzip and final 86,207. Source-map estimates refer to emitted module bytes and are diagnostic, not additive gzip attribution or runtime cost. The complete source lists, maps, full 18-scenario emitted bundles and production diffs are preserved.

| Emitted source module                   | Baseline estimated bytes | Final estimated bytes | Difference |
| --------------------------------------- | -----------------------: | --------------------: | ---------: |
| router-core/dist/esm/router.js          |                   16,331 |                16,601 |       +270 |
| router-core/dist/esm/load-client.js     |                   15,804 |                16,079 |       +275 |
| router-core/dist/esm/stores.js          |                      657 |                   737 |        +80 |
| react-router/dist/esm/link.js           |                    4,244 |                 4,109 |       -135 |
| react-router/dist/esm/Match.js          |                    2,433 |                 2,518 |        +85 |
| react-router/dist/esm/Matches.js        |                      555 |                   555 |         +0 |
| react-router/dist/esm/useMatch.js       |                      348 |                   329 |        -19 |
| react-router/dist/esm/matchContext.js   |                       58 |                     0 |        -58 |
| react-router/dist/esm/routerContext.js  |                       29 |                    29 |         +0 |
| react-router/dist/esm/RouterProvider.js |                      340 |                   389 |        +49 |
| react-router/dist/esm/useRouter.js      |                       39 |                    81 |        +42 |

The emitted-source review shows Link code shrinks while core builder/control and source-lifetime code grow; the private matchContext module disappears as expected. It does not prove cold-mount causality. Logical source/context/root groups, destination/control groups and independent handler hunk measurements are recorded separately with their interactions. The mandatory keep-only-proven-wins acceptance condition is **not satisfied**: overall intent remount regresses, broad byte budgets have outliers, and the earlier standalone handler run was inconclusive at +39 gzip bytes. That standalone retention conclusion is superseded for this composition by the direct rollback evidence below. The standalone run remains inconclusive, but the later direct rollback comparison demonstrates a benefit in this composition. The user chose to retain the hunk in the exact restored composition for 17 minimal/36 full gzip bytes; this is not a standalone original-baseline win or overall architecture acceptance.

## With-elision composition: Completion and review state

All declared measurements, full affected-package/app checks, full bundle scenarios and source/emitted attribution are complete. Frozen baseline/final browser maps contain identical main and pending source hashes, independently verifying fixture parity in the actual emitted builds. Final format and git diff --check pass; all 12 runtime states and nine shared fixture inputs still match their manifests. No full clean suite was repeated after documentation/fixture-only changes.

The measured prototype remains **unaccepted** and unchanged for review. It preserves the strong departure mechanism and directional scale improvement, but intent remount regresses, retained timing is unresolved, and full bundle outliers exceed the approximate byte budget. No further optimization, repeat or extension was attempted. Five independent coverage reviews supplied public regressions and missing mechanism coverage; the user's no-commit/no-push instruction supersedes the skill's test-only commit/stash steps, with isolated source snapshots and patches retaining exact comparisons instead.

Raw per-pair order/samples/intervals, absolute means, source manifests, production diffs, validation logs, all emitted bundles/maps and source estimates are retained under artifacts/pr8587-optimization/final and baseline-intent-handler-elision. Obsolete task-only experiment runners and known Playwright output were archived in ignored artifacts. The task-owned browser and HTTP server are closed; uncertain or unrelated processes/files were left alone. The patch changeset is present. No commits, pushes or stashes were made.

## Handler-elision removal: preregistered bounded plan

The current no-elision revision changes only Link event assembly and changeset wording versus the frozen previous with-elision snapshot. It restores the five unconditional composeHandlers assignments and the existing touch/leave closures with intent-mode guards. Current Link SHA-256 is `101c96a15f3f1cc42be33c6f0a1ef5e78da2a38f35196bcc47280f3c261459e3`; all other 11 runtime states match the previous manifest.

The paired **control is previous with-elision**, not original baseline. Both production binaries use the unchanged corrected main/pending fixture, with the same disabled, intent and 50/50 mixed modes. Six alternating arm blocks rotate mode order and use 12 warmup, 48 untraced and 32 traced navigations per arm/mode/block (144 untraced and 96 traced per departure/remount direction/arm/mode). Primary render and enclosing-task durations are separate. The fixed run retains order, block ratios and Student-t paired intervals without extensions; a wide interval remains unresolved. Existing original-baseline timings remain historical with-elision evidence. No broad eight-family reruns or optimization experiments are included.

## Handler-elision removal: affected checks and paired result

Current React unit tests pass 1231 cases with one skipped; six-version types, lint and export checks pass. React Chromium basic/params apps pass 28 cases. Unchanged shared core/Solid/Vue checks are reused, without reruns. Both frozen binaries pass all 20 output/active/identity/topology preflights, fresh pending-task urgency and current destination cache/validation/middleware/stringifier gates.

The fixed six-block comparison uses previous with-elision as its control, not original baseline. The table reports milliseconds per single navigation and paired 95% intervals; original-baseline results in preceding sections are historical with-elision evidence.

| Mode     | Direction | With-elision render ms | No-elision render ms | Render delta vs with-elision (95% interval) | With-elision task ms | No-elision task ms | Task delta vs with-elision (95% interval) |
| -------- | --------- | ---------------------: | -------------------: | ------------------------------------------: | -------------------: | -----------------: | ----------------------------------------: |
| disabled | mount     |                 5.7819 |               6.2986 |                      +8.94% [+2.00, +16.35] |               5.4743 |             6.0939 |                   +11.46% [+5.01, +18.30] |
| disabled | departure |                 1.8528 |               1.9389 |                      +3.76% [-9.57, +19.06] |               1.8399 |             1.9379 |                    +4.92% [-8.64, +20.50] |
| intent   | mount     |                 6.3514 |               6.2410 |                       -1.56% [-9.36, +6.91] |               6.0782 |             5.7128 |                    -6.01% [-14.28, +3.06] |
| intent   | departure |                 1.9687 |               2.0931 |                      +6.12% [-1.31, +14.12] |               2.3203 |             2.4291 |                    +4.98% [-5.62, +16.77] |
| mixed    | mount     |                 5.7917 |               6.1431 |                      +6.30% [-1.33, +14.52] |               5.6644 |             5.9425 |                     +4.93% [+0.61, +9.44] |
| mixed    | departure |                 1.9368 |               2.0035 |                      +3.48% [-3.28, +10.72] |               2.2466 |             2.1888 |                    -2.56% [-11.24, +6.97] |

The requested removal increases disabled-mode remount time against previous with-elision; mixed task increases while mixed render is unresolved. Intent and departure intervals remain unresolved. This does not establish current original-baseline equivalence or acceptance, and no repeat or further optimization follows. Raw arms remain explicitly labelled with-elision/no-elision; the summarizer only uses an internal temporary control alias and renames it back in preserved summaries.

## Handler-elision removal: actual bundle and attribution tradeoff

The full 18-scenario rollback measurement uses the same saved original-baseline inputs/flags. This is a direct rebuild, not subtraction of the independent +39-byte hunk estimate. Minimal analysis matches the non-analysis full matrix exactly at 86,190 gzip bytes; hidden maps/emitted JS and all source estimates are preserved.

| Scenario                         | Original gzip | Previous with-elision gzip | No-elision gzip | No-elision vs original | No-elision vs with-elision |
| -------------------------------- | ------------: | -------------------------: | --------------: | ---------------------: | -------------------------: |
| react-router.minimal             |        85,965 |                     86,207 |          86,190 |                   +225 |                        -17 |
| react-router.full                |        89,608 |                     89,880 |          89,844 |                   +236 |                        -36 |
| solid-router.minimal             |        34,339 |                     34,556 |          34,556 |                   +217 |                         +0 |
| solid-router.full                |        39,345 |                     39,553 |          39,553 |                   +208 |                         +0 |
| vue-router.minimal               |        50,615 |                     50,825 |          50,825 |                   +210 |                         +0 |
| vue-router.full                  |        56,366 |                     56,572 |          56,572 |                   +206 |                         +0 |
| react-start.minimal              |        99,110 |                     99,350 |          99,309 |                   +199 |                        -41 |
| react-start.query-integration    |       106,704 |                    106,945 |         106,900 |                   +196 |                        -45 |
| react-start.deferred-hydration   |        99,847 |                    100,090 |         100,053 |                   +206 |                        -37 |
| react-start.full                 |       102,336 |                    102,599 |         102,554 |                   +218 |                        -45 |
| react-start.rsbuild.minimal      |       102,741 |                    102,973 |         102,934 |                   +193 |                        -39 |
| react-start.rsbuild.minimal-iife |       103,161 |                    103,393 |         103,357 |                   +196 |                        -36 |
| react-start.rsbuild.full         |       106,069 |                    106,313 |         106,277 |                   +208 |                        -36 |
| solid-start.minimal              |        47,504 |                     47,707 |          47,707 |                   +203 |                         +0 |
| solid-start.deferred-hydration   |        50,633 |                     50,843 |          50,843 |                   +210 |                         +0 |
| solid-start.full                 |        52,704 |                     52,904 |          52,904 |                   +200 |                         +0 |
| vue-start.minimal                |        67,052 |                     67,264 |          67,264 |                   +212 |                         +0 |
| vue-start.full                   |        71,013 |                     71,217 |          71,217 |                   +204 |                         +0 |

All JS file counts match original baseline and Solid/Vue outputs are unchanged. The prior standalone original-baseline handler run had unresolved timing. The direct composition comparison now establishes a disabled remount benefit from keeping elision: removing it costs render +8.94% [95% +2.00, +16.35] and task +11.46% [+5.01, +18.30], for only 17 extra minimal gzip bytes in the composed version. The two experiments answer different attribution questions; the standalone inconclusive result is not evidence of no composition benefit. The user chose Restore elision after seeing this direct composition tradeoff. The exact previous source is restored; the no-elision arm is retained only as rollback evidence, without further samples or extensions. No original-baseline timing is assigned to this new composition.

## Prior user-selected restored revision and verification

After the no-elision full 18 matrix and emitted analysis completed, the user explicitly chose Restore elision. Only Link and the changeset sentence were restored. Current Link SHA-256 is `3f4e75e0c2ff36dfc7a6484506d0b90720cb54b827ad5ae554afa5d97442ec82`; all 12 runtime states match the previously validated with-elision manifest exactly. Required prior React/core/Solid/Vue checks, 74 Chromium cases, full bundle matrix and emitted/source attribution therefore apply without clean-suite or measurement reruns.

The new direct comparison proves a benefit of elision within this composition for disabled remount (and mixed complete-task), while the separate standalone original-baseline experiment is inconclusive. These claims are scoped to their controls; no no-elision original-baseline timing is invented. Overall architecture acceptance still fails because the restored original-baseline intent remount regresses. All raw rollback blocks, actual +225 minimal/+236 full original-baseline no-elision bundle deltas, unchanged shared outputs, hidden maps/source estimates and public check logs remain preserved. No further optimization, performance extension, commits, pushes or stashes were made.

## Current selected no-elision publication revision

The latest explicit user instruction supersedes the intervening restore choice: remove handler elision and push, prioritizing intent preload. Only Link event assembly and the changeset sentence change back to the already validated no-elision snapshot. Current Link SHA-256 is `101c96a15f3f1cc42be33c6f0a1ef5e78da2a38f35196bcc47280f3c261459e3`; all 12 states match that snapshot and the other 11 states match the earlier composition. Owned render/preload/click destinations, current controls, source/channel semantics, memo dependencies and public event cancellation/state overrides remain intact.

The current comparison has unresolved intent timing and proven disabled cost versus with-elision; the user's selection is deliberate. No new original-baseline timing, eight-family rerun, optimization experiment or full clean suite is invented or needed for a byte-identical previously tested revision. The actual no-elision +225 minimal/+236 full byte deltas come from its full 18 rebuild, not subtraction of the independent +39-byte estimate.

For review, [ELISION-COMPARISON.md](ELISION-COMPARISON.md), [paired-elision-comparison.js](paired-elision-comparison.js), and [the exact with-elision control patch](fixtures/with-elision-control.patch) reproduce the fixed 6-block comparison without committing large raw evidence. The Python cache is scoped out of Git and archived. Final formatting, exact runtime/shared-fixture hash comparison and git diff --check are the only new verification; this selected revision is prepared for commit and push.
