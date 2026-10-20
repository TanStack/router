# Bundle size investigation

Read this log before another experiment. Update it with the measured result and
decision, including unsuccessful attempts. Search by mechanism before retrying a
different spelling of the same approach.

## Reference sizes

Updated 2026-10-21; reference builds span October 18–21, with Node 26.10.0,
pnpm 11.21.0 and the same installed dependencies. All numbers are bytes.
The primary metric is **total application
JavaScript gzip**, summed across separately compressed files, for
`react-start.minimal`.

| Source                        | Total gzip | Initial gzip |     Raw | Brotli |
| ----------------------------- | ---------: | -----------: | ------: | -----: |
| Main `b1b111761bdf`           |     99,109 |       98,970 | 309,641 | 86,129 |
| Original PR `1ca9150440cc`    |     99,555 |       99,414 | 310,847 | 86,441 |
| Retained `83e38a349dc5`       |     99,714 |       99,574 | 311,434 | 86,664 |
| Serial cleanup `ee5df0122640` |     99,688 |       99,549 | 311,317 | 86,585 |
| Current `3b3fa2f5c787`        | **99,720** |       99,581 | 311,434 | 86,683 |

At `83e38a349dc5` the increase over main was **605 gzip bytes**: **446** from the
original PR and **159** from subsequent fixes and optimizations. The
serial cleanup below is committed at `ee5df0122640`. Run `cc-final-v2` and
the fresh `ss-baseline` reproduce its **26-byte** reduction, leaving **579** over
main. The target, 100 bytes below the original PR, is **99,455**. Current
`3b3fa2f5c787` measures **99,720**: **32 above the previous committed runtime**,
**165 above the original PR**, **611 above main**, and **265 above the target**.
The target remains unmet. The approved private-codec policy costs 47 bytes;
three separately committed simplifications recover 15, leaving the net 32.
The full BEFORE/AFTER workflow and final all-18 pass reproduce these metrics
(`ss-codecs-before-all`, `ss-codecs-after-all`, `ss-codecs-final-all`). Router-only
`react-router.minimal` remains **86,247**, down 26 from the earlier 86,273-byte
reference. No runtime metadata filter is retained.

Reference runs: `review-6631-base-20261018` in the main review checkout;
`review-6631-head-20261018`; `fixes-r3-retained-v34-final` (all 18 scenarios);
`fixes-r3-restored-retained-v45` (exact scoped replay). The final restoration run,
`fixes-r3-bundle-log-restored-final`, again reproduces all four retained metrics.
Named runs live under
`benchmarks/bundle-size/results/runs/<name>/`; main was measured in
`/tmp/pr6631-base-review`. The original head was independently rebuilt at 99,555.

## What accounts for the increase?

The main source is `packages/router-core/src/load-client.ts`. Source maps assign
these **minified raw bytes**, not gzip costs:

| Source        |   Main | Original PR | Retained | Change from main |
| ------------- | -----: | ----------: | -------: | ---------------: |
| `load-client` | 19,514 |      20,705 |   21,232 |       **+1,718** |
| `router`      | 16,374 |      16,404 |   16,416 |              +42 |
| `utils`       |  3,168 |       3,166 |    3,204 |              +36 |

`load-client` accounts for about 96% of the application's **+1,793 raw bytes**.
There is no added client dependency. Server execution code and erased types do
not account for these client bytes. Small attribution changes in unchanged
dependencies reflect generated names/layout; they are not dependency changes.

Two diagnostic builds replace complete functions with their main versions while
keeping the rest of the current source. This produces an **ordered attribution**:

| Step                                                        |   Gzip | Increment |
| ----------------------------------------------------------- | -----: | --------: |
| Main                                                        | 99,109 |         — |
| Current remainder, main `contextualize` and `hydrate`       | 99,190 |   **+81** |
| Restore current normal `contextualize`, keep main `hydrate` | 99,366 |  **+176** |
| Restore current `hydrate`                                   | 99,714 |  **+348** |

Thus approximately 348 bytes belong to hydration reconstruction, 176 to normal
context execution, and 81 to the remaining changes **in this replacement order**.
The groups include changes to shared helpers' reachability. They are not
independently compressible feature prices. Different ordering, minifier names
and gzip dictionaries can change each marginal.

The normal-context group adds object dispatch, async context, revalidation,
redirect parity and memo persistence for contexts completed before a lane commits.
The hydration group selects transported values, transforms or handler reruns;
merges serial context; and coordinates parallel loader outcomes and recovery.
The minimal app has no lifecycle codecs, but runtime option inspection keeps
these general library paths reachable. Merely avoiding the API in this app does
not remove their implementation.

## Are we duplicating the `ssr: false` loader path?

Loader execution already shares `loadResource`, argument builders,
`getParentSnapshot`, cache/resource ownership helpers and `projectLane`.
Hydration has separate **planning and recovery**, rather than a second loader
generation/normalization engine.

- With full SSR or `data-only`, hydration reconstructs the server's accepted
  matches: use transported values, call `hydrate`, or rerun omitted handlers.
  Accepted results are adopted without executing them again in the initial lane.
- At an `ssr: false` boundary, `beforeLoad` and loaders run through the ordinary
  initial client lane. Hydration only prepares the first visible pending route's
  context early; the normal lane reuses that context contribution.
