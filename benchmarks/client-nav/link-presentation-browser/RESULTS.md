# React Link presentation prototype — phase one

The presentation source removes most work when 1000 Links leave the screen. The
prepared pathname reduces synchronous click work for fixed-path updater Links,
but a reduction in complete task or render time is unresolved. Remounting the
1000 Links has a small measured cost, so this prototype needs refinement before
acceptance.

Current status: this is the historical phase-one report. Nested routers are outside scope; exploratory
tests have been removed and provide no current blocker. The latest supported `root194` arm
adds 194 gzip bytes, preserves roughly 63% departing render/task gains, and
still shows a 10.85% remount render cost [95% +3.20, +19.07]. See the
[continuation report](RESULT-optimization-match-sources.md) for current source
identity and results. The worker and final source-retirement shape trials were rejected;
no final implementation is accepted yet.

Architect verdict: match-owned presentation sources validate removing urgent
work from departing Links. The composed candidate fails the no-regression gate
because of the remount tax. Prepared-path dispatch savings do not establish a
complete-task benefit for retained Links. The next controlled experiment would
consolidate router and presentation source in the existing internal router
context, tying the source to router identity with one context read per Link.
The cause of the mount tax remains unproven. Root-source aliasing and a union
cache representation are secondary, unmeasured refinements.

## Revisions and controls

Baseline: `1f0f20a3206a28365d74fd2485b9a8eedbf74dd0`, archived before implementation
into `/private/tmp/router-link-baseline-1f0f20`. Both source trees installed with
Node `24.8.0`, pnpm `11.21.0`, and `CI=1 pnpm install --frozen-lockfile`.

The composed candidate is the six-file production diff in
`artifacts/production.diff`, identified by `artifacts/source-sha256.json`.
Source-only includes React Match/context/Link changes, core stores/load-client
changes, and the router rewrite propagation hunk. Prepared-only includes the
remaining router.ts hunks. Source and builder groups were built independently
in the isolated tree; the working candidate was never temporarily reverted.

All four arms use identical harness sources, production React/router builds,
browser conditions, memory history, memoized 1000-Link rows, and synchronous
routes. Hydration is excluded. Dense fixed links have two alternating targets,
so all active states change. Updater workloads change search, hash, and state;
the inherited-path workload also inherits params and deliberately exercises the
fallback. Departure and return/mount directions are reported separately.

The browser is HeadlessChrome 153 on macOS (exact user agent in the raw results).
Builds and other CPU-heavy jobs stopped during timed browser batches. Fresh
pages receive 12 warm-up navigations. Three blocks alternate all four arms in
forward/reverse order, each with 24 untraced and 16 traced samples per workload:
72 untraced and 48 traced per arm/workload, split evenly for departure/return.
A narrow departure/return repetition uses six alternating blocks, 24 untraced
and 32 traced samples each: 72 untraced and 96 traced per direction/arm.

## Timing definitions

- `dispatchMs`: synchronous synthetic anchor click dispatch, including the
  Link handler and synchronous router/store work.
- `taskMs`: Chromium trace mark immediately before click preparation to the
  end of its enclosing renderer `ThreadControllerImpl::RunTask`, including
  microtasks and any render work completed in that task. This establishes an
  actual task boundary. Small measurement setup/DOM inspection costs are
  included identically in every arm.
- `timerOpportunityMs`: delay until a zero-delay timer scheduled before the
  click runs. It includes queue delay and is a scheduling-opportunity proxy.
- `renderMs`: click preparation to the router's public `onRendered` event.
  This measures full click-to-render separately from synchronous dispatch.
- `frameOpportunityMs`: time to the next animation-frame callback; recorded
  without treating it as evidence of a painted frame.

Promises and microtasks are never counted as browser yields. Traced and
untraced measurements stay separate. Reported deltas use the geometric mean
of paired block ratios; intervals use Student t on the block log ratios, not
individual correlated navigations.

## Results

Narrow six-block repetition (task means in milliseconds):

| Direction                   | Baseline |    Source only | Prepared only |       Composed |
| --------------------------- | -------: | -------------: | ------------: | -------------: |
| Depart 1000 Links           |    4.655 | 1.785 (-61.6%) | 4.569 (-1.8%) | 1.810 (-61.4%) |
| Return and mount 1000 Links |    5.481 |  5.720 (+4.4%) | 5.314 (-3.5%) |  5.808 (+6.0%) |

Composed departure render: **5.093 → 2.053 ms (-59.8%)**, paired 95% interval
[-65.6%, -53.0%]. Its task interval is [-67.3%, -54.4%]. Source-only explains
this gain; prepared-only intervals overlap zero.

