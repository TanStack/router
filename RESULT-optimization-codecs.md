# Codec contract and hydration simplification validation

Date: 2026-10-21. Node 26.10.0; pnpm 11.21.0.

Support-only commits: `25c49de994` and `5ece55d91b`. The runtime baseline is
`ee5df01226`. Implementation paths were explicitly stashed; `FINDINGS.md` and
`PROPOSAL.md` were neither stashed nor committed.

## BEFORE

Core: **3,933 passed, seven failed, four expected failures, three skipped**.
The seven failures assert the newly approved policy: superseding a pending
codec runs its normal handler, including direct/transitive and repeated-ID
parent dependencies. These are expected policy failures of the old runtime,
not a green baseline. There were no type errors.

Freshly built native CJS timing uses production execution with the development
`isServer` condition. Router creation, bootstrap replay, validation and cleanup
are outside the measured hydration call. Broad timing was deliberately stopped
after 20 cases because setup dominated wall time; it is archived separately and
does not count as a completed run. The paired workload is the four transformed
serial cases and four active loader-codec cases below (500 ms each). Server
execution is byte-identical; obsolete filtering-helper SSR gains are not claimed.

| Workload                            | Mean µs |  p99 µs |  p999 µs |   SD µs | RME % | Samples |
| ----------------------------------- | ------: | ------: | -------: | ------: | ----: | ------: |
| serial: transformed, depth 4        |  19.805 |  49.750 | 2773.264 | 141.038 |  8.78 |   25248 |
| serial: transformed-async, depth 4  |  18.048 |  32.955 | 2321.865 | 112.669 |  7.35 |   27705 |
| serial: transformed, depth 16       |  53.649 | 109.304 | 3117.362 | 187.761 |  7.11 |    9320 |
| serial: transformed-async, depth 16 |  57.826 | 114.435 | 2965.405 | 200.757 |  7.32 |    8647 |
| loaders: all-active-sync, depth 4   |  21.107 |  47.154 | 3664.777 | 162.325 |  9.76 |   23831 |
| loaders: all-active-async, depth 4  |  18.610 |  37.626 | 2455.025 | 136.719 |  8.78 |   26867 |
| loaders: all-active-sync, depth 16  |  43.962 |  68.795 | 3308.048 | 180.190 |  7.53 |   11374 |
| loaders: all-active-async, depth 16 |  46.004 |  68.637 | 3112.598 | 182.613 |  7.46 |   10869 |

All 18 bundle scenarios completed with analysis and fresh package builds.
Immutable run: `ss-codecs-before-all`.

| Scenario                         | Total gzip | Initial gzip |    Raw | Brotli |
| -------------------------------- | ---------: | -----------: | -----: | -----: |
| react-router.minimal             |      86247 |        86110 | 268402 |  75179 |
| react-router.full                |      89944 |        89803 | 280596 |  78543 |
| solid-router.minimal             |      34354 |        34227 |  98182 |  31095 |
| solid-router.full                |      39398 |        39270 | 113347 |  35482 |
| vue-router.minimal               |      50820 |        50695 | 140414 |  46094 |
| vue-router.full                  |      56554 |        56427 | 159021 |  51105 |
| react-start.minimal              |      99688 |        99549 | 311317 |  86585 |
| react-start.query-integration    |     107279 |       107140 | 338541 |  93175 |
| react-start.deferred-hydration   |     100429 |        99565 | 312702 |  87317 |
| react-start.full                 |     102816 |       102676 | 320812 |  89346 |
| react-start.rsbuild.minimal      |     103459 |       103243 | 322612 |  89421 |
| react-start.rsbuild.minimal-iife |     103872 |       103663 | 323588 |  89722 |
| react-start.rsbuild.full         |     106723 |       106507 | 332514 |  92135 |
| solid-start.minimal              |      47875 |        47747 | 139990 |  42652 |
| solid-start.deferred-hydration   |      50994 |        47811 | 147498 |  45463 |
| solid-start.full                 |      53019 |        52891 | 155303 |  47020 |
| vue-start.minimal                |      67576 |        67447 | 191837 |  60268 |
| vue-start.full                   |      71364 |        71237 | 203989 |  63550 |

Evidence: `/tmp/pr6631-spa-start/codec-before-commands.json`, named-run JSON
and `measure.log`; full unit and native logs in the same temporary directory.
The source snapshots are `/tmp/pr6631-spa-start/codec-before-*.ts`.

## AFTER