- After reconstruction failure, the normal lane retries the failed boundary and
  descendants. This intentional retry can repeat failed reconstruction work.

Normal `createLoaderTask` also chooses stale/background work, donors, component
readiness and cache admission. Calling it unchanged during reconstruction would
apply policies for a different situation. A transport-aware common executor could
still remove duplicated loops, but must separate those policies explicitly.

Identity checks, structural/accepted prefixes, concurrent chunks, chunk-failure
retry, selective-SSR assets and the two-phase handoff already existed on main.
Their whole source size cannot be charged to this PR.

## Measured scope and guarantee tradeoffs

Each row, including combinations, is compared against **99,714**. These are
isolated diagnostic builds, **not approved feature removals or ready fixes**.
Package/app builds and byte attribution pass; runtime/types/e2e equivalence is
not claimed for behavior-removal prototypes. Never sum independent gzip savings.

| Cut or simplification                                      |       Gzip |  Saving | Observable cost / required decision                                                                                                                            | Run suffix                                 |
| ---------------------------------------------------------- | ---------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| No early context-only memo-cache admission                 |     99,640 |      74 | A completed preload/redirect context may rerun later. Removes its stale-committed-context protection too; successful loader cache remains.                     | `v2-10-no-speculative-context-cache`       |
| Discard completed descendant data on recovery              |     99,672 |      42 | Failure recovery may refetch otherwise reusable descendant data. Success-path parallelism remains.                                                             | `v2-11-no-recovery-data-cache`             |
| Require rendered loader data to be transported             |     99,704 |      10 | Removes omitted-loader reruns inside hydration; loader codecs still need the loader pass.                                                                      | `v2-12-no-rendered-loader-rerun`           |
| Remove lifecycle-specific `hydrate` functions              |     99,682 |      32 | Custom adapters must provide client-ready values. Omitted-handler reruns remain. Server/type/compiler rules would also need adjustment.                        | `v2-13-no-hydrate-codecs`                  |
| Remove the entire hydration loader pass                    | **99,498** | **216** | Rendered loader data must be transported and client-ready: no loader codec or omitted-loader rerun. Context/beforeLoad codecs and `ssr: false` loaders remain. | `v2-14-no-hydration-loader-pass`           |
| Defer unresolved-route context to the normal lane          |     99,705 |       9 | Initial pending/head callbacks see existing matched context, often empty. The suffix memo-copy code is still present in this measurement.                      | `v2-15-defer-unresolved-context`           |
| Synchronous normal context handler and revalidate callback |     99,686 |      28 | Removes async context pending/cancellation handling. Async hydration transforms remain.                                                                        | `v2-16-sync-normal-context`                |
| Reuse generic cancellation wait                            |     99,689 |      25 | More per-wait Promise/listener work; scheduling and retention equivalence not established.                                                                     | `v3-17-generic-hydration-wait`             |
| Serialize hydration loaders/transforms                     |     99,701 |      13 | Loses parent/child overlap and can waterfall network work; early failure also prevents descendant starts.                                                      | `v3-18-serial-hydration-loaders`           |
| No loader pass + no early context memo admission           |     99,426 |     288 | Combines both restrictions; client-ready transported loader data required.                                                                                     | `v3-19-loader-pass-and-context-memo-cut`   |
| No loader pass + no recovery data cache                    |     99,453 |     261 | Combines both restrictions; only two bytes below the old target in this diagnostic form.                                                                       | `v3-20-loader-pass-and-recovery-cache-cut` |
| No loader pass + both cache cuts                           |     99,378 |     336 | Largest tested cut; gives up loader codecs/reruns and both reuse policies.                                                                                     | `v3-21-loader-pass-and-both-cache-cuts`    |
| Both cache cuts, keep all codecs and parallelism           |     99,593 |     121 | Narrows reuse without removing lifecycle APIs; still 138 bytes above target.                                                                                   | `v3-22-both-cache-cuts`                    |

Run names have prefix `bundle-log-`. The two attribution hybrids are
`bundle-log-v2-00-main-context-and-hydrate` and `bundle-log-v2-01-main-hydrate`.
The combined measurements demonstrate the gzip interaction: both cache cuts save
121 bytes, rather than 74 + 42. Combining removal of the loader pass with recovery
cache removal reaches 99,453, but its two-byte target margin is not a forecast for
a complete server/type/compiler/API change. None of these diagnostic target
crossings establishes a viable behavior-preserving optimization.

The large saving comes when the **whole loader reconstruction pass disappears**.
Dropping only omitted-loader reruns (10 bytes) or codec dispatch (32 bytes) leaves
its orchestration in place. Custom serialization adapters cannot replace codecs
that depend on route context or `parentMatchPromise` without an API change.

Consider exceptional-path descendant reuse first if reducing guarantees is
acceptable. Removing early context memo persistence has a larger price, but
changes normal preloads as well as hydration. Both were deliberately supported;
neither should be removed as a silent optimization. Pending-context timing and
synchronous-only context give relatively small savings for broader restrictions.

Other architectural directions remain unmeasured unless a later result is noted:

- Narrowing the supported codec API was subsequently approved and measured
  below. Extra lifecycle fields may remain at runtime. Mandatory filtering
  grew the bundle and was superseded; the current private-flight/passthrough
  draft also remains larger than committed code. These are no longer
  unmeasured byte-saving claims.