Composed remount render: **5.899 → 6.315 ms (+7.3%)**, paired interval
[+1.3%, +13.6%]. Its task interval is [+0.3%, +12.0%]. Source-only remount
task interval is [+0.7%, +8.2%]. These results identify a remount tax to address.

Three-block retained workloads (task means):

| Workload                                    | Baseline |   Source only | Prepared only |      Composed |
| ------------------------------------------- | -------: | ------------: | ------------: | ------------: |
| Fixed targets, dense active changes         |    7.301 | 7.072 (-3.1%) | 7.428 (+1.8%) | 7.317 (+0.3%) |
| Inherited path + search/hash/state updaters |    7.229 | 7.595 (+5.0%) | 6.822 (-5.8%) | 6.973 (-3.7%) |
| Fixed path + search/hash/state updaters     |    7.312 | 7.659 (+5.1%) | 7.294 (+0.0%) | 7.284 (-0.1%) |

These retained task intervals overlap zero; the prototype has not established
a complete-task gain or regression in them. Early unpaired measurements
suggested a large retained regression, but repeated baseline measurements and
paired blocks did not support that conclusion.

Fixed-path updater synchronous dispatch falls **2.137 → 1.743 ms (-18.4%)**
with prepared-only; all three block deltas are negative (-16.7%, -15.2%, -23.0%).
Composed dispatch is 1.847 ms (-13.7%). Composed full render is 7.178 ms versus
7.303 ms baseline (-1.7%), with an interval overlapping zero. Saved synchronous
work therefore does not establish the desired full-task reduction here.

Every arm's `onRendered` href and active state agree with the subsequently
settled DOM. Settled href/active assertions pass for every sample. Both updater
workloads call their state updaters exactly 1000 times per navigation in every
arm. Retained urgency while the destination loader is pending is additionally
covered by the public React regression test.

## Bundle attribution

Identical `react-router.minimal` measurement through the repository runner:

| Arm           | gzip bytes | Delta | initial gzip delta | raw delta | brotli delta |
| ------------- | ---------: | ----: | -----------------: | --------: | -----------: |
| Baseline      |    85, 965 |     — |                  — |         — |            — |
| Source only   |    86, 132 |  +167 |               +165 |      +674 |         +205 |
| Prepared only |    86, 020 |   +55 |                +57 |      +160 |         +112 |
| Composed      |    86, 187 |  +222 |               +222 |      +834 |         +281 |

The composed gzip increase is the sum of the independent group increases.
Raw gzip size of this unminified browser harness is unrelated to these official
minimal-scenario metrics. Full scenario matrix and further optimization rounds
are deferred until the prototype architecture is accepted.

## Validation and remaining scope

Public baseline failures were established before implementation: held departing
hrefs advanced prematurely in all three initial React cases; core mask building
read a newer source and a reentrant configuration update installed an obsolete
cached location. The corrected core baseline test has two public failures and
three passing cases; an earlier interpolation spy assertion was removed.

Candidate focused results: **7 React tests pass**, and **123 core tests pass**
across build-location, preparation, search middleware, and mask suites. Logs are
recorded in `artifacts/final-react.log` and `artifacts/final-core.log`.
The document redirect test observes the public
redirect and retained href update rather than awaiting a navigation promise
whose mocked document unload cannot complete.

Existing client-links/mixed navigation benchmarks, package type/lint suites,
cross-framework consumers, broader e2e, memory, and the full bundle matrix are
unmeasured in this requested quick phase. This is a decision prototype, not a
completed production validation pass.

## Reproduction and artifacts

Build each isolated arm through Nx:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build --outputStyle=stream --skipRemoteCache
```

Preserve each `dist` as `<snapshot-root>/<arm>/browser`, with arms `baseline`,
`source-only`, `prepared-only`, and `composed`. For serving subdirectories, change
only the HTML script reference `/assets/` to `./assets/`; emitted JS is identical.
Serve the snapshot root on `http://127.0.0.1:4180` and open it in playwright-cli.
`paired.js` runs the four-workload comparison; `paired-mount.js` runs the narrow
six-block repetition. Both return raw JSON:

```sh
playwright-cli -s=link-prototype --raw run-code --filename=benchmarks/client-nav/link-presentation-browser/paired.js
python3 benchmarks/client-nav/link-presentation-browser/summarize.py benchmarks/client-nav/link-presentation-browser/artifacts/link-browser-paired.json
```

Ignored `artifacts/` preserves raw paired JSON, both summary JSON files, source
manifest, production diff, official bundle result JSON, and final test logs.
Built arm snapshots remain at `/private/tmp/link-prototype-artifacts`; original
baseline production files remain at `/private/tmp/link-prototype-originals`.
