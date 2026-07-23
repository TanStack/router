# PR #7805 review issue ledger

This ledger is the source of truth for review findings against:

- PR: `TanStack/router#7805`
- Base: `0b178a79e2e872df0107bd7f0faa891c4c9815ef`
- Head under test: `6683863a75a46297765b288957fccd147006ef0c`
- Prior review: <https://gist.github.com/schiller-manuel/0d874b509be56c8e5f7f14c53134a20d>

Consult this file before investigating a concern. Update it immediately when evidence changes. Production code must not be fixed during this review.

## Checkout and build record

- Local branch: `codex/pr-7805-review`, checked out at exact PR head `6683863a75a46297765b288957fccd147006ef0c` against base `0b178a79e2e872df0107bd7f0faa891c4c9815ef`.
- Dependency setup: `CI=1 pnpm i` completed successfully.
- PR build: `CI=1 NX_DAEMON=false pnpm build` completed successfully for all 43 selected projects (7 cached). The only infrastructure warning was Nx Cloud DNS `ENOTFOUND`; local builds succeeded.
- Completion audit on 2026-07-18 reran the same build at the unchanged PR head: all 43 selected projects succeeded again (42 from the local cache, one executed). Nx Cloud again reported only the non-blocking DNS `ENOTFOUND` warning.
- Review tests are deliberately red while production remains untouched. Focused Nx targets are run one at a time with daemon/remote cache disabled; each verified production row below names its retained failing test. G01 and P09 are intentionally green controls.

### Final focused validation matrix

All commands below ran from the repository root with `CI=1 NX_DAEMON=false`, `--outputStyle=stream`, `--skipRemoteCache`, and `--skipNxCache`. A red result is expected for a retained production regression; it is a validation failure only if the test passes unexpectedly or fails for setup/type noise.

- **Router core:** one 14-file focused run completed with 12 failing files and 2 passing files; 13 failing cases and 3 passing cases. The failures are P02 (runtime and exported type), P04, P08, P10, P12, D01, N02-N05, and N10. N03 contributes two independent failing cases. G01 and P09 pass; P12's fresh-chain control also passes. The only reported type-test failure is P02's four deliberately missing public fields; there are no incidental source/type errors or unhandled test errors.
- **React adapter/server/hydration:** one five-file focused run completed with all 8 cases failing for P03, P06, P07, P11, N06, N07 sync, N07 async, and N08. Type checking reports no errors.
- **Vue adapter:** the two-file focused run fails exactly N01 and Vue's P05 teardown acknowledgement. Type checking reports no errors.
- **Solid adapter:** the Nx target's client phase ran the full package suite: 53 files passed and only the retained P05 file failed; 824 tests passed, one retained review test failed, and one test was skipped by the existing suite. Type checking reports no errors. The target stops before its server-mode phase because the intentional client regression is red; the P05 test is client-only.
- **Router plugin HMR:** the exact H01 name-filtered run executes one retained test and fails because `hotRoute.lazyFn` remains the old importer, the old importer runs twice, and the new importer never runs. Type checking reports no errors. An earlier mistyped name filter matched nothing and is not validation evidence.

Across those final runs, the production ledger contains **21 verified issues represented by 25 failing cases in 21 files**. No production implementation file was changed to obtain these results.

The completion audit reran the package-relative focused filters and reproduced the exact core, React, Vue, and HMR matrices plus Solid's retained P05 failure. A preceding core invocation accidentally supplied repository-relative paths to package-rooted Vitest and matched no files; it is explicitly discarded as validation evidence. The corrected core rerun immediately afterward produced the 12-failing/2-passing-file and 13-failing/3-passing-case matrix recorded above.

## Validation standard

A production behavior issue is **VERIFIED** only when all of the following are present:

1. A focused regression test fails on the PR head for the claimed behavioral reason.
2. The failure is checked against the intended contract/reference behavior so the test is not merely asserting a preference or failing for setup noise.
3. The code path and impact are independently reviewed by the primary investigator and at least two additional reviewers.
4. The issue has a concrete, implementation-ready repair outline and acceptance criteria in `PLAN.md`.

A test-suite-only finding is classified separately. It requires three independent reviewers to prove that the existing test can pass while its named behavior is absent, that its setup measures unrelated work, or that the claimed interleaving has no oracle. These findings enter only the test-hardening section of `PLAN.md`; they are not evidence of an additional runtime defect. Their implementation must add a diagnostic oracle and prove it fails under the named negative mutation before any related production fix is credited.

Statuses:

- `UNVERIFIED`: inherited claim or new hypothesis; not yet reproduced here.
- `TEST-WRITTEN`: focused test exists but its signal or expected contract is still under review.
- `VERIFIED`: failing regression plus three independent reviews agree.
- `VERIFIED TEST-GAP` / `VERIFIED BOGUS-ORACLE` / `VERIFIED PARITY-GAP`: three independent reviews prove a test-only false-positive or missing-coverage window; no additional runtime defect is claimed.
- `VERIFIED COVERAGE-GAP`: three reviewers confirm a documented interleaving is not actually exercised; it remains test-only.
- `VERIFIED WITH <ID>`: the test gap is closed by the named production issue's retained failing regression rather than a duplicate test.
- `NOT-VALIDATED`: reproduction failed, the contract does not require the behavior, or independent reviewers rejected the claim. It remains here to prevent repeat investigation.
- `FIXED-UPSTREAM`: not a PR-head defect after comparison; retained for history.
- `COVERAGE-VALIDATED`: the production behavior passes a strong focused test, but that direct regression coverage is absent from the PR and should be retained as a test-only improvement.

## Status summary