- Use one transport-aware executor with distinct normal/reconstruction outcome
  policies. Previous small shared-loop attempts grew; they do not disprove a
  larger architectural simplification.
- Retry the whole lane after reconstruction failure. This removes more prefix
  recovery policy but repeats successful guards and requests; presentation and
  raw-wire-data handling still need a design.
- Build-time specialization or an opt-in codec runtime could remove unused API
  support from minimal apps. No measured saving or sound specialization exists
  yet; property-use inspection alone is insufficient.

Cancellation of non-cooperating promises, stale-result rejection, observed late
rejections and public loader-controller lifetime are correctness/API guarantees.
A normal application promise need not react to abort. Even transported values
can become pending thenables through public serialization adapters. The approved
stable `.then` contract does not make these guarantees unnecessary.

## Is the hydration performance machinery worth its bytes?

The retained shared cancellation waiter costs **30 gzip bytes** in its original
composition step. Directly reverting to the existing generic waiter on today's
source saves **25**, showing compression interaction. For 16 matched routes with
context and beforeLoad transforms, without loader work:

| Mechanism                | Raw/sync Promise resources | Async Promise resources | Raw/sync listeners | Async listeners |
| ------------------------ | -------------------------: | ----------------------: | -----------------: | --------------: |
| Current shared waiter    |                        168 |                     296 |                  1 |               1 |
| Generic waiter prototype |                        185 |                     345 |                 17 |              49 |

The native public SSR/bootstrap probe asserts lifecycle calls, context and
matches. These counts measure work, not heap bytes or browser latency. The
generic-wait prototype also changes already-aborted Promise scheduling and needs
cancellation/retention validation before it can be considered equivalent.

The historical **11.5% async overhead is not established for current code**.
Alternating depth-16 runs put the shared-wait version at 54.978 µs versus original
55.415 µs; same-realm runs give 44.754 versus 44.455 µs. These small differences
are within uncertainty. Compared with the earlier fixes, shared waiting reduced
async mean by about 9.7% in the first series. This is not proof of universal
parity: foreign-realm raw timing was 3.44% above fixes, same-realm raw was 3.29%
below, and smaller recovery/SSR timing uncertainties remain recorded in
`FINDINGS.md`. Do not justify more machinery using the obsolete single number.

Serializing loaders is a separate performance concession: synchronous transforms
may need little parallelism, but async transforms or missing loaders can create
a network waterfall. A byte measurement cannot settle that policy.

## Experiment log: retained changes

These rows form a **sequential** ladder from the 99,721-byte fixes baseline;
their deltas sum to **−7**. The earlier scoped serial-argument helper (−18 versus
the original PR) and single parent-snapshot return (−3) are already included in
the starting baseline. The fixes group took 99,537 → 99,721 (**+184**); this is
a group measurement, not a price per defect. Do not subtract earlier wins again.

| Retained change                                             | Before → after gzip | Delta |
| ----------------------------------------------------------- | ------------------: | ----: |
| Shared function-compatible `isPromise` predicate            |     99,721 → 99,720 |    −1 |
| Finish owns controller retirement                           |     99,720 → 99,717 |    −3 |
| Shared hydration cancellation waiter                        |     99,717 → 99,747 |   +30 |
| Required context-only forced-pending correction             |     99,747 → 99,764 |   +17 |
| One outer error/retention cleanup boundary                  |     99,764 → 99,738 |   −26 |
| Adjacent shared argument builders, composed with catch      |     99,738 → 99,733 |    −5 |
| Existing abort dispatch instead of duplicate callback       |     99,733 → 99,729 |    −4 |
| Asset/context/presentation-bound simplifications            |     99,729 → 99,719 |   −10 |
| Remove redundant once option from shared hydration listener |     99,719 → 99,714 |    −5 |

Implementation commits are `b50083f5a1` through `eb6563b666`; stable-then decisions
are recorded at `83e38a349dc5`. Normal independent waits still use `{once:true}`;
the shared hydration listener instead has guaranteed `finally` cleanup.

## Experiment log: committed serial cleanup (2026-10-19)

Committed at `ee5df0122640`. Baseline `cc-baseline` reproduces 99,714 on
`83e38a349dc5` (Node 26.10.0, pnpm 11.21.0); `cc-final-v2` and `ss-baseline`
reproduce 99,688. Runs are under `results/runs/`, prefix `cc-` unless stated.

| Retained change                                                   | Before → after gzip | Delta | Alone vs 99,714 |
| ----------------------------------------------------------------- | ------------------: | ----: | --------------: |
| One try/catch/finally for context, validation and beforeLoad      |     99,714 → 99,697 |   −17 |             −17 |
| Hydration context and beforeLoad as sibling try blocks            |     99,697 → 99,692 |    −5 |              −6 |
| Context run condition `routeContext ? revalidate : contextOption` |     99,692 → 99,689 |    −3 |              −5 |
| Hydration context merge stays inside the beforeLoad try (parity)  |     99,689 → 99,688 |    −1 |               — |

Mechanisms and equivalence:

- `contextualize`: a validation error is thrown into the shared catch, which
  already performs the same `releaseFlight` + `normalizeLaneError`. The shared
  finally restores status and clears an outstanding `'beforeLoad'` reservation.
  Lane matches are fresh per `matchRoutes`, and no other writer touches their
  `isFetching` during the serial phase, so the conditional clear equals the old
  unconditional one. Observable differences are limited to intermediate store
  notifications: async context followed by beforeLoad no longer flips
  `pending → previous → pending` and `'beforeLoad' → false → 'beforeLoad'`
  synchronously between the two lifecycles, and a validation error after an
  async context runs `onError` before the finally restores presentation (as a
  throwing beforeLoad already did).