Core: **3,940 passed, four expected failures, three skipped**, no type errors.
All seven new policy failures are fixed. Both codecs keep the existing runtime
argument fields; the supported interface is narrowed through types and docs.
No filtering helper, new controller flag or second execution pipeline is added.
`hydrate` remains last in `load-client.ts`.

The eight focused workloads pass their public round-trip assertions. Means move
from −13.0% to +4.2%; individual RME is 7.1–13.4%. Confidence intervals overlap,
so these samples establish neither a universal speedup nor a consistent slowdown.
In the depth-16 async cases, serial changes −0.49% and loader codecs −1.18%.
The historical 11.5% overhead is not reproduced by this paired screen, which
compares current runtime before/after these changes, not a fresh original-PR run.

| Workload | Before → after mean µs | Change % | RME before / after % | After p99 / p999 µs | After SD µs | After samples |
| -------- | ---------------------: | -------: | -------------------: | ------------------: | ----------: | ------------: |

| serial: transformed, depth 4 | 19.805 → 17.236 | -12.97 | 8.78 / 7.89 | 37.122 / 195.114 | 118.239 | 29009 |
| serial: transformed-async, depth 4 | 18.048 → 17.285 | -4.23 | 7.35 / 7.40 | 34.971 / 212.536 | 111.212 | 29071 |
| serial: transformed, depth 16 | 53.649 → 52.376 | -2.37 | 7.11 / 7.14 | 78.283 / 3065.319 | 186.484 | 9547 |
| serial: transformed-async, depth 16 | 57.826 → 57.546 | -0.49 | 7.32 / 7.81 | 109.207 / 3126.682 | 213.695 | 8689 |
| loaders: all-active-sync, depth 4 | 21.107 → 21.995 | +4.20 | 9.76 / 13.36 | 47.360 / 3566.857 | 226.120 | 22746 |
| loaders: all-active-async, depth 4 | 18.610 → 18.896 | +1.53 | 8.78 / 8.35 | 33.709 / 2472.723 | 130.918 | 26461 |
| loaders: all-active-sync, depth 16 | 43.962 → 45.385 | +3.24 | 7.53 / 7.53 | 71.042 / 3178.757 | 183.025 | 11017 |
| loaders: all-active-async, depth 16 | 46.004 → 45.462 | -1.18 | 7.46 / 7.12 | 72.210 / 3117.426 | 173.190 | 10999 |

All 18 AFTER scenarios completed: `ss-codecs-after-all`. Six Router scenarios
are byte-identical. Twelve Start scenarios grow 28–46 total gzip bytes against
the old behavior; this is the approved private-codec policy cost after optimization.

| Scenario                         | Before → after gzip | Delta | After initial gzip | After raw | After Brotli |
| -------------------------------- | ------------------: | ----: | -----------------: | --------: | -----------: |
| react-router.minimal             |       86247 → 86247 |    +0 |              86110 |    268402 |        75179 |
| react-router.full                |       89944 → 89944 |    +0 |              89803 |    280596 |        78543 |
| solid-router.minimal             |       34354 → 34354 |    +0 |              34227 |     98182 |        31095 |
| solid-router.full                |       39398 → 39398 |    +0 |              39270 |    113347 |        35482 |
| vue-router.minimal               |       50820 → 50820 |    +0 |              50695 |    140414 |        46094 |
| vue-router.full                  |       56554 → 56554 |    +0 |              56427 |    159021 |        51105 |
| react-start.minimal              |       99688 → 99720 |   +32 |              99581 |    311434 |        86683 |
| react-start.query-integration    |     107279 → 107308 |   +29 |             107169 |    338658 |        93219 |
| react-start.deferred-hydration   |     100429 → 100457 |   +28 |              99598 |    312819 |        87427 |
| react-start.full                 |     102816 → 102847 |   +31 |             102707 |    320930 |        89434 |
| react-start.rsbuild.minimal      |     103459 → 103497 |   +38 |             103281 |    322730 |        89430 |
| react-start.rsbuild.minimal-iife |     103872 → 103915 |   +43 |             103706 |    323706 |        89692 |
| react-start.rsbuild.full         |     106723 → 106769 |   +46 |             106553 |    332632 |        92008 |
| solid-start.minimal              |       47875 → 47910 |   +35 |              47783 |    140107 |        42724 |
| solid-start.deferred-hydration   |       50994 → 51032 |   +38 |              47849 |    147615 |        45520 |
| solid-start.full                 |       53019 → 53050 |   +31 |              52921 |    155420 |        47092 |
| vue-start.minimal                |       67576 → 67604 |   +28 |              67480 |    191954 |        60333 |
| vue-start.full                   |       71364 → 71398 |   +34 |              71270 |    204106 |        63699 |