| ID  | Severity / class          | Area                                                                      | Current status        | Reproduction / control evidence                                                                | Independent reviews       |
| --- | ------------------------- | ------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| P01 | Blocker                   | Babel/Vite transform of `declare` class fields                            | NOT-VALIDATED         | none (supported-pipeline controls pass)                                                        | 3/3 falsification reviews |
| P02 | Blocker                   | Removed public `RouterState` fields                                       | VERIFIED              | `packages/router-core/tests/pr-7805-review-c-router-state-compat.test{.ts,-d.ts}`              | 3/3                       |
| P03 | Major                     | React transition callback after unmount                                   | VERIFIED              | `packages/react-router/tests/pr-7805-review-transitioner-unmount.test.tsx`                     | 3/3                       |
| P04 | Major                     | Background asset projection mutates committed matches                     | VERIFIED              | `packages/router-core/tests/pr-7805-review-p04-background-projection.test.ts`                  | 3/3                       |
| P05 | Major                     | Solid/Vue false rendered acknowledgement after unmount                    | VERIFIED              | `packages/{solid,vue}-router/tests/pr-7805-review-transitioner-unmount.test.tsx`               | 3/3                       |
| P06 | Major                     | React lazy component retry keeps stale reload latch                       | VERIFIED              | `packages/react-router/tests/pr-7805-review-lazy-retry-module-error.test.tsx`                  | 3/3                       |
| P07 | Blocker                   | Generic SSR redirects converted to HTTP 200                               | VERIFIED              | `packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx`                          | 3/3                       |
| P08 | Major                     | Pending-session takeover preserves stale visible snapshot                 | VERIFIED              | `packages/router-core/tests/pr-7805-review-p08-pending-takeover.test.ts`                       | 3/3                       |
| P09 | Moderate                  | Preload redirect limit/cycle handling                                     | NOT-VALIDATED         | exact-boundary test passes                                                                     | 3/3 falsification reviews |
| P10 | Major                     | Blocking child consumes stale background parent                           | VERIFIED              | `packages/router-core/tests/pr-7805-review-p10-semantic-parent.test.ts`                        | 3/3                       |
| P11 | Major                     | Functional `ssr()` failure skips lazy boundary chunk                      | VERIFIED              | `packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx`                          | 3/3                       |
| P12 | Moderate                  | Failed redirect target leaks redirect-chain authority                     | VERIFIED              | `packages/router-core/tests/pr-7805-review-p12-redirect-authority.test.ts`                     | 3/3                       |
| G01 | Coverage gap              | Child-local `loaderDeps` change with stable parent                        | COVERAGE-VALIDATED    | `packages/router-core/tests/pr-7805-review-c-child-loader-deps-reuse.test.ts` passes           | 3/3                       |
| D01 | Audit                     | Client/server conditional exports and DCE                                 | VERIFIED              | `packages/router-core/tests/pr-7805-review-c-server-dce.test.ts`                               | 3/3                       |
| N01 | Major candidate           | Vue global error boundary cannot reset on same-route reload               | VERIFIED              | `packages/vue-router/tests/pr-7805-review-global-boundary-reset.test.tsx`                      | 3/3                       |
| N02 | Major candidate           | Planning-time self redirects bypass the redirect-cycle budget             | VERIFIED              | `packages/router-core/tests/pr-7805-review-n02-planning-redirect-budget.test.ts`               | 3/3                       |
| N03 | Major candidate           | Late preload can cache/join a child from a superseded parent generation   | VERIFIED              | two cases in `packages/router-core/tests/pr-7805-review-n03-preload-parent-generation.test.ts` | 3/3                       |
| N04 | Major candidate           | Superseded load waits for obsolete component preload                      | VERIFIED              | `packages/router-core/tests/pr-7805-review-n04-obsolete-component-preload.test.ts`             | 3/3                       |
| N05 | Major candidate           | Stale pre-commit background candidate leaks its flight lease              | VERIFIED              | `packages/router-core/tests/pr-7805-review-n05-background-candidate-lease.test.ts`             | 3/3                       |
| N06 | Major candidate           | Global error boundary does not reset after child-only background recovery | VERIFIED              | `packages/react-router/tests/pr-7805-review-global-boundary-background-reset.test.tsx`         | 3/3                       |
| N07 | Major candidate           | Functional SSR failure erases route context seen by its boundary          | VERIFIED              | `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx` (sync + async)   | 3/3                       |
| N08 | Major candidate           | Hydrated unresolved frontier retains incomplete parent context            | VERIFIED              | `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx`                  | 3/3                       |
| N09 | Component-chunk candidate | Repeated component preload calls after removal of the route-level cache   | NOT-VALIDATED         | none (documented design; no at-most-once contract)                                             | 3/3 falsification reviews |
| N10 | Major candidate           | Same-ID flight join ignores freshly rerun own route/beforeLoad context    | VERIFIED              | `packages/router-core/tests/pr-7805-review-n10-inflight-preload-own-context.test.ts`           | 3/3                       |
| H01 | HMR candidate             | Explicit source-chained `.lazy()` retains old importer                    | VERIFIED              | `packages/router-plugin/tests/handle-route-update.test.ts`                                     | 3/3                       |
| T01 | Test gap                  | Vue root-pending test never asserts pending UI                            | VERIFIED TEST-GAP     | existing test passes without pending UI                                                        | 3/3                       |
| T02 | Bogus test oracle         | Preload-redirect selector counts include initial load                     | VERIFIED BOGUS-ORACLE | existing React/Solid/Vue tests do not isolate preload                                          | 3/3                       |
| T03 | E2E gap                   | Issue 7120 does not prove View Transition/stale-frame path                | VERIFIED TEST-GAP     | existing Playwright test passes without either named oracle                                    | 3/3                       |
| T04 | E2E gap                   | Issue 7457 does not observe transient blank frames                        | VERIFIED TEST-GAP     | existing Playwright test samples only endpoints                                                | 3/3                       |
| T05 | E2E gap                   | Solid issue 7283 does not assert configured pending minimum               | VERIFIED TEST-GAP     | existing Playwright test discards recorded timestamps                                          | 3/3                       |
| T06 | Coverage gap              | Generic lazy retry tests miss module-not-found branch                     | VERIFIED WITH P06     | retained P06 failing regression supplies coverage                                              | 3/3                       |
| T07 | Coverage caveat           | Preloaded-mount test does not reproduce original race                     | VERIFIED COVERAGE-GAP | existing test explicitly documents limitation                                                  | 3/3                       |
| T08 | Parity gap                | Pending replacement/stale-content coverage differs by adapter             | VERIFIED PARITY-GAP   | framework test-matrix audit                                                                    | 3/3                       |
| T09 | Test setup gap            | React issue-7051 overlaps initial load and drops predecessor navigation   | VERIFIED TEST-GAP     | existing test admits false-positive setup/settlement paths                                     | 3/3                       |
| T10 | Test oracle gap           | React listener-error test never proves throwing listener ran              | VERIFIED BOGUS-ORACLE | existing test passes if throwing listener is skipped                                           | 3/3                       |
| T11 | Test quality gap          | Vue abort test uses multi-second timing and weak abort oracles            | VERIFIED TEST-GAP     | existing test has only delayed/at-least-once endpoints                                         | 3/3                       |
| T12 | Bogus test oracle         | Pending-preload reuse test codifies a context-insensitive loader join     | VERIFIED BOGUS-ORACLE | N10 fails while the existing one-loader test passes                                            | 3/3                       |

## Prior-review claims and local validation

### P01 — Babel/Vite transform rejects runtime `declare` class fields

- Prior claim: source-consuming React/Vite/Babel pipelines process class features before TypeScript stripping and reject `declare` fields in `packages/router-core/src/router.ts`.
- Suspect declarations: `shouldViewTransition`, `isViewTransitionTypesSupported`, `_tx`, `_flights`, `_committedMatches`, `_pending`, `_serverResult`, `_rendered`, `_refreshRoute`.
- Required proof: a repository-owned transform/build test using the affected pipeline fails on the PR head specifically at a `declare` field, plus confirmation that an initialized field form is accepted by the same pipeline.
- Local falsification: the repository-supported Vite 8/React pipeline parses the TypeScript source and strips the `declare` fields successfully; the PR package build also completes. A failure can be constructed only by ordering a raw Babel class-features transform before TypeScript transformation, but no supported repository pipeline or documented source-consumer contract using that ordering was found.
- Independent falsification: build/API, adapters, and client-lane reviewers separately inspected the repository transform order, package exports, supported consumer/build paths, and the deliberately misordered raw Babel control. All reject the contrived Babel ordering as evidence of a supported PR regression.
- Status: **NOT-VALIDATED**.

### P02 — public `RouterState` fields were removed incompatibly

- Prior claim: `loadedAt`, `isTransitioning`, `statusCode`, and `redirect` disappeared from the public `RouterState` interface and runtime state without a major release/changeset.
- Required proof: a public-package type test and, where applicable, runtime test that passes at the base contract and fails on the PR head; confirm docs/exports make the fields public rather than internal.
- Contract decision needed: compatibility restoration versus explicit major-version migration. A test cannot by itself decide semver policy.
- Focused tests: `packages/router-core/tests/pr-7805-review-c-router-state-compat.test-d.ts` exercises the exported type and `packages/router-core/tests/pr-7805-review-c-router-state-compat.test.ts` exercises a real router state object.
- Local results: the runtime test fails because `loadedAt`, `isTransitioning`, `statusCode`, and `redirect` are all absent from `router.state`; the type test independently reports missing-property errors for all four names on the exported `RouterState`. The independent public-entrypoint/docs/v1-semver reviews below establish that the silent removal is a compatibility blocker.
- Independent reviews: build/API primary established the type/runtime removal; adapters reviewer independently confirmed public entrypoint re-exports, public docs, v1 semver, and deprecation precedent; client-lane reviewer independently compared the base interface, runtime initial values, public selectors, and lack of migration/changeset. All three accept the tests and contract.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P03 — React load can hang after `Transitioner` unmount

- Prior claim: cleanup drains existing acknowledgements but leaves stale `router.startTransition` and `router._rendered` callbacks installed. A later load enqueues an acknowledgement no mounted tree can resolve.
- Required proof: mount and settle, unmount, trigger a history/router load, and demonstrate that completion/onResolved/idle hangs on the PR head. The same test must distinguish an actual liveness failure from an intentionally absent `onRendered` event.
- Focused test: `packages/react-router/tests/pr-7805-review-transitioner-unmount.test.tsx`. It fails after the provider is synchronously unmounted: a later no-subscriber `router.navigate()` returns `stalled` after 100 ms instead of resolving, remains pending, and does not advance `resolvedLocation`. Source review confirms teardown removes the history listener but leaves the transition callback installed, so the final commit enqueues an acknowledgement after the only renderer has gone.
- Independent reviews: adapters primary reproduction; client-lane reviewer independently traced the core fallback and unresolvable post-unmount acknowledgement; build/API reviewer independently validated the cleanup/ownership path and test oracle. All three accept the liveness defect.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P04 — background asset projection mutates committed matches before currentness check