- Run condition: a truthy `revalidate` implies `contextOption`. Stored `_ctx`
  contributions are truthy because assignment uses `value || {}`; they need
  not be objects (`AnyContext = {}` permits primitives and functions). The two
  conditions therefore agree without imposing a narrower context contract.
- Hydration: the non-terminal context failure breaks directly instead of
  rethrowing to an outer catch; `routeContext` is assigned only after the redirect
  check, so a failed context still contributes nothing. The context merge remains
  inside a try so a throwing getter is still handled as a lifecycle failure.

All 18 scenarios shrink (run `cc-full-candidate` versus `cc-full-baseline`,
measured before the last 1-byte parity row): Start −13 to −46, router-only −10 to
−27; e.g. `react-router.minimal` 86,273 → 86,247 and `solid-start.minimal`
47,921 → 47,875. Validation: router-core unit (3,940), types and ESLint; React,
Solid, Vue Router and start-client-core unit; e2e `router-lifecycle-methods`
(75) and `selective-ssr` (11). New public-API tests pass on both baseline and
candidate: async context + beforeLoad pending presentation, async context +
search validation error (navigate and preload), memoized context returning
nothing, non-terminal `context.hydrate` warning, and terminal returned-redirect
warning text. `context-revalidation` and `serial-lifecycle` benchmarks show no
regression; the noisiest cases were rerun alternately (e.g. `chunks-mixed, depth
16` averages −0.75% over four rounds, rme 2.5–4%). Details are in
`RESULT-optimization-pr6631-serial-cleanup.md`.

Rejected in this round (each against the then-current candidate):

| Approach                                                           |    Delta | Reason                                                     | Run suffix                     |
| ------------------------------------------------------------------ | -------: | ---------------------------------------------------------- | ------------------------------ |
| `additionalContext` spread inside `getSerialContext`               |       −1 | Changes key precedence for −1; brotli +79.                 | `e2-additional-in-common`      |
| Hoist `router._preflight === owner` in `loadResource`              |       +1 | Grew.                                                      | `e3-hoist-hydrating`           |
| `step`: one `transported` local / direct return                    |     +1/0 | Grew or neutral.                                           | `e4-step-transported`, `e4a-…` |
| Rethrow returned beforeLoad redirect/notFound into catch           |       −1 | −43 raw but −1 gzip; reorders release vs. materialization. | `e8-returned-control-throws`   |
| Drop `isCurrent()` before hydration beforeLoad                     |        0 | Neutral.                                                   | `q1-no-current-before-guard`   |
| Async context presents pending before reserving (beforeLoad order) |       −1 | Changes offered clone state for −1.                        | `q3-context-pending-order`     |
| `step` builds serial args from an eager object (no thunks)         |       +2 | −65 raw, but gzip grew.                                    | `e10-step-builds-serial-args`  |
| Direct comparisons instead of `Math.min` for failed/boundary       | −2/+1/−1 | Combined −2, alone +1/−1; readability cost.                | `t13-…`, `t1-…`, `t3-…`        |

Syntax-level rewrites of the remaining hydration and loader code keep landing at
±2 bytes. Further meaningful savings need one of the guarantee or architecture
changes in the scope table above.

## Experiment log: codec policy and SPA/Start screens (2026-10-21)

The baseline is committed `ee5df0122640`: **SPA 86,247 / Start 99,688**, run
`ss-baseline`. SPA means `react-router.minimal`; Start means
`react-start.minimal`. Both use Vite and total application gzip. All entries
below distinguish superseded drafts from the retained composition.
Completed `ss-*` results rebuild packages and select both scenarios. Do not add
marginals from these different source bases.

The approved codec API excludes `navigate`, `buildLocation`, `abortController`
and `parentMatchPromise` in types and documentation. **Extra lifecycle fields
may pass through at runtime**; they are unsupported codec capabilities, not
properties that must be deleted. Handler and revalidation APIs remain. A
navigation superseding a pending loader codec runs the ordinary handler rather
than adopting the transform as a reusable generation. Standard
`Object.prototype` is now explicitly accepted. These decisions do not promise
own-property absence and are distinct from whether implementation changes save
bytes. No other feature or guarantee removal is authorized.

The retained implementation reuses `loadResource` for transforms too, but unregisters
their flights and flights of handlers depending on them, keeping those leases
private to hydration. It removes `getCodecContext`; `load-server.ts` and
`utils.ts` are restored exactly to committed HEAD. Source snapshot:
`/tmp/pr6631-spa-start/codec-after-load-client.ts` (retained source at
`3b3fa2f5c787`, SHA256 `5e356e2d8088fa99b9fac7bdfcffdbb9f63869c71751f8acbf041ee04811b55a`) and
`codec-runtime-passthrough.ts` (the earlier factory-only source).
The filter/allocation costs below describe superseded implementations, not a
necessary cost of the approved API.

