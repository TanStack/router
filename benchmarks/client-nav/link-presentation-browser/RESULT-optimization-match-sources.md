# Consolidated React Link presentation sources

Current supported candidate: `root194`, identified by
`artifacts/unified-root/source-sha256.json`, against exact baseline
`1f0f20a3206a28365d74fd2485b9a8eedbf74dd0`. It passes 175 original focused React tests and both newly added source-path
cases in the latest 25-test focused run, plus production declarations and
exact-task pending/all-Link browser gates. React
minimal adds 194 gzip bytes. Six balanced blocks show departing render -62.75%
[95% -68.62, -55.77] and task -62.40% [-64.28, -60.41], but remount render remains
+10.85% [+3.20, +19.07]. That supported single-router performance cost remains
the acceptance blocker. The worker and final source-retirement shape trials were rejected;
final architecture and mandatory broad/full-matrix validation remain pending.

Nested routers are outside scope; the exploratory tests and unrun fixture have
been removed. Historical
iterations below are retained for attribution. Existing navigation means are
per workload iteration: 10 mixed ticks, 8 Link steps, 6 cold mounts, 18 deep
navigations. Deep nesting includes six root Links; it is not a zero-Link app.
The dedicated zero-Link control is measured below; its intervals are inconclusive.

Continuation of [phase one](RESULTS.md); earlier source/control snapshots and
metrics follow in their measured order.

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
parent/child/Outlet selection and root-provider replacement remain covered.

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