- Prior claim: `runBackground` shallow-copies the lane; `projectLane` writes asset fields on shared match objects before CAS/currentness validation, leaking stale or unnotified state.
- Required proof: block an async `head`/`scripts` projection, retain direct references and subscription counts, supersede the background transaction, then show committed objects change before/without valid publication.
- Focused test now isolated in `packages/router-core/tests/pr-7805-review-p04-background-projection.test.ts` fails: the retained committed object changes from `{title:'foreground-refresh'}` to `{title:'discarded-background'}` after the losing background projection settles. Controls prove the initial/foreground titles, separate stale reload, successor `/slow` pending state, and exact presented object identity before release.
- Independent reviews: client-lane primary reproduction; build/API reviewer independently confirmed shared base-object projection before CAS; adapters reviewer independently re-derived the shallow-copy/mutating-projection path and accepted the identity oracle. All three accept the defect.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P05 — Solid and Vue report rendered after provider unmount

- Prior claim: stale framework transition callbacks remain callable after teardown and resolve `true`, causing false `onRendered` events and `pendingMinMs` obligations.
- Required proof: framework-specific mount/unmount/load tests demonstrating resolution occurs but a post-unmount publication is incorrectly acknowledged/rendered; remount must still work.
- Focused tests: `packages/solid-router/tests/pr-7805-review-transitioner-unmount.test.tsx` and `packages/vue-router/tests/pr-7805-review-transitioner-unmount.test.tsx`. Both fail on the final negative event assertion: after unmount, navigation legitimately completes to idle `/next`, but the stale transition callback emits one `onRendered` event for `/` to `/next`. Each test subscribes only after initial idle, excluding mount noise. The Solid package's other 824 client tests passed (one skipped); the focused Vue invocation ran exactly the two requested files.
- Independent reviews: adapters primary reproduction; client-lane reviewer independently confirmed `onRendered`'s renderer-ack contract and missing cleanup; build/API reviewer independently checked framework closures, core false fallback, and test isolation. All three accept both adapter failures.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P06 — React lazy retry retains module-reload intent after successful retry

- Prior claim: recognized dynamic-import failure sets closure-level `reload = true`; retry resets `error`/`loadPromise` but not `reload`, so a later successful preload still reloads/suspends on first render.
- Required proof: exact sequence `recognized module failure -> successful retry -> render`, asserting a valid component renders without reload. Include control cases for immediate render after failure and generic errors.
- Focused regression: `packages/react-router/tests/pr-7805-review-lazy-retry-module-error.test.tsx`. It uses the browser-recognized dynamic-import `TypeError`, asserts the reload session-storage marker after the failed preload, successfully retries the importer, then renders once with a fake reload spy. It fails exactly because the stale latch still calls `window.location.reload()` and throws the eternal suspense promise after the successful retry. The PR's existing generic-error retry test cannot enter this branch. Two independently authored drafts reproduced the same signal and were consolidated into this stronger single case.
- Independent reviews: build/API primary, adapters reviewer, and client-lane reviewer independently confirmed the recognized error classifier, attempt-specific reload intent, successful retry contract, and genuine eternal-promise failure. All three accept the tests.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P07 — generic SSR redirect becomes `200 + Location`

- Prior claim: core `createRequestHandler` always invokes framework renderers after load; render helpers map non-render server results to status 200, while TanStack Start separately short-circuits redirects.
- Required proof: exercise the real generic request handler and real React/Solid/Vue string/stream response helpers with thrown and returned redirects; assert status, Location, custom headers, body, and render-callback invocation.
- Local failing regression: `packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx`, test `P07: generic SSR preserves redirect response status and headers`.
- Command: `CI=1 NX_DAEMON=false pnpm nx run @tanstack/react-router:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/pr-7805-review-ssr-regressions.test.tsx`.
- PR-head result: **fails** with `expected 200 to be 307`; the redirect's `Location` and custom header survive. The code flow confirms `createRequestHandler` calls `router.load()`, dehydrates, constructs headers, and invokes `cb` without branching on `_serverResult.type`. The React string renderer then assigns 200 for every non-`render` result. The same status fallback exists in React/Solid/Vue string and stream renderers, while TanStack Start separately short-circuits its redirect at `packages/start-server-core/src/createStartHandler.ts`.
- Reference control: base/main's string renderer uses the public server `statusCode` store and therefore returns the redirect's 307. The regression test deliberately does **not** require the callback to be skipped or the body to be empty, because base invokes the renderer; those are possible repair choices, not necessary facts for validating the status regression.
- Completed review controls: independent reviewers confirmed the generic-handler composition and all six renderer fallback sites, traced both returned and thrown redirect normalization, and compared base cleanup/dehydration ordering. The focused failure pins the shared status bug; the returned/renderer/status matrix remains an implementation acceptance expansion in `PLAN.md`.
- Independent reviews: root primary reproduction; adapters reviewer independently confirmed the generic-handler contract, renderer fallback, redirect-header controls, public/default composition, and Start's contrasting short-circuit; build/API reviewer independently compared base/public composition and both returned/thrown redirect normalization across all six renderer paths. All three accept the failing test and contract.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P08 — pending-session ownership transfer leaves prior transaction's snapshot visible

- Prior claim: same-boundary/same-match-ID takeover transfers timing ownership but, when `session.ack` exists, skips publishing the successor snapshot. Search/state/context can differ without changing match ID.
- Required proof: two controlled overlapping same-route navigations with identical match ID and differing search/state; a visible pending component must demonstrate whether old values remain while location is new. Verify the original pending-min deadline is preserved.
- Focused test now isolated in `packages/router-core/tests/pr-7805-review-p08-pending-takeover.test.ts` fails: after the first pending lane visibly has search revision one and the successor location visibly has revision two, the pending match still exposes revision one. A shared loader gate keeps both same-match-ID navigations overlapped and both navigation promises subsequently settle; the hardened test bounded-waits for successor publication and drains both promises in `finally`.
- Independent reviews: client-lane primary reproduction; build/API reviewer independently confirmed the same-ID owner-transfer/early-return path; adapters reviewer independently re-derived the timing/snapshot split and accepted the test. All three accept the defect. The repair test must add nonzero `pendingMinMs` preservation.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P09 — preload redirect limit is off by one and disconnected from lane cycle handling

- Prior claim: preload starts at zero, stops only at `redirects > 20`, and omits accumulated depth from `executeClientLane`, allowing 21 follows and bypassing the intended cycle error.
- Required proof: focused tests at exact redirect counts (19/20/21), across thrown/returned and beforeLoad/loader redirects; confirm intended public preload-cycle contract and `reloadDocument` behavior.
- Focused test: `packages/router-core/tests/pr-7805-review-p09-preload-redirect-boundary.test.ts`. It passes on the PR head: a preload starting at step zero follows redirects through step 20 (exactly twenty follows) and does not execute step 21; the next redirect is rejected by the `redirects > 20` entry guard. The prior review counted visited locations rather than redirect edges and therefore described the correct boundary as off by one.
- Independent falsification: client-lane, build/API, and isolated-test reviewers separately traced the recursion counter and agreed with the edge-count oracle. The test also prevents a future boundary regression and should be retained as coverage.
- Remaining coverage recommendation: table-test thrown/returned redirects from `beforeLoad`, loader, and lazy-chunk failures plus `reloadDocument`; this is hardening, not evidence for the rejected claim.
- Status: **NOT-VALIDATED**. Do not add a production fix for P09.

### P10 — mixed background-parent/blocking-child publication is incoherent