| Policy implementation                                                              | SPA gzip | Start gzip | Start vs `ee5df` | Decision / evidence run                                                                                                           |
| ---------------------------------------------------------------------------------- | -------: | ---------: | ---------------: | --------------------------------------------------------------------------------------------------------------------------------- |
| Restrict codec arguments with shared helper                                        |   86,247 |     99,734 |              +46 | Historical runtime-filter cost; superseded by passthrough; `ss-codec-only`                                                        |
| Inline client argument filtering                                                   |   86,247 |     99,717 |              +29 | Historical −17 vs helper filter, still +29; superseded; `ss-codec-inline-fixed`                                                   |
| Separate transported transforms from handler flights, initial                      |   86,247 |     99,796 |             +108 | Incomplete: parent-dependent omitted handlers could be adopted against the wrong parent result; `ss-codec-independent`            |
| Private descendant flights and fetching-state restoration, v2                      |   86,247 |     99,856 |             +168 | Superseded: detached codec could clear replacement fetching state; `ss-codec-independent-v2`                                      |
| Uniform argument factory for serial and loader steps                               |   86,247 |     99,839 |             +151 | Historical −17 against flawed v2 draft; superseded; `ss-codec-step-factory`                                                       |
| Common invocation/outcome helper for handlers and codecs                           |   86,266 |     99,855 |             +167 | Historical −1 Start against flawed v2, grows SPA 19; rejected; `ss-codec-shared-outcome`                                          |
| Common invocation/outcome helper plus argument factory                             |   86,266 |     99,841 |             +153 | Historical −15 Start against flawed v2, grows SPA 19; rejected; `ss-codec-shared-factory`                                         |
| Accepted-prefix guard prevents detached codec state writes, v3                     |   86,247 |     99,867 |             +179 | Historical corrected separate engine; superseded; `ss-codec-independent-v3`                                                       |
| Uniform argument factory on v3                                                     |   86,247 |     99,848 |             +160 | Historical −19 vs separate-engine v3, unchanged SPA; superseded; `ss-codec-factory-v3`                                            |
| Null-prototype context-ID membership record                                        |   86,255 |     99,852 |             +164 | Rejected: +8 SPA / +4 Start against factory-v3; `ss-context-dictionary`                                                           |
| Existing loader engine with private transform/dependent flights, runtime filtering |   86,247 |     99,779 |              +91 | Historical old runtime filter; −69 vs factory-v3; `ss-codec-private-engine`                                                       |
| Same private-flight engine, runtime passthrough                                    |   86,247 |     99,732 |              +44 | Historical factory-only draft; −47 vs filtered private engine; `ss-codec-runtime-passthrough`                                     |
| Omit redundant private-flight registration identity check                          |   86,247 |     99,725 |              +37 | Isolated candidate, −7 Start / unchanged SPA vs passthrough; retained in the validated composition; `ss-codec-private-noidentity` |
| Assign data into fresh client codec arguments                                      |   86,247 |     99,731 |              +43 | Isolated candidate, −1 Start / unchanged SPA vs passthrough; no server change or speedup claim; `ss-codec-client-assign`          |
| Client assignment plus omitted private-flight identity check                       |   86,247 |     99,724 |              +36 | Measured intermediate combination, −8 Start / unchanged SPA vs passthrough; `ss-codec-assign-noidentity`                          |

### Current policy attribution and rejected membership shortcut

The policy baseline uses the **original step shape plus required private-flight
handling**, without the optional simplifications below. All rows are actual
completed measurements; SPA stays **86,247**. The baseline and each isolated
hunk differ in client implementation only; server and utility sources stay at
committed HEAD.

| Implementation relative to policy baseline                | Start gzip | Delta vs policy baseline | Run                                        |
| --------------------------------------------------------- | ---------: | -----------------------: | ------------------------------------------ |
| Required private-flight policy, original step shape       |     99,735 |                        0 | `ss-codec-policy-base`                     |
| Fresh client-argument assignment alone                    |     99,732 |                       −3 | `ss-codec-policy-assign-only`              |
| Invariant-based private-flight guard alone                |     99,723 |                      −12 | `ss-codec-policy-narrow-only`              |
| Uniform context factory alone                             |     99,732 |                       −3 | `ss-codec-runtime-passthrough`             |
| Factory + fresh arguments + identity-safe invariant guard | **99,720** |                  **−15** | `ss-codec-parent-identity`                 |
| Replace parent flight identity with map membership        |     99,711 |                      −24 | **Rejected**, `ss-codec-parent-membership` |

The measured combination saves **15**, not the sum of the three isolated
marginals (18). It still adds **32** versus committed 99,688. Its Start initial
gzip is **99,581**, raw **311,434** and Brotli **86,683** bytes. The identity-safe
version passes **3,940 core cases**, four expected failures and three skipped,
with no type errors. All 32 package unit/type/lint/build targets and 86 production
Chromium cases pass. Native paired transformed-hydration means move −13.0% to
+4.2%, with overlapping intervals (RME 7.1–13.4%); neither universal speedup nor
consistent slowdown is established. Depth-16 async serial and loader means move
−0.49% and −1.18%. This does not establish current overhead against a newly run
original PR; it does not reproduce the old 11.5% claim either.

Both all-18 runs and the final packaging pass succeed. Independent recompression
matches all 38 client JS files and maps per phase, including raw/gzip/Brotli and
initial/total sums. Six SPA scenarios are identical; twelve Start scenarios grow
28–46 gzip bytes because the new behavior costs more than its simplifications
recover. Server/utils are unchanged. Root docs checking reports two pre-existing
broken example links in production-checklist.md and tanstack-query.md; neither
edited codec page adds a broken link. See `RESULT-optimization-codecs.md`.