## Hunk attribution and limits

SPA is 86,247 in every listed screen. Policy baseline `ss-codec-policy-base`
uses the original step argument shape plus private-flight behavior: Start 99,735.
Uniform factories alone measure99,732 (−3); client-only data assignment alone
99,732 (−3); invariant-based flight checks alone99,723 (−12). The composition
is 99,720 (−15), not the sum of independent gzip savings. Detailed run IDs and
other metrics are preserved in BUNDLE-SIZE.md.

Replacing flight identity with key membership measured99,711 but failed a
public repeated-ID legacy fallback regression; it is rejected. The narrower
identity-safe check retains that behavior. Runtime-filter/direct-engine drafts
are superseded and not production wins.

Start minimal remains 32 above committed runtime 99,688, 165 above original
PR 99,555 and 265 above the 99,455 target. The byte goal is unmet. No feature cuts
are retained. Server execution and utils source match BEFORE exactly.

All 32 unit/type/eslint/build targets pass across router-core, React Router,
Solid Router, Vue Router, Start client/server core and React Start client/server.
Positive metadata inference tests run through all three binding unit suites.
Counts: core 3,940; React 1,353; Solid 1,141 client+77 server; Vue 1,131 runtime+251
type tests; Start client 149 (+one TODO), Start server 583, React Start client 30.
React Start server's unit target is a placeholder; server behavior is covered by
Start server core and the browser suites. Package compiler matrices and exports
checks pass. The first matrix run was interrupted and was fully rerun; it does
not count as a completed run.

Production Chromium suites pass 75 lifecycle cases and 11 selective-SSR cases,
86 total. Root documentation verification reports two pre-existing broken links:
production-checklist.md→../examples/start-next-migration and
tanstack-query.md→../examples/start-basic-react-query. Both exact links occur on
the original base b1b111761bdf and their local targets are absent there. The
edited codec pages add no broken links. No unrelated documentation changes are
included to silence this check.

Final post-validation run `ss-codecs-final-all` succeeds at retained runtime
`3b3fa2f5c787`. All 18 metrics exactly match `ss-codecs-after-all`, and all four
source snapshots match the committed files. The implementation commit manifest
is `/tmp/pr6631-spa-start/codec-commit-manifest.json`. Tests/benchmarks and each
viable optimization are separate commits; FINDINGS.md remains uncommitted. Evidence is under `/tmp/pr6631-spa-start/codec-{before,after}-*`, with
all emitted JS/maps copied into `emitted-codecs-{before,after}`.

before load-client.ts: `cb13dc6ad65cb93af79bde84b0b9fc2e63564161ac51eb24fafd31b4127310ee`
after load-client.ts: `5e356e2d8088fa99b9fac7bdfcffdbb9f63869c71751f8acbf041ee04811b55a`
before load-server.ts: `30fea416f28bb1dc34c09d9e3f1bb59771912cdd560d3ddd2fae174577779246`
after load-server.ts: `30fea416f28bb1dc34c09d9e3f1bb59771912cdd560d3ddd2fae174577779246`
before route.ts: `e9f5aab7ede6ca0e710c423463178405b987b2853a59f6e5ed940c66cd0ba5e6`
after route.ts: `82df4073e7b6edb6e9895044979c65b3b7f6a92969aa2949bfbda76af9879c69`
before utils.ts: `a92bf15ce4ccf566505d23a19bcd91048a8e41cbda401ff2e6fa8e1a5dcd1e71`
after utils.ts: `a92bf15ce4ccf566505d23a19bcd91048a8e41cbda401ff2e6fa8e1a5dcd1e71`

Independent recompression reconciled all 38 measured client JS files and maps per
phase, including initial/total raw/gzip/Brotli sums. Six SPAs are byte-identical;
12 Start scenarios grow 28–46gzip bytes. No artifact anomalies were found. Maps
embed package ESM, not original TS; the audit verifies semantic source-diff
correspondence and snapshot hashes, not a cryptographic TS-to-package mapping.
Audit: `/tmp/pr6631-spa-start/codec-independent-evidence-audit.md`.

An additional combination screen omitting only Object.assign measures 99,722,
so fresh codec argument reuse saves 2 bytes in the final composition. The
sequential retained ladder is 99,735→99,723→99,722→99,720 (−12/−1/−2).