- Prior claim: the background parent has a fresh `semanticParent`, but a blocking child receives `tasks[index - 1]?.match`, which resolves to the stale foreground parent; final publication can pair fresh parent data with child data derived from the stale generation.
- Required proof: controlled revisions with parent background reload and child blocking reload; child awaits `parentMatchPromise` and records revision. Test mixed-mode inverse and all-foreground controls.
- Focused regression: `packages/router-core/tests/pr-7805-review-p10-semantic-parent.test.ts`. The final finite harness starts exactly two parent and two child loaders, releases the private parent candidate as revision 2, and fails because the committed child still contains `{parentRevision: 1}` instead of 2. Controlled start signals and runaway-call sentinels exclude deadlock and accidental retry as explanations.
- Source cause: `createLoaderTask` is passed the fresh `semanticParent`, and the background candidate correctly receives it, but the blocking `shouldReload` context and foreground `loadResource` call use `tasks[index - 1]?.match`. For a background parent task that promise resolves to its stale foreground match, even though the function returns the candidate promise as the semantic chain for descendants.
- Independent reviews: client-lane primary, build/API, and adapters reviewers independently traced the mixed-mode promise graph; the isolated-test reviewer validated the corrected oracle and exact call counts. They agree a published child must be derived from the same parent generation that is published with it.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P11 — functional `ssr()` failure can skip lazy boundary readiness

- Prior claim: `match.ssr` remains undefined when functional SSR selection throws, so the later `match.ssr === true` guard does not load a lazy error/not-found boundary chunk.
- Required proof: sync and async functional `ssr()` failures on lazy routes rendered through a framework; test inherited `true`, `false`, and `data-only` policy and both error/not-found boundaries.
- Local failing regression: `packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx`, test `P11: a functional ssr failure renders its lazy error boundary`.
- Command: same focused React test command recorded under P07.
- PR-head result: **fails** with the built-in `Something went wrong!` UI instead of `lazy reports boundary: ssr selection failed`. The response status is correctly 500, isolating the failure to boundary readiness/rendering rather than error classification.
- Source flow: `contextualize` assigns `match.ssr` only after awaiting `resolveSsr`; a thrown option leaves it `undefined`. `applyFailure` selects the failing match, but terminal chunk readiness is guarded by `match.ssr === true`, so `loadRouteChunk(route, 'errorComponent')` is skipped.
- Completed review controls: independent reviewers confirmed inherited/default selective-SSR semantics, genuine lazy-route setup, and base serial-failure boundary readiness. N07's separate sync/async eager-boundary cases cover selector rejection timing without masking P11; the full policy/not-found matrix remains an implementation acceptance expansion in `PLAN.md`.
- Independent reviews: root primary reproduction; adapters reviewer independently confirmed the uninitialized `match.ssr` path, terminal-chunk guard, base boundary behavior, and inherited/default selective-SSR nuance; build/API reviewer independently confirmed sync/async selector rejection, genuine lazy-route setup, and base serial-error readiness. All three accept the failing test for the default/inherited-true case.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### P12 — redirecting flag survives a failed target build

- Prior claim: foreground/background redirect handling sets `tx.redirecting = true`, awaits `router.navigate`, and clears without `finally`; a thrown target-build hook leaves authority that an unrelated navigation can inherit.
- Required proof: make target location building fail, then start an unrelated navigation and inspect behavioral redirect-depth/cycle consequences. Cover synchronous and asynchronous failure only where the actual build APIs allow them.
- Focused regression: `packages/router-core/tests/pr-7805-review-p12-redirect-authority.test.ts`. Its control proves an independent A/B redirect cycle makes 21 loader calls before producing `Redirect cycle detected`. After a redirect whose target `search` builder throws, the otherwise identical unrelated cycle fails the oracle at 20 calls: the new transaction inherited the failed predecessor's depth. Alternating routes, the imperative no-history-subscriber commit fallback, bounded timers, and a runaway sentinel exclude same-URL test-helper behavior and unbounded recursion.
- Source cause: both foreground and background redirect paths set `tx.redirecting = true`, await `router.navigate(...)`, and clear the marker only on normal fulfillment. `loadClientRoute` treats any marked prior owner as chain authority at transaction construction. A target-build throw therefore leaves a stale authority marker on the old transaction.
- Independent reviews: client-lane, build/API, and adapters reviewers independently accepted the authority/finally analysis; the isolated-test reviewer validated the fresh-chain control and one-hop budget loss.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

## Prior-review coverage/audit items

### G01 — child-local `loaderDeps` identity coverage

- Prior assessment: no known production bug, but no direct test proves stable parent identity plus changed child-only deps reuses only the parent context.
- Focused passing test: `packages/router-core/tests/pr-7805-review-c-child-loader-deps-reuse.test.ts`. Its corrected setup proves the cached parent is a successful preload with a numeric `_preloadContext`, the planned navigation retains the exact parent match ID/donor, parent `beforeLoad` runs only with `preload:true`, child `beforeLoad` runs for versions 1 and 2 with `[true, false]`, the child loader runs twice, and final context/data are version 2.
- A first draft failed only because it incorrectly read a nonexistent `deps` argument from `beforeLoad`; that harness error was corrected and is not production evidence.
- This remains a test-only gap, not a production defect. Retain the passing focused test in the eventual test patch.
- Independent reviews: root authored/corrected and ran the case; client-lane reviewer independently confirmed its stable-parent/changed-child contract and complement to the inverse reuse test; adapters reviewer independently traced the cached donor, call sequence, docs contract, and committed context/data oracles. All accept it as durable missing coverage.
- Status: **COVERAGE-VALIDATED**.

### D01 — compile-time `isServer` conditional exports and dead-code elimination

- User-provided invariant: production `isServer` is a compile constant and bundlers are expected to eliminate the unreachable lane.
- Required audit matrix:
  - production browser resolves literal `false` and excludes server-lane implementation/sentinels;
  - production server resolves literal `true` and excludes unjustified client-only implementation where the public surface permits;
  - development resolves `undefined` and runtime-falls back to `router.isServer`, intentionally retaining both lanes;
  - Node conditions plus Vite/Rollup/Rolldown/esbuild resolution do not reorder the condition mapping.
- Aggregate bundle size is insufficient: inspect exact artifacts/symbols and execute lane-selection smoke tests.
- Local primary evidence: a production Vite 8/Rolldown server bundle (`ssr: true`, Node conditions, `ssr.noExternal: true`, production define) correctly includes the server lane, but also retains `load-client.js` with approximately 29.6 kB unminified rendered code and all three rendered exports (`transferMatchResources`, `loadClientRoute`, `preloadClientRoute`). Output sentinels include `executeClientLane`, `preloadClientRoute`, and `Redirect cycle detected`. An esbuild production/Node control independently retains the client lane; a production browser control retains only the client lane; a development control intentionally retains both.
- Source cause: `RouterCore` statically imports client-lane functions directly, and ordinary bundlers do not propagate the condition-selected literal far enough across that module boundary to prune those imported declarations. Runtime dispatch is correct; the verified defect is server-artifact reachability/DCE, not wrong lane execution.
- Focused regression: `packages/router-core/tests/pr-7805-review-c-server-dce.test.ts` now fails on the intended production Vite SSR module-graph assertion: `load-server.js` is present and exports `loadServerRoute`, but `load-client.js` is also rendered with exports `transferMatchResources`, `loadClientRoute`, and `preloadClientRoute`. The initial `import.meta.url` harness failure was corrected and is excluded from evidence.
- Independent reviews: build/API primary reproduced Vite and esbuild artifacts; adapters reviewer independently confirmed conditional export resolution, package `sideEffects:false`, and the documented compile-constant DCE contract; client-lane reviewer independently traced static imports/references and audited the focused Vite test's strengths and remaining matrix risks. All three accept this as a production-server artifact/DCE defect, not a runtime-dispatch defect.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

## Newly discovered hypotheses

Add new candidates here before beginning a lengthy investigation. Each must receive a new stable ID and remain in the ledger even if rejected.

### N01 — Vue global error boundary reset key is non-reactive