The retained sequential commit ladder is:

| Commit       | Change                                                  | Start gzip | Step delta |
| ------------ | ------------------------------------------------------- | ---------: | ---------: |
| `a7160e035a` | Supported codec API and private-codec behavior          |     99,735 |        +47 |
| `ce4ccef0a0` | Remove checks disproved by synchronous flight ownership |     99,723 |        −12 |
| `122ae22994` | Consistent fresh-argument factories                     |     99,722 |         −1 |
| `3b3fa2f5c7` | Attach codec data to fresh client arguments             |     99,720 |         −2 |

`ss-codec-safe-noassign` verifies the penultimate 99,722-byte composition.
Test support is committed separately in `25c49de994` and `5ece55d91b`. The first
baseline unit run has seven expected new-policy failures, not a green baseline;
AFTER passes all of them. The implementation was explicitly stashed and restored
without stashing or committing FINDINGS.md. The final source matches the tested
AFTER snapshots exactly.

**Do not retry the membership shortcut.** Duplicate legacy fallback match IDs
can leave a registry entry for a different flight. `map.has(parentId)` therefore
does not prove that the parent's actual flight is public. A superseding load
can adopt descendant work still waiting on an obsolete codec, preventing
completion. The independently authored public regression is committed in
`5ece55d91b`, in `hydration-codec-supersession.test.ts`; on the shortcut its
500 ms completion poll fails (`codec-membership-legacy-red.log`). The earlier
3,939 passing tests did not cover that case. Keep comparison with the actual
parent `_flight` identity, rather than key presence. The nine-byte saving
against the selected 99,720-byte source is invalid.

Logs, exact sources and command records for these attribution runs remain under
`/tmp/pr6631-spa-start/`; metrics are the named immutable `ss-*` results. These
client-only changes do not reinstate the removed metadata helper or its
historical server allocation/timing claims.

The direct-transform draft initially failed two existing adoption tests because
those tests expected a superseding navigation to reuse a pending codec. That
expectation was explicitly changed by the approved policy; the subsequent
parent-dependent ordinary-handler overlap required separate protection. A first
private-flight patch and first inline-filter patch failed source type checking;
their corrected results above supersede them. No app-size result exists for the
failed builds.

V2 also has a newly reproduced late-settlement bug: after an ancestor recovery
cut, a detached child codec can clear its replacement handler's `isFetching`
through their reused handoff controller. The public regression fails on v2
(expected `'loader'`, received false). V3 checks the accepted-prefix boundary
before writing fetching state. V2 and its three consolidation measurements are
therefore prototype attribution, not final correct candidates. V3, factory-v3
and the dictionary alternative each pass 3,939 core cases, with four expected
failures and three skipped, before later test changes. This does not establish
the final full package/type/lint/e2e/performance/bundle matrix. Evidence:
`codec-fetching-before.log`, `hydration-codec-fetching.test.ts`, and the three
`*-v3-unit.log` / `context-dictionary-unit.log` files under
`/tmp/pr6631-spa-start/`.

Historical metadata-allocation screens used the **removed runtime-filter helper**
on factory-v3, SPA 86,247 / Start 99,848:

| Old helper alternative                      | SPA gzip | Start gzip | Delta vs old helper base | Status / run                                                   |
| ------------------------------------------- | -------: | ---------: | -----------------------: | -------------------------------------------------------------- |
| Assign data into the metadata rest object   |   86,247 |     99,847 |                       −1 | Superseded with helper removal; `ss-codec-metadata-assignment` |
| Define own data property on the rest object |   86,247 |     99,881 |                      +33 | Rejected growth; `ss-codec-metadata-define`                    |

Assignment's inherited-setter/non-writable-property difference was a blocker
under the earlier broad prototype contract. The maintainer subsequently accepted
standard `Object.prototype`; preserve this history rather than treating the old
blocker as an unresolved approval requirement. That does not retain the removed
helper. Any apparent allocation or timing improvement from avoiding its second
object copy belongs to that historical implementation. The short SSR sample has
substantial uncertainty and establishes **no current-server speedup**: the
canonical server no longer executes this filtering helper. The completed
client-only assignment results above have their own byte measurements; final
correctness/performance validation remains separate.

The following local alternatives start from the **shared-helper codec-argument
base, SPA 86,247 / Start 99,734**, not from the committed 99,688-byte state.
They preserve that draft's API policy. SPA growth is reported alongside small
Start-only changes so a shifted cost is not mistaken for a general win.

| Alternative                                            | SPA gzip (delta) | Start gzip (delta) | Decision / run                            |
| ------------------------------------------------------ | ---------------: | -----------------: | ----------------------------------------- |
| Shared control-only normalization helper               |     86,281 (+34) |        99,741 (+7) | Rejected; `ss-control-normalize-v2`       |
| Normalization mode omits success tuples                |      86,251 (+4) |        99,728 (−6) | Rejected client growth; `ss-control-mode` |
| Same mode, direct success fast path                    |      86,252 (+5) |        99,730 (−4) | Rejected; `ss-control-fast-success`       |
| Put route ID before normalization mode                 |      86,256 (+9) |        99,730 (−4) | Rejected; `ss-control-route-first`        |
| Route ID first plus success fast path                  |      86,250 (+3) |        99,726 (−8) | Rejected; `ss-control-route-first-fast`   |
| Inline beforeLoad control classification               |     86,271 (+24) |       99,758 (+24) | Rejected; `ss-control-inline`             |
| Materialize only non-success outcomes                  |      86,254 (+7) |        99,738 (+4) | Rejected; `ss-control-failure-only`       |
| Build context-ID Set with filter/map                   |      86,249 (+2) |        99,737 (+3) | Rejected; `ss-context-filter`             |
| Build Set with map plus undefined sentinel             |      86,250 (+3) |        99,731 (−3) | Rejected client growth; `ss-context-map`  |
| General producer callback boundary in loadResource     |     86,271 (+24) |       99,778 (+44) | Rejected; `ss-producer`                   |
| Same producer, pass controller through Promise.resolve |     86,272 (+25) |       99,778 (+44) | Rejected; `ss-producer-controller`        |

A separate **pre-codec-policy** screen replaces the context-ID Set with a
committed-match `some` scan: **SPA 86,222 / Start 99,655**, **−25 / −33** versus
committed `ee5df0122640`, run `ss-context-scan`. It restores a repeated scan for
each context contribution, with quadratic worst-case work instead of the indexed
lookup. It is not an applied win. The six context-revalidation timing cases
passed, but this single short screen does not establish acceptable worst-case
performance or justify silently reversing the earlier B3 decision. Do not
compare it with the codec-argument base: its source retains the old argument
contract too.

Evidence: saved `results/runs/ss-*/current.json`; source hashes and paired metric
records in `/tmp/pr6631-spa-start/{normalize,other,producer,final-local}-results.json`;
source snapshots, commands and full logs in the same directory. Completed
normalization/Set/producer screens passed their core unit runs; these are not
CPU speedup claims. All three consolidation runs completed. None reduces both
bundles against the committed state; the target remains unmet. No incomplete
bundle measurement is assigned a byte result.

## Experiment log: rejected or excluded approaches

All sizes below are **whole-app gzip** unless explicitly marked module-only.
Baselines differ: read the before value. Related syntax variants are grouped.
Run IDs below are under `results/runs/`; prefix `fixes-r3-` unless `O/` marks the
original optimization checkout `/tmp/pr6631-opt-review`.