- Candidate: `MatchesInner` derives its global boundary `resetKey` through `Vue.computed(() => router.stores.matchStores.get(matchId)?.get().fetchCount)`. A raw TanStack Store `Atom.get()` does not establish Vue reactivity; the same-route root `matchId` remains stable, and after the boundary catches a render failure its failed subtree no longer supplies incidental subscriptions. A later `router.invalidate()` increments `fetchCount` but may never invalidate the computed key, leaving the fallback permanently mounted.
- Focused test: `packages/vue-router/tests/pr-7805-review-global-boundary-reset.test.tsx`. It fails by timing out while looking for `Recovered page`; the global `transient render failure` fallback remains mounted. A control proves the same root match's `fetchCount` increased after `router.invalidate()`, isolating the missing boundary reset from a failed reload.
- Required proof: focused Vue run fails exactly at recovered content, compare a `useStore`-backed selector control, and obtain two independent reviews of boundary ownership/reset semantics and the same-route setup.
- Independent reviews: adapters primary reproduction; client-lane reviewer independently confirmed base's reactive reset key, raw Atom behavior, and CatchBoundary semantics; build/API reviewer independently validated the same-ID dependency graph and recommended collision-safe ID+generation selection. All three accept the failure.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N02 — planning-time redirects bypass the transaction redirect budget

- Candidate: a redirect thrown while `matchRoutes` runs route `context()` is followed by `loadClientRoute` before a transaction exists, so it does not establish or increment the redirect-depth authority later enforced by lane reduction. A self redirect therefore recurses without reaching the finite `Redirect cycle detected` result.
- Focused regression: `packages/router-core/tests/pr-7805-review-n02-planning-redirect-budget.test.ts`. The safe harness subscribes history like a mounted adapter, permits 21 self redirects from route `context()`, and then throws an ordinary bounded sentinel. It fails because the sentinel is reached; a compliant twenty-hop chain would stop at 21 context calls without entering the bailout. The earlier OOM reproduction is explicitly excluded from evidence.
- Source cause: the `matchRoutes` catch in `loadClientRoute` follows a planning redirect before constructing `LoadTransaction`, and the recursive navigation has neither a redirect-depth parameter nor an authority transaction to inherit. Loader/beforeLoad redirects are reduced after transaction creation and therefore do use `tx.redirects`.
- Independent reviews: client-lane, build/API, and adapters reviewers independently traced preflight/planning ownership; the isolated-test reviewer validated mounted history behavior, the finite cap, and the negative sentinel oracle.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N03 — late preload child may outlive its semantic parent generation

- Candidate: a child preload reads parent revision 1 through `parentMatchPromise`; the active parent is then invalidated and commits revision 2 before the child finishes. The old preload must not publish/cache child data derived from revision 1 for later navigation.
- Focused regressions: `packages/router-core/tests/pr-7805-review-n03-preload-parent-generation.test.ts` contains two independently failing manifestations. In the late-publication case, a child preload observes parent revision 1, the parent commits revision 2, and the stale child is nevertheless cached and later navigated with one child call/data revision 1. In the in-flight case, the later navigation joins the same child flight keyed only by match ID and likewise publishes revision 1. Both expect a second child call and revision 2.
- Source cause: `LoaderFlight` and `router._flights` identify work only by child match ID; they carry no semantic-parent generation. Preload cache CAS checks active child IDs and cache object identity but not ancestry generation. Stable params/search/deps therefore allow a child result derived from an obsolete parent object to join or publish after the parent reloads under the same ID.
- Independent reviews: client-lane, build/API, and adapters reviewers independently accepted the parent-generation invariant and both source paths; the isolated-test reviewer corrected the call-count oracle and reproduced both failures separately.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N04 — superseded load awaits an obsolete component preload

- Candidate: a navigation blocks in a component's `preload`; a successor navigation commits a different route, but the first public load promise may remain unresolved until the obsolete component preload settles even though it can no longer publish.
- Focused regression: `packages/router-core/tests/pr-7805-review-n04-obsolete-component-preload.test.ts`. `/first` blocks forever in its component's `preload`; `/second` supersedes and commits, but the first public `router.load()` promise remains unsettled until the obsolete preload is manually released. The failure is `false` versus expected `true` after a successor commit and macrotask.
- Source cause: loader outcomes are abort-raced via `waitFor`, but `task.ready` directly awaits `loadRouteChunk(route)` through `chunkFailure`. `reduceLane` awaits that readiness even after the transaction controller is aborted, so `tx.done`, `loadClientRoute`, and callers remain coupled to an unabortable result that can no longer publish.
- Independent reviews: client-lane, build/API, and adapters reviewers independently traced supersession and readiness ownership; the isolated-test reviewer confirmed that public superseded loads are expected to settle once the current successor owns publication, while the underlying shared import may safely continue for cache reuse.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N05 — stale pre-commit background candidate leaks its flight lease

- Candidate: a foreground transaction can finish a stale reload into a private `lane.background[].candidate`, then lose ownership while awaiting `startViewTransition` before commit. The stale exits release only `result.matches`; the candidate is not in that array, and `runBackground` (whose losing CAS would release it) has not started yet.
- Source path: `createLoaderTask` creates the separate candidate and flight lease around `packages/router-core/src/load-client.ts:577`; stale exits around 1220 and 1231 transfer only foreground matches; supersession around 1395 transfers only the previous owner's matches; `runBackground` cleanup around 1146 is unreachable before commit. A zero lease is what aborts/removes the shared flight.
- Focused regression: `packages/router-core/tests/pr-7805-review-n05-background-candidate-lease.test.ts`. It settles a stale reload into a private background candidate, blocks before commit, commits `/other`, drains the losing load, and fails because the candidate loader's public abort signal remains live. A settled flight keeps its controller live until its last lease is released, making the signal a direct ownership oracle.
- Source cause: the candidate is stored only in `result.background[].candidate`. Stale exits before `commit` release `result.matches`, and supersession releases `previousOwner.matches`; neither includes private candidates. `runBackground` owns the later cleanup, but it is never scheduled when currentness is lost before the commit closure runs.
- Independent reviews: client-lane, build/API, and adapters reviewers independently audited candidate creation/lease transfer and the stale exits; the isolated-test reviewer reproduced the leaked signal and completed the control/error-exit symmetry audit.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N06 — global error boundary reset key may miss child-only background recovery

- Candidate: React and Solid global CatchBoundary reset keys are derived from the root match identity/generation; Vue's N01 repair is likely to use the same shape. A child-only stale-while-revalidate success in `runBackground` replaces only the child candidate in `base.slice()`, preserving the exact root object and its `fetchCount`. If stale child rendering latches the global boundary and the background child later becomes healthy, the committed recovery may not change the reset key.
- Source distinction: a route-local child boundary observes the child's generation and is not the target. The reproduction intentionally omits a route error component so the global boundary owns the thrown render error. Base/main keyed the global boundary with reactive public `loadedAt`, but the exact child-only SWR publication introduced/exercised here was not reproduced on base and base did not advance `loadedAt` for a later SWR completion. N06 is therefore a current-head correctness failure, not evidence that public `loadedAt` historically had background-generation semantics.
- Focused regression: `packages/react-router/tests/pr-7805-review-global-boundary-background-reset.test.tsx`. The hardened run fails only at finding `Recovered child revision 2`. Before that assertion it proves exactly two loader calls; foreground stale data 1; background child data 2; unchanged root object and `fetchCount`; replaced child object with `fetchCount + 1`; idle `/child`; and no unexpected warnings/errors. The global fallback remains latched.
- Independent reviews: adapters primary authored and source-traced the candidate; isolated client reviewer independently confirmed global (not route-local) boundary ownership and the child-only `runBackground` publication; client-lane reviewer independently audited `CatchBoundary` reset semantics and the hardened controls; root ran and inspected both versions. All accept the defect across the root-only key shape used by React, Solid, and Vue.
- Repair direction: use one private reactive committed-match-tree revision that changes for every accepted foreground/background semantic publication, but not pending presentation, preload/cache-only, or losing lanes. Coordinate N01 with that signal, while preserving P02's separate historical `loadedAt` contract.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N07 — functional SSR failure may erase context seen by the selected boundary

- Candidate: `executeServerLane` copies matches with `context: {}` before `contextualize`. That function invokes/awaits a functional `ssr()` selector before rebuilding `match.context` from router, parent, and `__routeContext`. If the selector throws, the error match may retain `{}` even after P11 makes its lazy boundary ready. A boundary component, boundary `head`, or `useRouteContext` could therefore observe missing router/route context.
- Base comparison: base/main kept the route-matched context through the serial failure path. The focused reproduction renders through the public React server request path and public route-context hook rather than relying on private match fields.
- Focused regression: `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx`, sync and async N07 cases. Both return the correct 500 and render the eager route boundary with the correct selector error, but fail because the boundary receives `|||||no-failing-beforeLoad` instead of router context, layout route context, completed ancestor `beforeLoad` context, and failing-route static route context. The failing route's own `beforeLoad` remains at exactly zero calls, proving the expected fix must not fabricate it. The eager boundary isolates this from P11's lazy-boundary readiness defect.
- Source cause: `executeServerLane` resets every planned match to `context: {}`; `contextualize` awaits `resolveSsr(route.options.ssr, ...)` before assigning the current match's parent + `__routeContext` context. A synchronous throw or rejected selector exits before assignment. Completed ancestors have valid context in the serial parent chain, but the selected failure match never receives it.
- Independent reviews: adapters, isolated-server/test, client-transaction/server, and root reviews independently traced the ordering and accepted the public boundary contract; three separate test authors converged on the same eager-boundary isolation before consolidation.
- Acceptance-oracle correction: the final feasibility audit rejected returned redirect/cancellation selector controls because a functional `ssr()` selector may return only `undefined | SSROption`. The plan now covers ordinary sync throws/async rejections and only supported thrown/rejected redirect/not-found terminal sentinels; it does not invent a broader selector API.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N08 — hydrated unresolved frontier may retain incomplete parent context

- Candidate: `hydrate.ts` includes the first serialized `ssr:false` or `pending` match in `presented` but not `committed`; context rebuilding iterates only the committed prefix. The visible frontier fallback may retain context from initial client `matchRoutes`, before serialized parent `__beforeLoadContext` is installed, while the server gave that frontier the complete parent context.
- Focused regression: `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx`, N08 case. It runs a real server router load, proves the `ssr:false` child loader is skipped, proves the server pending match/fallback contain `server-authenticated|child-route-context`, dehydrates the real bootstrap, and calls client `hydrate`. Before mounting, the presented child remains `status:'pending'`/`ssr:false` but fails because its context contains only `childToken`; the transported parent `auth` value is absent. A gated client loader and hydration diagnostic checks remain after the core assertion so the eventual repair must also preserve DOM hydration.
- Source cause: hydration reconstructs context only while iterating `committed`. It deliberately includes one non-committed `ssr:false`/pending frontier in `presented`, but that match keeps its initial client `matchRoutes` context from before serialized ancestor `__beforeLoadContext` was installed.
- Contract boundary: semantic adoption, chunks, head/scripts, and resolved location must remain capped at the committed prefix; only the already-presented frontier needs a context projection from the rebuilt parent plus its existing `__routeContext`/serialized `__beforeLoadContext`. Client replanning still owns loader execution and terminal semantics.
- Independent reviews: adapters, isolated-server/test, client-transaction/server, and root reviews independently accepted the server/client consistency contract and the prefix-vs-presentation distinction; three independently authored real dehydration/hydration proofs converged before consolidation.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### N09 — route-level component preload memoization was removed

- Candidate: the old `loadRouteChunk` used `_componentsLoaded` and `_componentsPromise` to call the normal `component`/`pendingComponent` preloads once and coalesce concurrent callers. The rewrite deliberately calls their public `.preload()` methods again for every normal `loadRouteChunk`, including every waiter joined to one lazy-route import.
- Counterevidence/declared contract: the new `packages/router-core/INTERNALS.md` explicitly says there is deliberately no component-promise cache because dynamic imports and framework wrappers already cache module work. The React/Solid/Vue `lazyRouteComponent` implementations do coalesce an in-flight import. The new component-preload retry regression also depends on core re-invoking `.preload()` after failure, so restoring the old latch would regress retry semantics.
- Contract check performed: reviewers separately compared custom `AsyncRouteComponent.preload`, sequential success, concurrent calls, and retry-after-rejection to determine whether the old route-level once/deduplication behavior was compatibility surface. The result is recorded in the falsification paragraph below; no open investigation remains.
- Independent falsification: root, adapters, and isolated client reviewers independently compared base, current wrappers, public docs/types, and the new retry contract. Base suppressed later normal route-chunk passes after success but permanently latched a rejected `_componentsPromise`; it did not establish a general public at-most-once contract. Direct framework-wrapper `.preload()` calls can already reinvoke their importer after success, while in-flight calls coalesce and native module loading caches success. The public `AsyncRouteComponent` surface promises only a callable promise-returning preload, not call-count semantics.
- Non-blocking note: document that custom preload functions must tolerate repeated calls, and retain wrapper-level concurrent coalescing plus retry-after-rejection coverage. A supported component demonstrating duplicated semantic/network harm could reopen this as compatibility/performance policy, but callback count alone is not a correctness oracle.
- Status: **NOT-VALIDATED**. Do not add N09 to `PLAN.md` and do not write a once-only failing test that would reintroduce base's permanent rejection latch.

### N10 — same-ID flight join may ignore the route's freshly rerun own context

- Failure: `packages/router-core/tests/pr-7805-review-n10-inflight-preload-own-context.test.ts` starts a gated child preload under stable ancestry and `beforeLoad` context version 1, then starts navigation to the same match ID while that loader is pending. Navigation correctly reruns `beforeLoad` and produces context version 2, but the child loader runs only once under version 1 and final state combines context version 2 with loader data version 1. The focused isolated Nx run fails on the exact two-loader/final-v2 assertions, with no type or setup errors.
- Source cause: `executeClientLane` provisionally attaches `router._flights.get(match.id)` before contextualization. The navigation then computes its fresh route/beforeLoad context, but `loadResource` accepts the already-attached flight by ID and joins its v1 result. Match ID covers route/path/loaderDeps, not route-context or beforeLoad-context provenance, so identity is not a loader-input compatibility proof.
- Distinction from N03: N03 changes an accepted parent generation. N10 keeps the parent stable and changes the child's own post-contextualization inputs. A repair keyed only by parent generation therefore leaves this independently reproduced context/data split.
- Contract: the preload is still pending, so it cannot donate completed beforeLoad context. Public loader semantics promise that `loader({context})` receives the accepted route and beforeLoad context for that load. Once navigation has rerun context to version 2, it may not publish data calculated from version 1 merely because the match ID is unchanged. The effective-input provenance must cover both `__routeContext` and `__beforeLoadContext`.
- Independent reviews: the isolated test author reproduced the failure and checked the public context/preload contract; the final-plan auditor independently traced the provisional join; the artifact/source auditor independently derived the same context/data mismatch; root source review confirmed the ID omission and final publication path. All accept the exact failing oracle.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

## HMR and test-quality hypotheses

### H01 — explicit source-chained lazy importer may not refresh under HMR

- Candidate: `handleRouteUpdate` clears `oldRoute._lazy` but intentionally does not copy `newRoute.lazyFn`. This is correct for generator-owned `.lazy()` mutation because the fresh source export does not contain that generated importer and the live route should retain its generator wiring. A source file that explicitly returns `createFileRoute(...)(...).lazy(newImporter)`, however, may keep the old importer after HMR.
- Focused regression: `packages/router-plugin/tests/handle-route-update.test.ts`, `uses the new source-chained lazy importer during a hot refresh`. It performs a real client load with `oldImporter`, hot-updates the route to `.lazy(newImporter)`, and lets the real `_refreshRoute` rematerialize. It fails because `hotRoute.lazyFn` is still the old function; the old importer is invoked twice and the new importer zero times (the first identity assertion reports the failure before the call-count assertions).
- Source cause: public `Route.lazy()` stores its argument on `route.lazyFn`, outside `route.options`. `handleRouteUpdate` copies only `newRoute.options`, clears `oldRoute._lazy`, and refreshes. Clearing the materialized value therefore reloads through stale `oldRoute.lazyFn`.
- Independent reviews: build/HMR primary, client-lane reviewer, and adapters reviewer independently confirmed the public chaining contract, real refresh path, and missing field transfer. All also flag a provenance constraint: generated route trees install their own lazy importer on the live route while the freshly imported source route lacks one, so unconditional `oldRoute.lazyFn = newRoute.lazyFn` would break generated lazy routes and cannot detect explicit source removal.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED**.