| Approach                                           |                                    Before → after (delta) | Decision / reason                                                                                                      | Evidence suffix                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shared normal/hydration serial runner              |                          99,731 → 99,772 (+41); eager +52 | Grew; normal policies remain distinct.                                                                                 | `unified-serial-v2`, `unified-serial-eager-v2`                                                   |
| Shared context/beforeLoad hydration loop           |                                     99,733 → 99,757 (+24) | Grew after cleanup composition; earlier original-head form +29.                                                        | `unified-hydration-serial-v12`; `O/scoped-serial-phase`                                          |
| Generator retaining async step wrappers            |                                    99,718 → 99,835 (+117) | Added a driver without removing wrappers.                                                                              | `generator-steps-v1`                                                                             |
| New common wait factory                            | 99,747 → 99,769/99,773 (+22/+26); normal-path factory +44 | Abstraction grew. Distinct from directly reusing existing `waitFor` above.                                             | `unified-wait-tuple-v1`, `unified-wait-callable-v1`, `serial-wait-factory-v1`                    |
| Shared Promise.race interrupt                      |                                     99,718 → 99,747 (+29) | Grew; settled-result retention also needs care.                                                                        | `shared-race-v1`                                                                                 |
| Per-wait completion/classification variants        |                                +7 to +17 on matched bases | Grew; no demonstrated CPU gain.                                                                                        | `wait-completion-v1`, `classified-serial-wait-v24`, `inline-classification-cleanup-v25`          |
| One navigation callback, cleared before handoff    |                                     99,736 → 99,788 (+52) | Grew; uncleared predecessor failed GC.                                                                                 | `direct-lane-navigate-v2`                                                                        |
| Common eager argument object and spread            |                                     99,733 → 99,718 (−15) | Excluded: extra ordinary-navigation allocations; short timing screens slower, no accepted CPU tradeoff.                | `common-argument-base-v9`                                                                        |
| Lazy/eager per-route argument alternatives         |                99,733 → 99,736 (+3); 99,714 → 99,716 (+2) | Grew. Central memo args −9 alone, but worse when composed with outer catch.                                            | `normal-lazy-serial-v10`, `eager-common-v37`, `catch-step-args-v8`                               |
| One recovery cache clone                           |                                      99,537 → 99,543 (+6) | Grew; no cache policy removed.                                                                                         | `O/scoped-cache-clone`                                                                           |
| Ordered loader outcome records                     |              99,721 → 99,736 (+15); newer module-only +33 | Grew. Raw-outcome shortcut leaves a derived parent rejection unobserved.                                               | `ordered-loader-outcomes-v1`; round4 ordered-outcome review                                      |
| Optional consumer mapper                           |                                     99,731 → 99,759 (+28) | Grew. Mandatory inline version changes async/cache-admission ordering.                                                 | `resource-mapper-v1`                                                                             |
| Async loader producer preserving scheduling        |                                     99,721 → 99,750 (+29) | Grew; narrower merge changed cancellation/error timing.                                                                | `fixes-extra-async-flight-preserve` (no extra prefix)                                            |
| Receiver-based handoff methods                     |                                     99,731 → 99,811 (+80) | Grew.                                                                                                                  | `receiver-handoff-v1`                                                                            |
| Finish acquires handoff resources, corrected       |                                      99,764 → 99,773 (+9) | Grew; naive version aborts a borrowed public signal too early.                                                         | `handoff-resource-lean-v7`                                                                       |
| Direct prefix / one handoff replacement loop       |                            99,733 → 99,740/99,738 (+7/+5) | Grew; leases/clones encode real ownership.                                                                             | `handoff-direct-prefix-v10`, `handoff-one-replacement-loop-v10`                                  |
| One accepted-prefix representation                 |                                      99,733 → 99,734 (+1) | Grew. Removing full structural identity checking is incorrect.                                                         | `single-prefix-accept-v10`                                                                       |
| Skip idle chunk wrappers / aggregate chunks        |    99,721 → 99,742 (+21); aggregate 99,731 → 99,775 (+44) | Grew; aggregate filtering +54.                                                                                         | `skip-idle-chunks-v1`, `chunk-aggregate-v1`                                                      |
| Correct sync/void chunk-success normalization      |               99,729 → 99,739 (+10); 99,719 → 99,727 (+8) | Grew. Catch-only sentinel is incorrect when successful preload fulfills false.                                         | `sync-chunk-results-v20`, `chunk-success-void-v27`                                               |
| Skip empty chunk await, keep mapper                |                                      99,714 → 99,717 (+3) | Removes 32 Promise resources at depth16; no timing win established (RME ~8%). Preserved CPU candidate, not a size win. | `skip-empty-chunk-await-v44`                                                                     |
| Record terminal end / corrected protected boundary |             99,714 → 99,721/99,730 (+7/+16); combined +28 | Grew. Committed-only boundary also misclassifies successful uncommitted context-only matches.                          | `record-terminal-end-v40`, `protected-boundary-v41`, `both-terminal-boundaries-v41`              |
| Empty retry or presentation snapshot as bound      |                                 99,719 → 99,717 (−2 each) | Excluded: composed results 99,718/99,717 lose to retained 99,714.                                                      | `hydration-retry-real-cut-v26`, `presentation-asset-authority-v29`                               |
| Helper layout/local expression variants            |                                       Typically +1 to +19 | Rejected; argument reorder −2 alone became neutral in final composition. Loader-context relocation +3.                 | `serial-block-before-hydrate-v20`, `resource-near-hydration-v10`, `loader-context-colocated-v42` |
| Separate lifecycle module                          |                                     99,718 → 99,798 (+80) | No useful DCE boundary.                                                                                                | `lifecycle-module-v4`                                                                            |
| Move hydrate into SSR client entry                 |                                     99,718 → 99,690 (−28) | **Excluded by explicit instruction:** keep hydrate last in original load-client.ts.                                    | `separate-hydration-v2`                                                                          |
| Unrelated URL parsing / component dispatch         |                           99,555 → 99,526/99,551 (−29/−4) | **Out of scope.** The −53 broad composition includes these; never count it toward this task.                           | `O/opt-parse-preserved`, `O/opt-component-closure`, `O/opt-selected-full`                        |

Do not retry these unsafe shortcuts unchanged:

- Skip cancellation for raw transported values: four public adapter regressions
  reproduce a hang. Their data can be pending thenables.
- Use a manual synchronous Promise driver: module-only +138 and native-await
  constructor/species/own-then counterexamples remain under stable `.then`.
- Remove structural-tail identity checks or acquire handoff ownership too late:
  public reentrant navigation and borrowed-controller lifetimes invalidate them.
- Cache wire-key membership around user adapters: stable `.then` does not promise
  stable object membership; the composed app also grew four bytes.
- Fuse normalization/onError jobs without preserving ownership checkpoints:
  user getters can navigate between jobs. This is a source-review counterexample,
  not a newly confirmed defect in the retained implementation.

The first main-body diagnostic build failed TypeScript compatibility checks
against the new unknown wire type. Type-only casts fixed the scaffold; the
successful measurements above supersede it. There is no byte result for that
failed build.

## Evidence and next entries

Fresh independent reviewers checked execution sharing, reconciled 258 saved app
runs, and bound each new measured TS source to package ESM and application source
maps. Emitted files were independently recompressed and raw/gzip/Brotli/initial
sums reconciled. Detailed source cuts, commands, hashes and reports are preserved
in `/tmp/pr6631-bundle-log/`; earlier records are in `/tmp/pr6631-round3/` and
`/tmp/pr6631-round4/`. These local artifacts supplement this durable log; the
decisions and numbers above must remain understandable without them.

For every next experiment, record: source commit/hash and matched baseline;
mechanism and isolated/combined status; scenario/toolchain; gzip, initial gzip,
raw and Brotli; correctness/performance evidence and its limits; decision and
reason; immutable run ID; what new evidence would justify reopening it.
Reopen a rejected approach only when its stated blocker changes.

No diagnostic feature cuts from the scope table are retained. The approved codec
policy is committed separately from its three measured simplifications. The
combined change is not a byte win against the previous runtime.
Restore the exact source and rebuild after diagnostic cuts; keep `hydrate` at
the bottom of `load-client.ts`. `FINDINGS.md` remains uncommitted working
documentation.