### T01 — Vue root pending test has no pending assertion

- `packages/vue-router/tests/Matches.test.tsx`, test named `should show pendingComponent of root route`, only waits for final content; it never asserts either the root or default pending component.
- Its explanatory comments describe Vue as only handling thrown promises and unable to show the initial pending state, while this PR changed `MatchInner` to render `status === 'pending'` directly. The name/comments therefore do not match the oracle or current implementation.
- Required hardening: gate the loader, assert the intended root pending UI (and exclusion of the default fallback if that distinction matters), release, then assert final content and event ordering.
- Independent reviews: build/test primary found the mismatch; adapters reviewer independently checked the new direct-pending render path; client-lane reviewer independently confirmed the test never queries either pending component. All agree the test passes if pending rendering is deleted.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**; this does not prove Vue pending rendering currently fails.

### T02 — preload-redirection selector-count tests do not isolate preload

- React, Solid, and Vue `store-updates-during-navigation.test.tsx` variants immediately capture selector call counts after `render(<RouterProvider>)` without awaiting initial idle/resolved `/`. The measured delta for `preload redirect` can include initial provider-load publications. Expected calls were rebaselined from 1 to 2 even though the test's own rule says increases require investigation.
- Required hardening: await initial content plus router idle/resolved location, clear/baseline the selector spy, execute only the preload, then assert the active semantic `RouterState` snapshot remains unchanged. Treat exact render/call count as a secondary performance signal, not the primary correctness oracle.
- Acceptance-oracle correction: the final feasibility audit traced the actual redirecting preload contract. `/posts` executes and redirects once, the preload follows it and publishes one successful non-active `/other` match to `router.stores.cachedMatches`, and no redirect object is retained in public `RouterState`. The plan therefore observes that exact cache-store publication separately while requiring zero aggregate-state notifications.
- Independent reviews: build/test primary identified the unexplained rebaseline; adapters and client-lane reviewers independently traced each framework's setup and confirmed it returns immediately after provider render while initial `router.load()` is still scheduled/running. All agree `+2` is not attributable to preload alone.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED BOGUS-ORACLE**; this is not proof of excess production notifications until the isolated test is rerun.

### T03 — issue 7120 E2E lacks a View Transition/stale-frame oracle

- `e2e/react-router/issue-7120/tests/issue-7120.repro.spec.ts` proves eventual `/posts`, pending disappearance, and no logged errors, but does not assert that `document.startViewTransition` exists/was invoked or that stale Home content never appears transiently. The test could pass while skipping the regression's named View Transition path.
- Required hardening: instrument/wrap `startViewTransition` before application code, assert invocation/update completion, and record DOM frames/mutations from pending through target to prove no stale Home/old match commits.
- Independent reviews: build/test primary audited the new E2E against the issue path; root independently traced its assertions and fixture; adapters reviewer independently confirmed that both a missing View Transition implementation and a transient stale commit satisfy every current assertion. All three agree the test is non-diagnostic for its named regression.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**. This is a test-suite defect, not independent proof that the production bug remains.

### T04 — issue 7457 E2E does not detect transient blank presentation

- `e2e/react-router/issue-7457/tests/issue-7457.repro.spec.ts` proves the pending component mounted at some point, eventual `/another`, and no errors. It does not sample the interval between pending and target, so a blank frame—or transient index content—still passes a test named `does not blank`.
- Required hardening: install a pre-navigation MutationObserver/requestAnimationFrame log and assert every observed presentation contains either pending or target, never the index route and never an empty app root.
- Independent reviews: build/test primary identified the endpoint-only oracle; root independently inspected the fixture and assertions; adapters reviewer independently demonstrated that `__pendingSeen === true` plus final target visibility says nothing about intervening presentations. All three agree the current test cannot catch the named blank-frame regression.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**. This is a test-suite defect, not independent proof that the production bug remains.

### T05 — Solid issue 7283 does not assert `pendingMinMs`

- The route configures `pendingMinMs: 1500` and records event timestamps, but `issue-7283-dev-hydration.spec.ts` discards timestamps and checks only `pending-mounted -> pending-unmounted -> target-mounted`. It would pass if the minimum duration were ignored.
- Required hardening: retain timestamps and assert pending visible duration against 1500 ms with a documented scheduling tolerance, while keeping the existing hydration-error and final-target assertions.
- Independent reviews: build/test primary found the discarded timing signal; root independently verified the route constant and event mapping; adapters reviewer independently confirmed that an arbitrarily short pending flash satisfies the current order-only assertion. All three agree the configured minimum is untested.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**. This is a test-suite defect, not evidence that `pendingMinMs` currently fails at runtime.

### T06 — existing generic lazy retry tests miss recognized module errors

- Existing React/Solid/Vue component-preload retry tests throw generic `component download failed` errors, so they do not enter module-not-found reload/session-storage behavior. This allowed P06 to pass unnoticed.
- The retained P06 failing regression now directly covers the recognized branch; two independently authored drafts were consolidated. Retain it and add an integration-level route/error-boundary version when implementing P06.
- Status: **VERIFIED WITH P06**.

### T07 — preloaded-mount race test documents but does not reproduce original race

- React `preloaded-mount-resolution.test.tsx` explicitly says the original timing race is nondeterministic and pins only the settled-before-mount contract, delegating deterministic guarding to a benchmark. This is honest but leaves the original interleaving without a deterministic unit regression.
- Required proof/hardening: replace timing with controlled commit/mount gates or expose a deterministic scheduler seam; otherwise keep this as a documented coverage caveat, not evidence the race itself is fixed.
- Independent reviews: build/test primary, adapters reviewer, and client-lane reviewer separately confirmed the current case strongly covers “settled before mount” but cannot force “settles during mount/effect batching,” which was the original race. All retain the current test and classify only the missing deterministic case.
- Scheduler-oracle correction: two final independent audits rejected an earlier mock schedule that let loader microtasks run before the initial MatchesInner layout effect. The final plan now executes all three initial queued layout callbacks synchronously in real commit order, starts the initial load from Transitioner's own mount callback, lets the initial acknowledgement harmlessly run before any final transition waiter exists, and only then releases the fast loader in the post-layout microtask batch. The next match commit's acknowledgement is the one that must settle the captured direct `router.load()` promise; no `commitLocationPromise` is created.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED COVERAGE-GAP**; no runtime regression is claimed.

### T08 — pending replacement coverage is uneven across adapters

- React and Solid cover child/root pending-promise replacement; Vue covers root only. Solid has an explicit same-route stale-content/no-fallback test, while React/Vue lack direct parity.
- Required hardening: add a table-equivalent matrix for root/child replacement, same-route stale-content retention, and no-fallback behavior across all three adapters, using framework-appropriate render flushes.
- Independent reviews: build/test primary, adapters reviewer, and client-lane reviewer independently enumerated current HEAD and reached the same framework matrix. All classify this as factual coverage parity debt, not evidence that uncovered adapters are broken.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED PARITY-GAP**.

### T09 — React issue-7051 tests leave transaction setup/settlement ambiguous

- `issue-7051-force-pending-suspense.test.tsx` renders `RouterProvider` and then explicitly calls `router.load()` instead of first awaiting provider-driven initial idle, allowing overlapping initial loads to affect the force-pending setup. Its second case discards the `/first` navigation promise and awaits only `/second`, so a superseded predecessor can remain stuck without failing the test.
- Required hardening: await initial UI/idle without a second explicit load; capture both navigation promises; assert predecessor remains pending only while the successor is active and drain both after successor settlement, with bounded cleanup.
- Independent reviews: adapters reviewer found the setup; root independently confirmed the immediate explicit load and discarded promise; isolated client reviewer independently traced provider effect startup and proved both the redundant initial load and unobserved predecessor settlement can regress without failing current assertions.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**. This is not evidence that current production settlement hangs; it establishes that the added regressions do not exclude that failure.

### T10 — React listener-error test does not prove the throwing listener executed

- `transitioner-listener-errors.test.tsx` registers a listener that should throw for `/first`, but records neither invocation nor the thrown error. Later-listener and route-hook assertions all pass if the first subscriber is accidentally skipped, so the test cannot distinguish “error was isolated” from “throwing callback never ran.”
- Required hardening: wrap the throwing callback in a spy/log, assert its exact `/first` event before/alongside the later subscriber, and assert the router reports/contains the deliberate exception according to the emitter contract without swallowing unrelated errors.
- Independent reviews: adapters reviewer found the missing oracle; root independently confirmed no assertion reaches the first listener; isolated client reviewer independently proved every current UI/hook/later-listener assertion still passes if the first subscriber is deleted or skipped.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED BOGUS-ORACLE**. The production emitter currently catches and reports subscriber errors, but this test never proves that path ran.

### T11 — Vue pending-loader abort test is slow and under-specified

- `packages/vue-router/tests/loaders.test.tsx`, `navigating away from pending UI aborts its loader`, waits roughly three seconds of real timers, asserts only that pending and abort callbacks ran at least once, and does not capture the signal, exact loader/abort counts, predecessor promise, final idle/resolved location, pending removal, or absence of stale Foo UI.
- Required hardening: replace sleeps with controlled start/reveal/abort promises or fake time, retain both navigation promises/signals, assert exact once abort plus no error publication, drain both, and assert idle `/bar`, pending/Foo absence, and Bar presence.
- Independent reviews: adapters reviewer found the weak slow test; root independently confirmed its real-timer and at-least-once oracles; isolated client reviewer independently measured the 30 × `WAIT_TIME` pre-navigation sleep and confirmed the test observes neither exact abort ownership nor either public navigation's settlement.
- Acceptance-oracle correction: the final feasibility audit confirmed that a fulfilled loader may still be retained by its committed match's flight. The adjacent control therefore requires the signal to stay live while Foo owns that match, then abort exactly once when Bar unloads Foo and releases the final lease; it does not incorrectly equate loader completion with permanent signal immunity.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED TEST-GAP**. This is a deterministic-test and liveness-oracle defect, not proof that Vue currently aborts incorrectly.

### T12 — pending-preload reuse test codifies a context-insensitive loader join

- `packages/router-core/tests/preload-beforeload-reuse.test.ts`, `keeps beforeLoad independent while joining a pending preload loader`, expects two `beforeLoad` calls but only one loader call. Its loader returns a shared string without reading `context`, so it cannot detect the impossible state where navigation publishes fresh context beside data computed under the preload's older context.
- N10 supplies the negative proof: under the same pending-preload shape, a loader that snapshots its public context exposes version-1 data beside version-2 match context. Thus the existing one-loader expectation is not merely incomplete; it encodes the unsafe join as success.
- Required hardening: split safe reuse from incompatible reuse. Keep a one-loader control only when navigation adopts the same completed semantic input generation. For a still-pending preload whose own route/beforeLoad context is rerun, require a second loader and coherent final version-2 context/data. Gate both generations and drain them in `finally`.
- Independent reviews: isolated client/test, final-plan, artifact/source, and root reviews independently compared the existing oracle to N10's public-context reproduction. All agree the context-insensitive return value masks the defect.
- Repair plan: see `PLAN.md`.
- Status: **VERIFIED BOGUS-ORACLE**; N10 is the production defect, not a second runtime finding.

## Post-optimization preservation audit — 2026-07-18

After the PR-scoped bundle-size changes, every retained review regression was rerun to prove that optimization work had not silently fixed, masked, or overwritten an outstanding PR issue:

- Router Core: 14 review files produced 12 failing files and two passing controls; 13 cases failed and three passed, including the P02 type fixture's four missing-state-field diagnostics.
- React Router: five review files retained eight failing cases.
- Vue Router: two review files retained two failing cases.
- Solid Router: one review file retained one failing case.
- Router plugin/HMR: H01 retained its single failing source-chained-importer case.

The final ledger therefore remains **25 failing cases in 21 failing files**, with all failures attributable to their previously documented behavioral oracle. G01 and P09 remain passing controls. No issue status or repair-plan eligibility changed, and no production defect in this ledger was fixed by the bundle-size work.

## Review coverage inventory

This inventory reconciles the complete 210-file `base...head` diff. “Reviewed” means the changed source/assertions were compared with their callers, lifecycle contract, and adjacent tests; it does not mean every test was executed.

- **Router core production (review complete):** `Matches.ts`, `router.ts`, `stores.ts`, `route.ts`, `redirect.ts`, `route-chunks.ts`, all three `isServer` condition modules, `load-client.ts`, `load-server.ts`, `hydrate.ts`, generic SSR client/server/request-handler code, deletion of `load-matches.ts`, and the new `INTERNALS.md`. Client transactions received overlapping client-lane, build/API, adapters, isolated-test, and root audits. Server/hydration received the same overlapping treatment; N07 and N08 were validated with the consolidated real SSR/dehydration/hydration tests, while N09 was independently rejected.
- **React production (reviewed):** `Match`, `Matches`, `Transitioner`, `lazyRouteComponent`, both SSR renderers, and package exports/dependencies. Findings: P03, P06, P07, N06 plus React integration evidence for core N07/N08; no other production candidate survived review.
- **Solid production (reviewed):** `ClientOnly`, Match/Matches/Transitioner, lazy retry, match context/stores/useMatch, and both SSR renderers. Findings: P05/P07 and structural N06 exposure; no other production candidate survived review.
- **Vue production (reviewed):** Match/Matches/Transitioner, lazy retry, match context/stores/useMatch, and both SSR renderers. Findings: P05/P07/N01 and structural N06 exposure; no other production candidate survived review.
- **Router plugin/HMR (reviewed):** handler source, Vite/Webpack injection, all changed snapshots, handler tests, and route-generator lazy wiring relevant to provenance. Finding: H01.
- **Secondary production/config (reviewed):** Start generic redirect short-circuit, devtools age/state migration, memory benchmark change, package manifests/lockfile, preload documentation, scroll restoration, special-character route, selective-SSR fixtures, generated route trees, and the issue-7120/7457 fixtures/config. Findings are limited to T03-T05's test oracles; build/API review found the implementation/config changes otherwise coherent.
- **Router-core tests (reviewed by behavior family):** adversarial transaction/currentness, background assets/trim, chunks and failure lifecycle, granular stores/callbacks, hydration prefix/currentness/assets/boundaries, preload cache/adoption/signals/context, redirect/planning, server selection/errors/headers, and supersession. New focused tests in this worktree cover every verified production issue; G01 and P09 are passing controls. Consolidated N07/N08 integration tests fail at both the core state and public rendering oracles without unhandled diagnostics.
- **Adapter tests (review complete):** pending/root/child/minimum/replacement, hydration, error/not-found boundaries, lazy retries/chunk errors, loader aborts, redirects, transition acknowledgements/remount/listener errors, state-selector counts, links/router/useNavigate, and server rendering. Verified weaknesses are T01-T11 as categorized above; no additional adapter production candidate survived independent review.
- **E2E tests (reviewed):** issue 7120, issue 7457, React Start #4614/special characters/selective SSR, Solid selective-SSR #7283, and scroll restoration. T03-T05 require hardening; the remaining scenarios were accepted by build/API and adapter audits.

The diff list used for reconciliation is `git diff --name-status 0b178a79...6683863a`; it contains 71 router-core, 34 React, 24 Solid, 23 Vue, 13 router-plugin, 39 E2E, two devtools, and four documentation/benchmark/Start/lockfile files.

## Worktree notes

- Immediately after switching from detached `4c425e0` to the PR branch, 14 generated benchmark `routeTree.gen.ts` files briefly appeared modified only by generated ordering. They later disappeared from `git status`; none is currently modified, staged, or used as review evidence.
- Review-created regression tests and `ISSUES.md`/`PLAN.md` are intentional local changes. Production-source fixes are forbidden for this task.
