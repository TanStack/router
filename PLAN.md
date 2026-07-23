# PR #7805 outstanding-issue fix plan

Target under review: `6683863a75a46297765b288957fccd147006ef0c`.

This file intentionally contains no production changes. A production issue is added here only after a focused test fails on the PR head for the claimed reason and three independent reviewers validate the contract, reproduction, impact, and proposed repair direction. A test-suite repair is added only after three reviewers prove its false-positive/missing-oracle window; it remains explicitly test-only until its hardened oracle fails under the named negative mutation. See `ISSUES.md` for unverified and rejected findings.

## Verified issues

### P02 — Restore the public `RouterState` compatibility surface

**Severity:** blocker for a v1 release. **Validated by:** failing exported-type and runtime tests plus three independent public-API/semver reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-c-router-state-compat.test-d.ts` no longer compiles references to `RouterState.loadedAt`, `isTransitioning`, `statusCode`, and `redirect`. The runtime companion confirms all four are absent from `router.state`. Base/main exported and materialized all four; adapter `useRouterState` APIs expose that type, public docs still name `isTransitioning`, and this PR has no major-version migration or changeset.

#### Required implementation

1. Restore the four properties, with their base types, to `RouterState` in `packages/router-core/src/router.ts`:
   - `loadedAt: number`;
   - `isTransitioning: boolean`;
   - `statusCode: number`;
   - `redirect?: AnyRedirect`.
2. Restore compatibility stores in `packages/router-core/src/stores.ts` and include them in `RouterStores` and the aggregate `__store`. Initialize them to the base values in `getInitialRouterState`: `0`, `false`, `200`, and `undefined`.
3. Reproduce the base compatibility semantics at the new lane's winning foreground/server load boundary rather than inventing background-publication semantics:
   - reset `statusCode` to 200 when the current load enters pending and publish its terminal 200/404/500/redirect code only from the current load;
   - expose the exact `AnyRedirect` object through `redirect` when base's terminal catch classifies a redirect; this is the native `Response` instance augmented with router `.options`, so preserve its identity, status, headers, and options. Do not proactively clear it on an ordinary successful client load, because base did not do so, while a later terminal catch may replace it with that catch's redirect-or-undefined value;
   - assign `loadedAt = Date.now()` exactly once at the winning foreground/server load's first accepted on-ready/presentation commit, as base did; do not derive it by incrementing the prior value. A later SWR/background completion for that load and N06's child-only background publication must not write this public clock;
   - preserve the last committed values while a superseded transaction is discarded; stale, preload/cache-only, and losing background lanes must not write them.
4. Restore `isTransitioning` with its exact base writer semantics. Vue's `Transitioner` toggles the router store and must clear only its current owner on completion/unmount; React kept transition state locally and Solid did not write this compatibility store, so do not make those adapters toggle the public field as an unrelated behavior change. Its initial value remains false everywhere.
5. Keep the granular stores and the compatibility aggregate coherent inside the same batches. Do not rebuild a separate state object whose fields can lag the match/location stores.
6. If maintainers intentionally want removal instead, move it to an explicitly approved major-version migration with docs, changeset, deprecations, and consumer migration tests; silently weakening the regression tests is not an acceptable v1 fix.

#### Tests and acceptance criteria

1. Make both focused compatibility tests pass for the exported type and a real initial router state.
2. Add lifecycle assertions for initial, pending, successful, error, not-found, and redirect loads; verify exact status codes, exact `AnyRedirect` identity/headers/status, and that `loadedAt` changes only for the winning foreground/server load commit. Use a controlled `Date.now()` value plus a store-write counter to require that exact timestamp and exactly one accepted write, including when the later background lane settles.
3. Subscribe through React/Solid/Vue `useRouterState` and prove these fields remain reactive, including a same-route reload.
4. Add supersession controls showing a losing load performs no `loadedAt` write, cannot replace `statusCode`, and cannot leak a redirect.
5. Add Vue transition/unmount/remount controls for `isTransitioning`, plus React/Solid controls proving their public field retains the base false semantics. Coordinate Vue teardown with P05 so it cannot leave a stale true value.

### P03 — Restore React's non-rendering transition fallback on unmount

**Severity:** major liveness failure. **Validated by:** a focused post-unmount navigation timeout and three independent lifecycle/ownership reviews.

#### Observable failure

`packages/react-router/tests/pr-7805-review-transitioner-unmount.test.tsx` mounts and settles a provider, unmounts it, then performs an imperative navigation. The route work is synchronous, yet the navigation stalls, remains pending, and never advances `resolvedLocation`. React cleanup drains acknowledgements that already exist but leaves `router.startTransition` and `router._rendered` pointing at closures owned by the dead tree; the later commit queues a new acknowledgement that no `Match` can deliver.

#### Required implementation

1. In `packages/react-router/src/Transitioner.tsx`, give each installed transition/render callback a local owner identity.
2. During cleanup, first resolve every acknowledgement already queued by that owner with `false`.
3. If (and only if) the router still points at that owner's callbacks:
   - restore `router.startTransition` to a non-rendering fallback that executes its callback and resolves `false`;
   - clear `router._rendered` (or restore an equivalent inert callback that cannot acknowledge a DOM render).
4. Do not restore a captured callback from an older provider: in overlapping/StrictMode lifecycles that callback may itself belong to an unmounted tree. Use identity checks and a stable core fallback so an old cleanup cannot overwrite a newer owner.
5. Keep history unsubscription and acknowledgement cleanup synchronous with unmount. A navigation beginning immediately after testing-library/React unmount must see the fallback.

#### Tests and acceptance criteria

1. Make the focused navigation resolve without a timeout, with idle status and `/next` as `resolvedLocation`; assert no `onRendered` event is emitted without a renderer.
2. Replace or supplement the 100 ms race with a controlled state/microtask checkpoint so the liveness test is robust under slow CI.
3. Add StrictMode double-effect, unmount/remount, router replacement, and two-owner cleanup-order tests. The newest mounted owner must keep its callback; after the final owner leaves, the core fallback must win.
4. Cover a pending fallback/minimum-duration navigation to prove a false acknowledgement does not create a phantom `pendingMinMs` obligation.

### P04 — Keep background asset projection private until CAS succeeds

**Severity:** major state-corruption/notification failure. **Validated by:** a failing stale-head regression and three independent transaction/CAS reviews.

#### Observable failure

The P04 regression now lives in its own `packages/router-core/tests/pr-7805-review-p04-background-projection.test.ts` file. A losing background `head` result changes the exact committed root object from `foreground-refresh` to `discarded-background` even though no winning publication occurred. `runBackground` shallow-copies the match array, leaves non-reloaded entries shared with `base`, and calls mutating `projectLane` before its `_tx`/`_committedMatches` comparison.

#### Required implementation

1. Ensure every match that `projectLane` can write is private before any asynchronous `head`/`scripts` hook begins. For background lanes, clone each projectable index (including unchanged ancestors) into the private lane; do not rely on cloning only loader candidates.
2. Make projection cloning resource-aware. A plain object spread must not copy `_flight`/lease ownership onto a second match object. Introduce an N05 primitive such as `cloneMatchWithoutResources` for an unchanged committed ancestor, and keep an already-private transaction candidate as the projection object rather than cloning it again. If an implementation must clone a resource-owning candidate, move its resource identity and resource-bag registration to the clone without decrementing, leaving the source cleared; never leave two objects claiming one acquired lease.
3. Preserve a coherent private `matches` array for hook contexts so later route asset hooks can observe earlier projected asset results without touching committed objects. Resource-neutral projection clones may read public loader data/status but cannot release, abort, or transfer a committed owner's flight.
4. Perform the existing transaction/base CAS only after all private projection work settles. On failure, release transaction-owned background candidates exactly once through N05 and discard resource-neutral projection clones without writing stores or committed objects. Losing a projection must never release the still-committed base match's lease.
5. On success, publish the private projected lane through the normal batched `publishMatches` path. Immediately after the winning CAS and before generic previous-to-next cleanup, move (without decrementing) the corresponding committed base match's `_flight`/resource ownership into every resource-neutral projection clone that will replace it, then clear the old base pointer. Move each accepted candidate resource/bag registration into its published owner the same way. On a losing CAS, perform neither move: the base keeps its resource and transaction candidates release normally. Preserve the original object identity only for indices that neither reloaded nor projected so unrelated match stores/fetch counts do not churn.
6. Apply the same privacy and ownership rules to projection error handling: a rejected decorative hook may be logged, but partial values from a losing lane must not escape and cleanup must remain identity/lease counted.

#### Tests and acceptance criteria

1. Make the focused P04 test pass while retaining its exact object-identity and supersession controls.
2. Assert match-store subscribers and `fetchCount` do not change for a discarded projection, then assert exactly one notification for a winning projection.
3. Cover `head`, `scripts`, both together, ancestor projection during child reload, partial hook rejection, and two consecutive background generations settling out of order.
4. Add a control that child asset hooks see the newly projected parent in the private `matches` lane.
5. Add winning and losing projections where a **projected committed ancestor** owns a settled live flight and a child is an N05-owned candidate. On win, assert the ancestor lease moves to the published clone without abort/decrement and the old object is cleared before cleanup; on loss, assert the base object retains it. Assert the candidate has exactly one lease/owner after winning transfer, losing cleanup decrements exactly once, later unload reaches zero exactly once, and an old clone cannot abort/delete a newer same-ID flight.

### P05 — Solid and Vue must not acknowledge renders after provider teardown

**Severity:** major lifecycle/event correctness failure. **Validated by:** separate failing Solid and Vue regressions plus three independent framework/core reviews.

#### Observable failure

After provider unmount, both adapters correctly unsubscribe history and an imperative `/next` navigation reaches idle. However, stale `router.startTransition` closures still resolve `true`, causing one false `onRendered` event for a tree that no longer exists. This can also start `pendingMinMs` timing from a nonexistent render.

#### Required implementation

1. Give the callbacks installed by `packages/solid-router/src/Transitioner.tsx` and `packages/vue-router/src/Transitioner.tsx` explicit owner identities.
2. Register framework cleanup that, if the router still points at that owner, restores the same core non-rendering fallback used by P03 (execute callback, resolve `false`). Do not restore an older possibly-dead adapter closure.
3. Preserve normal mounted behavior: Solid may await `Solid.startTransition`; Vue may invoke and await `nextTick`; each returns `true` only while its provider owner is still mounted and current when the flush completes.
4. If unmount occurs during an in-flight transition, make its result `false`; do not emit `onRendered` or extend a pending minimum from a flush completed after teardown.
5. In Vue, coordinate with P02's `isTransitioning` compatibility store so cleanup clears only the current owner's transition state without clobbering a remounted owner. React and Solid must preserve their base store-writer behavior.

#### Tests and acceptance criteria

1. Make both focused tests pass: navigation still resolves to idle `/next`, but no post-unmount `onRendered` fires.
2. Add unmount-during-transition, remount, router replacement, and cleanup-order controls in both frameworks.
3. Verify mounted navigation still emits exactly one `onRendered` after the DOM contains the target.
4. Verify a false teardown acknowledgement neither starts nor prolongs `pendingMinMs`.

### P06 — Clear React lazy reload intent when a retry begins/succeeds

**Severity:** major recovery failure. **Validated by:** a focused failing retry/render test, an independently authored corroborating draft, and three independent classifier/retry reviews.

#### Observable failure

A browser-recognized dynamic-import error sets the closure-level `reload` latch. A second `.preload()` successfully imports and installs the component, but render still reloads and throws an eternal Promise because `reload` was never reset. Existing PR tests use a generic error and cannot enter this branch.

#### Required implementation

1. In `packages/react-router/src/lazyRouteComponent.tsx`, reset attempt-local reload intent when a genuinely new load attempt starts (alongside `error = undefined`).
2. Also ensure the success path leaves reload intent false before publishing `comp`. A successful import must always take precedence over stale failure state.
3. Preserve one-reload protection for the current recognized failure: rendering immediately after that failure should still set/check the session-storage key, call reload once, and suspend eternally while the browser reloads.
4. If a retry fails again and the storage key already exists, throw the current error instead of reloading again. Generic failures must never set reload intent.
5. Keep concurrent callers joined to the same `loadPromise`; a second call while an attempt is pending must not clear state for that same attempt.

#### Tests and acceptance criteria

1. Make `packages/react-router/tests/pr-7805-review-lazy-retry-module-error.test.tsx` render `PageContent`, with two importer calls and zero reload calls after the successful retry.
2. Add immediate-first-failure, repeated-recognized-failure, generic-failure, concurrent-preload, and named-export cases.
3. Exercise the behavior through an actual React route/error-boundary retry, not only direct wrapper invocation, and assert the successful component mounts without Suspense remaining stuck.
4. This retained recognized-module-error regression and its route-level expansion close T06's missing-branch coverage. Keep the existing generic-error retry cases as controls so the classification distinction remains explicit.

### P08 — Republish the successor snapshot when a pending session transfers

**Severity:** major location/match incoherence. **Validated by:** a failing same-ID takeover regression and three independent pending-session reviews.

#### Observable failure

The isolated regression is `packages/router-core/tests/pr-7805-review-p08-pending-takeover.test.ts`. The first pending route visibly has search revision one; a second navigation with the same match ID makes revision two the router location, but the visible pending match remains revision one. `offerPending` transfers `session.owner` for the same boundary/ID, then returns immediately because the predecessor already has `session.ack`.

#### Required implementation

1. Split `PendingSession`'s concepts instead of overloading `ack`: keep an owner/owner generation, absolute reveal deadline/timer, latched `rendered` boolean, optional `visibleUntil`, and a serialized `publicationTail`. The initial reveal acknowledgement and later successor-republication acknowledgements must not replace one another.
2. A same-boundary/same-ID takeover before reveal keeps the original absolute reveal deadline and reschedules only the timer callback for the new owner. After reveal, queue the successor's cloned pending prefix onto `publicationTail`; if a reveal/publication transition is already unresolved, append rather than race two framework transitions.
3. Before each queued publication writes, recheck current router transaction, pending-session identity, and owner generation. A third takeover makes the second owner's queued operation a no-op; the third still appends after it and publishes the newest snapshot. `finishPending` must drain the relevant tail without letting an obsolete owner wait forever.
4. Latch pending-min timing on the **first acknowledgement that returns `true`**. At that instant only, set `rendered = true` and `visibleUntil = now + pendingMinMs`. A prior false acknowledgement followed by a true successor acknowledgement starts the minimum at the true render; true followed by false must retain the first minimum. Later true acknowledgements never restart/extend it.
5. Publish every semantically current field from the successor prefix (search, params, context, loader deps/data, location-derived state, errors/assets) while stripping private flight ownership exactly as the original pending offer does. A false/unmounted acknowledgement updates neither `rendered` nor `visibleUntil`.

#### Tests and acceptance criteria

1. Make the focused test wait successfully for revision two before releasing the loader and drain both navigation promises in all paths.
2. Add nonzero `pendingMinMs` and assert takeover neither shortens nor restarts the first real render's deadline. Cover acknowledgement sequences true -> false, false -> true, and false -> false.
3. Add three rapid takeovers, state-only/context-only differences, predecessor acknowledgement still pending, successor superseded before its queued publish, and owner-generation cleanup ordering.
4. Add unmount/remount while a publication is queued. False acknowledgement must not create a minimum; the remounted current owner may publish/render once without an obsolete callback winning.
5. Assert location and visible match snapshots always belong to the same current transaction and mounted fallback count remains stable.

### P10 — Use one semantic-parent chain for every child loader decision

**Severity:** major cross-generation data incoherence. **Validated by:** a finite failing mixed-mode regression and three independent promise-graph reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-p10-semantic-parent.test.ts` performs exactly two parent and child loads. The parent refreshes privately in background from revision 1 to 2 while the child uses blocking stale reload. The parent publishes revision 2, but the child publishes `{parentRevision: 1}` because it awaited the stale foreground parent.

#### Required implementation

1. In `packages/router-core/src/load-client.ts`, make the `semanticParent` argument to `createLoaderTask` the only parent promise used for semantic work at the next index. Pass it to both:
   - `getLoaderContext` when a functional `shouldReload` runs; and
   - the foreground/blocking `loadResource` call.
     The background `loadResource` already receives this promise.
2. Keep `tasks[index - 1]?.match` only for mechanical task ordering/readiness if still needed; never expose it as `LoaderFnContext.parentMatchPromise`. A background task's `task.match` deliberately describes the stale foreground presentation, while `createLoaderTask`'s return value describes its fresh private candidate.
3. Preserve serial parent failure semantics. If the semantic parent cancels, redirects, errors, or is trimmed, descendants must not publish data derived from a different fallback parent. Do not convert a rejected/canceled semantic parent into the stale foreground object.
4. Build N03's generation token on this same semantic-parent abstraction so there is one definition of ancestry. Do not introduce a second parent selector for flight/cache validation.

#### Tests and acceptance criteria

1. Make the focused regression commit parent revision 2 and child parentRevision 2 with exactly two calls each.
2. Add matrices for all-blocking, all-background, background-parent/blocking-child, blocking-parent/background-child, and a three-level mixed chain.
3. Exercise a functional `shouldReload` that awaits/reads `parentMatchPromise`, plus parent error, redirect, not-found, and cancellation.
4. Assert no extra retry is used to hide an initially incoherent publication; the first accepted child result must use the accepted parent generation.

### N03 — Make loader flights and preload cache entries parent-generation aware

**Severity:** major stale-data adoption across preloads. **Validated by:** two independently failing cache/join regressions and three independent lineage reviews.

#### Observable failure

Both tests in `packages/router-core/tests/pr-7805-review-n03-preload-parent-generation.test.ts` start a child preload under parent revision 1, then commit the same-ID parent at revision 2. In one case the late child is cached; in the other a navigation joins its in-flight loader. Both execute the child only once and publish `{parentRevision: 1}`. Correct behavior rejects the obsolete lineage, executes a revision-2 child, and publishes revision 2.

#### Required implementation

1. Add an opaque private `SemanticToken` to each `WorkMatch` generation. A token identifies the complete accepted semantic inputs/results for that match—not only its ID or immediate parent—and is never a public timestamp or inferred from equal data.
2. Refactor the P10 semantic-parent value from a bare promise into an internal descriptor such as `{match: Promise<WorkMatch>, generation: SemanticToken}`. Pass only `.match` through the public `parentMatchPromise`; use `.generation` as one input when contextualizing the child.
3. After route/static context and `beforeLoad` donation-or-execution are known, derive/allocate the child's **loader-input token** from its existing `match.id` (which already encodes route/path/params/loaderDeps policy), semantic-parent result generation, its own route-context invocation generation, and its own beforeLoad invocation generation. Add an explicit invalidation or route-implementation epoch only where the existing contract requires work after that epoch. Do not add raw search, a mere stale/fresh cause, or equal-value hashing: search intentionally affects loader identity through `loaderDeps`, and current stale-preload adoption controls must remain valid. Preserve context provenance only for an explicit complete donor reuse. A fresh own context/beforeLoad invocation gets a new token even under the same parent/ID and even if its returned value is referentially/equally identical.
4. Allocate a result `SemanticToken` for every fresh loader semantic generation (or fresh no-loader context generation) and retain it through pending clones, commit, cache clones, hydration, descendant descriptors, and P04's projection helpers. A resource-neutral projection clone of an unchanged match preserves the exact base result token while its resource moves only on winning CAS; a fresh background loader candidate keeps its fresh token. Losing projection clones publish neither token nor resource.
5. Extend `LoaderFlight` with `inputGeneration` and `resultGeneration`. Defer flight lookup/acquire until contextualization has established the expected loader-input token; same match ID and parent token alone are insufficient. Join only an identical input token. Never decrement a flight lease that the lane did not increment, and preserve identity-checked deletion so an obsolete flight cannot delete a newer same-ID flight.
6. Store live flights in an ID bucket/index keyed by the complete loader-input generation, or an equivalent structure that can retrieve **every** live compatible generation. Incompatible same-ID flights coexist while owned, and starting B must not make an older compatible A undiscoverable to a later A waiter. Do not abort an old flight merely because a new lineage starts if another preload/navigation still owns it.
7. At `preloadClientRoute` publication, validate a prefix, not independent child IDs. For each candidate, determine the accepted semantic parent from the current active prefix, an unchanged CAS-valid cache prefix, or the already accepted preload prefix. At the first parent-generation mismatch, release that match and every descendant and cache none of the suffix.
8. Initialize tokens deterministically for initial client matches and for each accepted contiguous hydration prefix, in route order, using a client-local root/router-context generation. Tokens need not be serialized because comparisons are runtime-local, but every hydrated/cache/pending clone must carry its assigned token before it can be a donor or flight parent. Replacing router context creates a new root input generation.
9. Retain the existing active-ID exclusion, planned-cache object CAS, development `beforeLoad` function check, and lease transfer. Generation checking is an additional invariant, not a replacement for those guards.

#### Tests and acceptance criteria

1. Make both N03 regressions execute the child twice and publish revision 2.
2. Prove an unchanged parent generation still shares one flight between concurrent preload/navigation, while a real same-ID reload with equal returned data does not.
3. Cover beforeLoad-only parent context changes, multi-level descendants, siblings, parent failure/control, and a newer same-ID flight coexisting with an obsolete leased flight.
4. Add same-parent/same-ID cases where the child's own expired `beforeLoad` reruns to a different context, search changes route context without changing loaderDeps, and a no-loader parent changes context. Fresh own input must not join; explicit complete donor reuse must join.
5. Cover initial/hydrated-prefix token initialization, pending/cache clone transfer, P04 winning/losing projection clones, invalidation, clearCache, router-context replacement, and HMR route-function replacement.
6. Assert stale suffixes never enter `cachedMatches`, all rejected leases reach zero, and a valid matching-input-generation cache remains reusable.
7. Add an A -> incompatible B -> A overlap: the final A waiter must find/coalesce with the still-live first A flight, B must remain independently owned, and cleanup of either generation must not remove the other.

### N10 — Reject same-ID flights created under a different own-context generation

**Severity:** major context/data coherence failure. **Validated by:** one focused failing preload/navigation regression, public loader-context documentation, and four independent source/test reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-n10-inflight-preload-own-context.test.ts` holds a preload loader under child context version 1, then navigates to the same match ID under stable ancestry. Navigation reruns child `beforeLoad` to version 2, yet joins the pending version-1 flight. The final match exposes context version 2 beside loader data version 1, and the loader ran once instead of once per incompatible input generation.

This is distinct from N03's changed-parent cases. Match ID includes route/path/loaderDeps but not either the route's `context()` result or its accepted `beforeLoad` context. A same-ID lookup before contextualization therefore cannot prove that the pending flight consumed the inputs required by the current load.

#### Required implementation

1. Remove provisional `router._flights.get(match.id)` attachment before `contextualize`. A waiter may discover/acquire a reusable flight only after its effective loader-input generation is known.
2. Build that input generation compositionally from the N03 token model: existing `match.id`, semantic parent-result generation, route-context invocation generation, beforeLoad invocation generation, and only an explicit invalidation/implementation epoch whose established contract requires post-epoch work. Preserve stable sentinels when a route has no own context/beforeLoad hook and preserve an exact completed donor's generation; allocate a unique generation whenever either hook actually reruns, even if it returns an equal value or `undefined`. Do not key on raw search or a mere stale/fresh cause, and do not compare context values by shallow/deep equality.
3. Join only a flight whose exact input-generation token matches. If a still-pending preload cannot donate its completed semantic generation, let navigation run its own contextualization and create a second same-ID flight. Both flights retain independent lease/controller ownership until their original owners finish.
4. Bind loader result generation to the exact input generation that invoked `loader`. `applySuccess` may publish that result only into a match carrying the same accepted generation; never graft older loader data onto a freshly contextualized match.
5. Preserve the safe reuse cases: a navigation that explicitly adopts a completed successful preload's complete context/data generation may reuse it; truly concurrent waiters that share the same established generation may coalesce; and a pending route with no own context/beforeLoad hook may share when all remaining input components match. Match ID alone, referentially equal returned context, or equal serialized data is insufficient.
6. Coordinate cache publication with N03's prefix validation. A late version-1 preload may finish for its own owner, but it cannot overwrite/cache as the active version-2 lineage or delete/abort the newer same-ID flight.

#### Tests and acceptance criteria

1. Make N10 record exactly two beforeLoad calls and two loader calls and commit coherent version-2 context plus version-2 loader data. Keep the stable parent, unchanged ID/loaderDeps, finite gates, and exact cleanup so N03 cannot accidentally satisfy it.
2. Rewrite the existing `preload-beforeload-reuse.test.ts` case described by T12: make its loader return the context version it actually receives and require two flights when the pending preload cannot donate its generation.
3. Add a separate positive control where a completed successful preload donates its complete generation and navigation performs one coherent loader execution; add a concurrent same-generation waiter control as well.
4. Cover synchronous `context()` and synchronous/asynchronous `beforeLoad`, route-context-only changes, beforeLoad-only changes, equal-by-value and `undefined` fresh returns, nested changed-parent/unchanged-child inputs, no-own-hook sharing, loader rejection, redirect/not-found, supersession, cache expiry/invalidation, and clearCache.
5. Assert every incompatible same-ID flight keeps its own signal/lease, old cleanup cannot abort/delete the new flight, no stale result reaches `cachedMatches`, and no promise or signal remains live after cleanup.

### P12 — Replace the long-lived redirecting flag with an exact one-shot handoff

**Severity:** moderate redirect-chain authority leak. **Validated by:** a failing primed/fresh budget comparison and three independent ownership reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-p12-redirect-authority.test.ts` proves a fresh alternating A/B cycle gets 21 loader executions before `Redirect cycle detected`. If a prior redirect's target search builder throws, the unrelated cycle gets only 20: `tx.redirecting` survived the rejected `router.navigate` and donated one depth unit.

#### Required implementation

1. Remove `LoadTransaction.redirecting` as an ancestry signal. Use a private unique handoff token bound to one already-built target location/commit, never an unqualified ambient depth that any next navigation can steal.
2. Centralize foreground, background, and planning follows in `followClientRedirect(router, currentDepth, redirect)`. First resolve/build the redirect target—including params/search reducers and safety normalization—with **no handoff installed**. If target building throws or reentrantly starts an unrelated navigation, no redirect authority exists to leak.
3. After a target is built, create `{id, depth: currentDepth + 1, targetHref}` and register it only immediately before committing that trusted built location with replace/ignoreBlocker semantics. Do **not** pretend `buildLocation` knows the future history key: `RouterHistory.assignKeyAndIndex` generates it inside push/replace immediately before synchronous notification. Extend the private trusted-commit path with `_redirectHandoff` instead of calling public `navigate` and rebuilding user options.
4. For an actual history push/replace, inject `__TSR_redirectHandoff: id` into the raw target history state before commit. Teach `parseLocation` to remove that marker from public `location.state` and retain it only as a private parsed-location field. For the same-URL/same-state branch that performs no history notification, pass the token explicitly to the direct internal `load` call. Thus href is only a validation field; the unique marker or explicit token is the authority.
5. At the very start of `loadClientRoute`, before `matchRoutes`/route context can reenter navigation, atomically take only the registered marker/explicit token whose ID and target href match. Bind it to the now-generated actual `__TSR_key`/href and store its numeric depth on the successor preflight/transaction. While that exact keyed load is active, duplicate loads for the same history notification/key join/await it instead of superseding it as an unrelated depth-zero load; a different marker/key/href never inherits authority.
6. Use identity-checked cleanup around the trusted commit. If the custom history push/replace throws synchronously or no exact successor captures the marker, remove only that unconsumed token without erasing a nested newer token. After atomic capture, the successor owns the depth and cleanup; the awaited successor promise no longer controls token lifetime. An inert marker left in raw history cannot reacquire consumed authority and is never exposed in public router state.
7. Preserve the background redirect CAS (`router._tx === tx` and committed-base identity), `reloadDocument` behavior, replace/ignoreBlocker behavior, and the existing exact 20-follow boundary.

#### Tests and acceptance criteria

1. Make the P12 primed chain receive the same 21 calls and terminal error as its fresh control.
2. Cover foreground and background redirects, same-URL replaces, mounted and no-subscriber history flows, synchronous target-build throw, synchronous throwing custom-history commit, and a route callback starting an unrelated navigation. Do not add an ordinary blocker case: redirect commits deliberately preserve `ignoreBlocker: true`.
3. Assert an unrelated navigation started while the redirect successor is still loading does not inherit the chain.
4. Add a target search/params builder that synchronously starts an unrelated same-href navigation, duplicate `load` subscribers for one history notification, and nested internal redirects. Assert private marker stripping, actual generated-key binding, duplicate-load joining, and that only the exact built target consumes the token.
5. Keep P09's passing exact-boundary test unchanged as a guard against accidentally shifting the limit.

### N02 — Count planning redirects in the same finite chain

**Severity:** major unbounded recursion/OOM risk. **Validated by:** a bounded failing context-redirect regression and three independent preflight reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-n02-planning-redirect-budget.test.ts` permits 21 self redirects from route `context()` and then throws an ordinary sentinel. The sentinel is reached, proving planning redirects recurse past the whole-chain cap. The test uses mounted-style history subscription and a bounded bailout; the earlier worker OOM is not part of the evidence.

#### Required implementation

1. Capture P12's one-shot redirect depth before calling `matchRoutes`, not after transaction construction. Planning can throw before a transaction exists, but it still belongs to the same redirect authority handed to this load.
2. In the planning catch, follow a non-document redirect through `followClientRedirect` only while the inherited depth is below 20. This makes planning -> planning and mixed planning -> loader/beforeLoad/chunk -> planning chains share one counter.
3. At the cap, create one ordinary `Error('Redirect cycle detected')` and terminate as a **current non-renderable planning failure**; do not fabricate a partial match merely to host it. Abort the current preflight and clear `router._preflight` only if it still owns that controller. Do not create a successor `_tx`; retain `_committedMatches` and the presented committed matches with exact identities, clear any pending presentation, set status to `idle`, and restore `state.location` to `resolvedLocation` (or the initial parsed committed location if no resolution has occurred). Do not roll history back: history and `router.latestLocation` remain at the final redirect target while the public router state/presentation remains the last accepted commit.
4. Report that exact cycle `Error` through `console.error` once for the whole exhausted chain, matching other non-renderable client/preload failures. Preserve each owned load attempt's normal `onBeforeNavigate` and `onBeforeLoad` emissions, but emit no route `onError`, error component, `onLoad`, `onBeforeRouteMount`, `onResolved`, or `onRendered` because no match/lane was accepted. The public `navigate()` and every history-triggered `load()` `Promise<void>` in the chain must fulfill with `undefined` after cleanup rather than reject.
5. Never create, replace, or clear `router._tx` at this planning cap; its identity remains the captured previous owner. If that owner is an active redirecting transaction, abort its controller, finish its pending presentation, release its private resources, and let its existing `done` fulfill after the nested redirect returns, leaving the settled transaction pointer as normal. If the captured owner was already settled, do not abort or re-finalize it. Resolve and clear only the matching latest `commitLocationPromise`, relying on its resolve cascade to settle earlier redirect commit promises. Under P02, recompute `statusCode` from the retained committed presentation (existing error 500, existing not-found 404, otherwise 200), set `redirect` to undefined as this terminal catch's non-redirect result, perform no `loadedAt` or committed-tree-revision write, and clear only the current Vue transition owner if applicable.
6. If an unrelated navigation supersedes the capped preflight first, treat it as stale: do not log, alter its stores, clear its controller/handoff, or settle its commit promise, and wait for that current writer under the normal `awaitCurrent` rule.
7. `reloadDocument` redirects remain outside the client follow cap. Stale preflights must not spend depth or clear another load's handoff.

#### Tests and acceptance criteria

1. Make the bounded test stop at 21 context calls without reaching its sentinel. Assert one exact `console.error` cycle diagnostic; all public promises fulfilled; `latestLocation`/history at `/planning-cycle`; `state.location`, `resolvedLocation`, committed/presented match identities, and visible content retained at `/`; idle status; no pending matches; exact `onBeforeNavigate`/`onBeforeLoad` attempt counts and zero terminal events; cleared/aborted `_preflight`/handoff; and resolved/cleared matching `commitLocationPromise`.
2. Split previous-transaction ownership into two named controls, with an `_tx` store-assignment spy in both. **Active owner:** retain the exact `_tx` object identity, abort that owner's controller exactly once, finish its pending presentation and release each private resource exactly once, and require its existing `done` to fulfill with `undefined` only after the nested capped load unwinds; there must be zero `_tx` assignments. **Already-settled owner:** retain the exact `_tx` object, controller/signal state, settled `done`, presentation, and resources with zero abort/finalize/release calls and zero `_tx` assignments.
3. In success/error/not-found retained-presentation controls, assert `statusCode` is respectively 200/500/404, `redirect` is undefined, `loadedAt` and the private committed-tree revision are not written, and Vue `isTransitioning` ends false for the cleaned current owner while React/Solid remain at their base false value.
4. Add exact 19/20/21 planning cases; mixed context/beforeLoad/loader/lazy redirects; mounted, no-subscriber, and multiple-subscriber flows; reloadDocument; previous committed error/not-found; initial load without a resolved commit; and a superseding unrelated navigation.
5. Run the bounded test under a low memory limit to ensure a regression terminates diagnostically rather than exhausting the worker.

### N04 — Abort only the obsolete lane's wait for component readiness

**Severity:** major superseded-load liveness failure. **Validated by:** a failing stuck-component regression, the documented supersession contract, and three independent readiness reviews.

#### Observable failure

In `packages/router-core/tests/pr-7805-review-n04-obsolete-component-preload.test.ts`, `/first` blocks in a component `preload`. `/second` supersedes and commits, yet the old public `router.load()` remains pending until the obsolete component promise is manually released. Loader work is abort-raced; `task.ready` is not.

#### Required implementation

1. Start the shared `loadRouteChunk(route)`/`chunkFailure` work eagerly at the same point as today, keep it running, and attach its rejection normalization immediately. Dynamic imports and route lazy caches are not transaction-owned and must not be aborted or cleared on supersession; an abandoned waiter must never create an unhandled late rejection.
2. Make only the lane's readiness waiter abort-aware. Race the already-normalized `chunkFailure` result against `options.controller.signal`. Represent abort with an explicit internal canceled readiness outcome—not a resolved `undefined` that can fall through the success path—and have `reduceLane` unwind/release without publishing a boundary or invoking `options.onReady`.
3. Preserve current-lane error priority: normalize the chunk rejection before entering the abort race, and if that normalized rejection wins before abort, select the correct error/redirect/not-found boundary and load its terminal chunk. Define simultaneous delivery deterministically (an already-settled chunk outcome wins the checkpoint; otherwise an observed lane abort cancels only the wait) so scheduling cannot randomly hide a terminal error.
4. Apply the same abort-aware wait to selected error/not-found boundary chunk readiness in `reduceLane`; an obsolete boundary import must not recreate the hang.
5. Leave `loadClientRoute`'s final `awaitCurrent(router, tx)` semantics intact. The old load may wait for the successor transaction, but after the successor settles it must not wait for old private work.
6. Ensure a chunk rejection that arrives after abandonment is handled and cannot produce an unhandled rejection, stale error UI, console noise, or cache corruption.

#### Tests and acceptance criteria

1. Strengthen N04 with a gated `/second`: old load remains pending while the successor is pending, then settles immediately when `/second` commits while `/first`'s component preload is still unresolved. Release the obsolete gate only in cleanup.
2. Cover abort before/during/after component readiness, async loader then stuck component, lazy route plus component/pending/error/not-found chunks, and chunk failure racing abort.
3. Prove a component chunk shared with the successor continues and can be reused; do not “fix” liveness by aborting or clearing the shared import.
4. Assert a canceled readiness outcome never calls `onReady`, never emits success lifecycle events, and a late shared rejection is observed exactly once without stale UI or console/unhandled-rejection noise.

### N05 — Give every private background candidate explicit transaction ownership

**Severity:** major loader-flight lease leak. **Validated by:** a failing abort-signal ownership regression and three independent cleanup audits.

#### Observable failure

`packages/router-core/tests/pr-7805-review-n05-background-candidate-lease.test.ts` settles a private stale-reload candidate, supersedes before the commit closure, drains the losing load, and finds the candidate's loader signal still live. The candidate is outside `result.matches`; all pre-commit stale exits therefore miss its last lease.

#### Required implementation

1. Add a private background-candidate resource bag to `LoadTransaction` (a `Set<WorkMatch>` or a generalized lane-resource owner). Register a candidate immediately in `createLoaderTask`, before starting its resource load; waiting until `executeClientLane` returns leaves a supersession window.
2. Centralize idempotent resource primitives: release all registered candidates; transfer/move a candidate and its registration to a new match without decrementing; and clone a match's public semantic fields without copying `_flight`. `releaseFlight` clearing `_flight` makes repeated defensive calls safe, but explicit registration and identity checks must still prevent incorrect lease counts. P04 must use these primitives rather than spreading resource-bearing matches.
3. Release registered candidates on every losing path: serial/control return, unexpected transaction catch, stale after execute, stale inside view transition, superseding `previousOwner`, start-transition failure, trim, background reduction control/error, and losing background CAS.
4. Keep candidates registered with the transaction after the foreground commit while `runBackground` owns their eventual reduction. On successful background publication, transfer/unregister them because the projected committed matches now own the resources; on loss, release/unregister.
5. Coordinate existing cleanup in `trimLane` and `reduceLane` with the bag so a candidate released there is also unregistered. A stale old candidate must never abort/delete a newer same-ID flight; retain the map's flight identity checks.
6. Do not conflate this with N04: component readiness is a non-abortable shared waiter, while N05 concerns exact loader-flight lease ownership.

#### Tests and acceptance criteria

1. Make N05 abort the candidate signal and remove the old flight after the successor commits and the losing transition drains.
2. Cover pending and already-settled candidates, stale before/inside view transition, multiple parent/child candidates, redirect/error/not-found/trim, and unexpected publication rejection.
3. Verify successful background publication keeps the accepted resource usable, shared flights decrement exactly one lease per losing owner, and a newer same-ID flight survives old cleanup.

### H01 — Transfer source-owned lazy importers safely during HMR

**Severity:** major development correctness failure. **Validated by:** a real failing hot-refresh regression and three independent HMR/provenance reviews.

#### Observable failure

The new test in `packages/router-plugin/tests/handle-route-update.test.ts` initially materializes `oldImporter`, hot-updates the route to `.lazy(newImporter)`, and invokes the real router refresh. `hotRoute.lazyFn` remains old; old code imports twice and new code never imports because `lazyFn` lives outside `options` and the handler only clears `_lazy`.

#### Required implementation

1. Add explicit private provenance for lazy importer ownership. Public/source `.lazy(importer)` must mark the importer as source-owned. Generator-emitted route-tree `.lazy(importer)` must mark it as generator-owned through an internal second parameter/helper or equivalent metadata that survives route-tree mutation.
2. Update the router generator output and snapshots to install generated importers with that marker. Do not infer ownership from `newRoute.lazyFn === undefined`: a freshly re-imported source route legitimately lacks generator wiring, but an explicit source route may also have removed `.lazy()`.
3. Extend `AnyRouteWithPrivateProps` and `handleRouteUpdate` to reconcile importer plus provenance before clearing `_lazy`:
   - source old -> source new: replace with the new importer;
   - source old -> source removed: clear it;
   - generator-owned live -> fresh source without an explicit importer: preserve generator wiring;
   - any fresh explicit source importer: prefer it over prior generated/source ownership.
4. Mirror the reconciled importer/provenance onto the fresh HMR export in `syncHotRouteExport`, just as generated routing state is mirrored, so aliased imports and later updates see the live owner.
5. Clear `_lazy` only after the importer decision, then rebuild indexes and call `_refreshRoute` as today. Preserve component identity/Fast Refresh logic and stable generated route options.
6. Apply the same generated handler semantics to Vite and Webpack snapshots; the handler is stringified, so keep all required logic self-contained in `handleRouteUpdate` or substituted literals.

#### Tests and acceptance criteria

1. Make the failing explicit-old -> explicit-new test call each importer exactly once and leave `hotRoute.lazyFn === newImporter`.
2. Add explicit -> removed, generator-owned -> source refresh without importer, generated importer update after route-tree regeneration, source overriding generated, repeated updates, and importer rejection/retry cases.
3. Run both Vite and Webpack HMR code-generation snapshots and one real refresh/load integration per adapter framework.

### P07 — Generic Router SSR turns redirects into HTTP 200 responses

**Severity:** blocker. **Validated by:** one failing end-to-end handler/renderer regression plus three independent source/contract reviews.

#### Observable failure

`packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx` drives the documented `createRequestHandler(...)(renderRouterToString(...))` composition. A route redirect with status 307, `Location: /target`, and a custom header returns `200 + Location` on this branch. The header assertions pass, isolating the defect to status selection. Base/main returned 307 through `stores.statusCode`.

The same two-arm fallback appears in all six public renderer implementations:

- `packages/react-router/src/ssr/renderRouterToString.tsx`
- `packages/react-router/src/ssr/renderRouterToStream.tsx` (both readable-stream and pipeable-stream response construction)
- `packages/solid-router/src/ssr/renderRouterToString.tsx`
- `packages/solid-router/src/ssr/renderRouterToStream.tsx`
- `packages/vue-router/src/ssr/renderRouterToString.tsx`
- `packages/vue-router/src/ssr/renderRouterToStream.tsx`

`packages/router-core/src/ssr/createRequestHandler.ts` already merges the redirect response headers from `_serverResult`; TanStack Start separately short-circuits its redirect result and is not affected.

#### Required implementation

1. In every string/stream response creation path above, make status selection exhaustive over `router._serverResult`:
   - `render` uses `result.status` (200/404/500);
   - `redirect` uses `result.redirect.status` without normalizing to 200;
   - an absent result may retain the defensive 200 fallback only for direct/misordered renderer use.
2. Keep the generic request-handler sequencing compatible with base: it may still dehydrate and invoke the supplied render callback. Do not introduce a callback/dehydration short-circuit as part of this fix unless that API change is separately approved; the validated regression requires the correct status, not a new empty-body contract.
3. Preserve `result.redirect.headers` merging in `getRequestHeaders`, including `Location`, custom headers, and normal header precedence. Do not reconstruct the redirect from `options`, because the `Response` is the source of its final status and headers.
4. Keep stream cleanup ownership unchanged. The change must only affect the `ResponseInit.status` used before `createSsrStreamResponse`/stream transformation.

#### Tests and acceptance criteria

1. Retain the failing React string regression and make it pass without weakening its 307, `Location`, or custom-header assertions.
2. Add table-driven coverage for both returned and thrown redirects and at least one non-default redirect code (for example 301 or 308). Include redirects from `beforeLoad` and `loader`, because both normalize into the same server result through different phases.
3. Exercise React, Solid, and Vue string renderers and every stream response-construction branch that the test environment supports. At minimum, unit-test each adapter's status selector so a future `: 200` fallback cannot recur in one framework.
4. Add controls that normal render responses still produce 200/404/500 and that redirect headers survive unchanged.
5. Assert renderer/request cleanup still runs once on success and failure. Do not add an empty-body or callback-not-called expectation; that was not base behavior and is not needed to repair this regression.

### P11 — Functional `ssr()` failures skip the lazy route boundary chunk

**Severity:** major. **Validated by:** one failing real React SSR/lazy-route regression plus three independent source/contract reviews.

#### Observable failure

`packages/react-router/tests/pr-7805-review-ssr-regressions.test.tsx` defines a genuinely lazy `/reports` route whose functional `ssr()` throws. The server response correctly has status 500, but renders the built-in `Something went wrong!` fallback instead of the lazy route's error component.

In `packages/router-core/src/load-server.ts`, `contextualize` assigns `match.ssr` only after `await resolveSsr(...)` succeeds. A synchronous throw or asynchronous rejection therefore leaves `match.ssr` undefined. `applyFailure` correctly selects and commits the route error boundary, but terminal boundary readiness is guarded by `match.ssr === true`, so `loadRouteChunk(route, 'errorComponent')` is skipped. Base/main explicitly loaded the lazy boundary for a serial-phase route failure.

#### Required implementation

1. Split SSR policy resolution into a non-throwing local effective fallback and the optional functional override:
   - shell mode: root is renderable and descendants are not;
   - a `false` parent forces `false` and must continue to skip the child selector;
   - an explicit non-function option is inherited exactly as today;
   - an undefined option uses `router.options.defaultSsr ?? true`;
   - when the parent is `data-only`, an otherwise `true` fallback remains `data-only`.
2. Do **not** assign the fallback to `match.ssr` before invoking the selector. Compute it in a local variable, call/await the functional option with the same `matches` snapshot shape as the PR/base contract (completed ancestors carry their policies; the current and future entries retain their pre-selector values), and assign the normalized functional result only on success. If it throws/rejects, assign the local fallback to the current match immediately before failure reduction. This preserves selector input while still making terminal boundary readiness deterministic.
3. Keep terminal chunk loading policy-based:
   - fallback/effective `true` loads the selected lazy `errorComponent` or `notFoundComponent` before rendering;
   - `data-only` and `false` do not server-render route boundary components;
   - global root not-found still loads both the normal route chunk and not-found boundary as required by its existing path.
4. Do not blindly set `match.ssr = true` in the catch block. That would violate inherited `data-only`, `false`, shell-mode, and default-SSR semantics.
5. Preserve route-order failure priority and loader-prefix truncation. The selector failure remains a serial failure at its route index; this repair only makes its already-selected presentation boundary ready.

#### Tests and acceptance criteria

1. Retain the failing React SSR regression and make the lazy boundary text render with status 500.
2. Add sync-throw and async-rejection cases. Assert the lazy loader runs once and the correct boundary owns the error.
3. Add policy matrix controls for default/inherited `true`, inherited `data-only`, explicit/default `false`, and shell mode. Only effective `true` may preload/render the boundary on the server.
4. Add an `onError` conversion to `notFound()` case and verify the selected lazy not-found boundary and 404 status; include an ordinary error control to prevent accidental reclassification.
5. Verify descendants beyond the serial failure remain omitted and their `beforeLoad`, loaders, normal chunks, `head`, and `scripts` do not run.
6. Hydrate at least the effective-true error response and assert the server and client choose the same lazy boundary, preventing the current default-server/custom-client hydration mismatch.
7. Add a selector-input oracle over a nested route: record the current, completed-ancestor, and future-descendant `matches[].ssr` values seen by both sync and async selectors. The repair must not expose the locally computed fallback early or otherwise change this public selector snapshot.

### N07 — Preserve route context when a functional SSR selector fails

**Severity:** major server-rendering correctness defect. **Validated by:** one focused sync/async failing test plus independent adapters, server/hydration, client-transaction, and root reviews.

#### Failure mechanism and invariant

`executeServerLane` creates request-local match copies with `context: {}`. During serial `contextualize`, the current route's functional `ssr()` selector is awaited before the match receives its already-known parent and static route context. A thrown/rejected selector therefore selects the right route boundary and 500 status while leaving that boundary's `useRouteContext()` empty. The required phase boundary is:

```text
completed ancestor context
  -> current static __routeContext
  -> functional SSR selection
  -> validation/current beforeLoad (only if selection succeeds)
```

The context visible after selector failure must include router context, all completed ancestor route/beforeLoad context, and the failing route's already-planned static `__routeContext`. It must not include or synthesize the failing route's own `__beforeLoadContext`, because its `beforeLoad` has not run.

#### Required production changes

1. In `packages/router-core/src/load-server.ts`'s serial contextualization path, compute the current `parentContext` from the completed predecessor and assign `match.context = {...parentContext, ...match.__routeContext}` before calling or awaiting a functional `resolveSsr`.
2. Coordinate the ordering with P11: seed/resolve the route's effective SSR policy only after the base context exists; if selection succeeds, continue through validation and the current route's `beforeLoad`, then extend context with that accepted `__beforeLoadContext` exactly once.
3. If the selector throws synchronously or rejects asynchronously, preserve the pre-selector context on the selected terminal match. Do not rerun the route `context` function, do not run current `beforeLoad`, and do not overwrite the context again during reduction/projection.
4. Keep completed ancestor context immutable/request-local. A descendant selector failure must not erase or mutate ancestor matches, and concurrent server requests must never share a context object.
5. Ensure terminal `head`, headers/scripts, eager or lazy error/not-found boundaries, and public route-context hooks all observe the same selected match context. P11 still owns loading a lazy terminal boundary; N07 owns what that boundary reads.

#### Tests and acceptance criteria

1. Make both sync and async N07 cases in `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx` pass unchanged: status 500, exact selector error, router/layout/completed-ancestor-beforeLoad/failing-route static context present, and failing-route beforeLoad exactly zero calls.
2. Add a nested case whose ancestor beforeLoad is async and completes before the child selector fails; its context must be present. Add a root-selector failure where parent context is only router context.
3. Add a failing route whose `context` function itself throws as a separate planning-failure control; do not accidentally classify it as an SSR-selector failure or fabricate its context.
4. Add valid selector-failure controls: a synchronously thrown and asynchronously rejected ordinary error must select the ordinary error boundary, while supported thrown/rejected redirect and not-found sentinels must retain their existing terminal control-flow semantics. Do not add returned redirect/cancellation cases: the functional `ssr()` selector's return contract is only `undefined | SSROption`, so those would test an API the router does not provide. None of these failure controls may execute the current route's `beforeLoad`.
5. After P11 is fixed, repeat the sync/async assertions through a lazy error boundary and both React string/stream server renderers; add Solid/Vue server rendering parity or a framework-neutral core match-context assertion plus one adapter integration.

### N08 — Rebuild the visible hydration frontier's presentation context

**Severity:** major hydration consistency defect. **Validated by:** a real server-load/dehydrate/client-hydrate failing test plus independent adapters, server/hydration, client-transaction, and root reviews.

#### Failure mechanism and invariant

Hydration deliberately adopts only the contiguous server-committed semantic prefix, while `presented` also contains the first unresolved serialized `ssr:false`/pending match so its fallback can hydrate. `hydrate.ts` rebuilds context only for `committed`, after installing serialized `__beforeLoadContext`; the visible frontier keeps its initial client `matchRoutes` context from before that installation. Server markup therefore reads complete parent context while the client fallback begins with a truncated object.

Do not widen semantic adoption to fix a presentation problem. The invariant is:

```text
committed prefix: semantic adoption + chunks/head/scripts/data
one included frontier: context projection only
remaining suffix: ordinary client planning/load
```

#### Required production changes

1. In `packages/router-core/src/hydrate.ts`, keep the existing `committed` prefix and all href/key/id/currentness guards unchanged. Rebuild committed context exactly as today.
2. If `presented[committed.length]` is the already-selected serialized frontier, assign only its context from the rebuilt parent plus data already owned by that match: `{...parentContext, ...frontier.__routeContext, ...frontier.__beforeLoadContext}`. For a root frontier, use router options context as the parent.
3. Do not rerun the frontier route `context` function solely for presentation; use its already-planned `__routeContext`. Do not call its beforeLoad/loader/head/headers/scripts or mark it committed/successful. If serialized data legitimately contains its own accepted `b`, include it in the same merge order used on the server.
4. Keep `_committedMatches`, resolved-location adoption, chunk readiness, head/script execution, and initial-load skip decisions capped at `committed`. The context-projected frontier must still be replanned/loaded by the ordinary client lane.
5. Preserve data-only hydration behavior and abort/currentness checks. If the bootstrap is rejected or route IDs/href do not align, do not project stale serialized context into newly matched routes.

#### Tests and acceptance criteria

1. Make N08 in `packages/react-router/tests/pr-7805-review-server-context-frontier.test.tsx` pass unchanged. Before mount it must remain `pending`/`ssr:false` while containing `server-authenticated` and its child token; the server child loader remains zero calls.
2. Continue through `hydrateRoot` with the gated client loader and require identical fallback text and no React hydration mismatch diagnostic. Then release the loader, await the real client load, and prove terminal content/current context/idle resolved location.
3. Cover root and nested frontiers; `ssr:false`, serialized `pending`, and a frontier carrying its own serialized `__beforeLoadContext`; parent router/route/beforeLoad merge precedence; and a multi-level suffix proving only the one presented frontier is projected.
4. Add negative controls proving context projection does not execute the frontier loader, beforeLoad, head, scripts, or component preload and does not add the frontier to `_committedMatches`.
5. Cover bootstrap rejection and route-tree/href mismatch so no server context crosses into an unrelated client match. Run React string/stream hydration and a Solid/Vue selective-SSR parity case where their hydration mechanisms consume the same core state.

### D01 — Make the compile-time environment split actually remove the opposite lane

**Severity:** verified server-artifact/DCE defect; runtime dispatch remains correct. **Validated by:** a failing Vite/Rolldown SSR bundle-graph test, an esbuild reproduction, and three independent conditional-export/topology reviews.

#### Observable failure

`packages/router-core/tests/pr-7805-review-c-server-dce.test.ts` bundles a production Node/SSR consumer that resolves the literal server shim and includes `load-server.js`, but also renders `load-client.js` with `transferMatchResources`, `loadClientRoute`, and `preloadClientRoute` (about 29.6 kB unminified in the measured artifact). Esbuild independently retains the client lane. Browser production correctly prunes the server lane; development intentionally keeps both.

The root cause is topology, not the constant's value: `packages/router-core/src/router.ts` statically imports client functions directly from `./load-client`. Ordinary consumer bundlers do not propagate the condition-selected `isServer` literal far enough across that module boundary to remove all imported declarations, and `clearCache` unconditionally references a helper from the same large module.

#### Required implementation

1. Move environment-specific load dispatch behind the existing condition-selected `@tanstack/router-core/isServer` boundary (or an equivalent new conditional subpath). `router.ts` must not statically import the full client lane in a production server resolution, nor the server lane in a production browser resolution.
2. Give client/server/development condition files a type-compatible dispatch surface for:
   - route load;
   - preload;
   - development HMR refresh;
   - match-flight/resource release needed by `clearCache`.
3. Client condition: import/re-export the real client implementations and a non-server load stub only where needed for type compatibility. Production server condition: export literal `isServer = true`, import/re-export the server loader, use server-safe no-ops for client-only preload/refresh/resource-flight work, and never import `load-client.ts`. Development condition: retain both implementations and dispatch through `router.isServer`, because `isServer` intentionally resolves to undefined there.
4. If `transferMatchResources` is genuinely shared, extract only the minimal resource primitive into a small environment-neutral module. Do not keep it in `load-client.ts` and accept the entire lane as the cost of `clearCache`.
5. Remove `process.env.NODE_ENV === 'test' ? undefined : true` from the production server shim; that expression prevents it from being a compile constant and cannot coexist with a server-only dispatcher. Add `src/isServer/test.ts` with the same dual-dispatch surface as development, and add it to router-core's `tanstackViteConfig({entry:[...]})` so ESM, CJS, and declarations actually exist.
6. Put the package export's `test` branch **before every competing environment branch, including `development` and `node`**. Replace router-core's Vitest alias from `development.ts` to `test.ts`; replace React/Solid/Vue client-test `resolve.conditions: ['development']` with `['test']`. Server-only adapter test configurations that intentionally require literal server dispatch remain on the production server branch. Production Node/worker/Deno/Bun resolution, even under incidental `NODE_ENV=test` without the custom condition, must still choose the literal server module.
7. Preserve current runtime behavior and emitted types for Node, browser, worker/workerd, Deno, Bun, import, require, development, and explicit test conditions. Keep `process.env.NODE_ENV` HMR pruning independent from the environment-lane split. Test files that instantiate both `router.isServer = false` and `true` must run only through the explicit dual test condition, not through production server code.
8. Avoid dynamic imports in hot navigation paths unless they are proven not to change synchronous API/lifecycle behavior; condition-selected static modules are the preferred topology.

#### Tests and acceptance criteria

1. Make the focused production SSR graph test pass by scanning **all** emitted chunks/modules and finding no client-lane implementation exports or sentinels (`executeClientLane`, `preloadClientRoute`, redirect-cycle client code).
2. Add the inverse production-browser assertion: client lane present, server lane and server-only sentinels absent.
3. Add a development assertion that both lanes remain and runtime `router.isServer` selects correctly.
4. Exercise packaged conditional exports rather than only a source alias for Node/worker/workerd/Deno/Bun/browser and both ESM/CJS where supported.
5. Keep an independent esbuild control beside Vite/Rolldown. Record raw and gzip sizes as diagnostics, but gate on exact module/symbol absence so unrelated minification does not mask the regression.
6. Run client and server lane smoke navigations after the topology change, including server redirects, client preload, clearCache flight release, and HMR refresh in development.
7. Add resolution smoke tests for (a) `node + production`, (b) `node + NODE_ENV=test` without the `test` condition, and (c) explicit `test` condition even when `development` is also active. Inspect the resolver/metafile and assert the exact resolved `server.ts` or `test.ts` module path so the development branch cannot mask the test branch. The first two must resolve literal server-only dispatch and contain no client lane; the third must run one client router and one server router through dual dispatch. Also prove browser production remains literal client-only and the built package contains test ESM/CJS/type artifacts.

### N01 — Make Vue's global error-boundary reset key reactive

**Severity:** major same-route recovery failure. **Validated by:** a failing Vue render-recovery test and three independent store/CatchBoundary reviews.

#### Observable failure

`packages/vue-router/tests/pr-7805-review-global-boundary-reset.test.tsx` first catches a transient component render error in the global boundary. After the component is made healthy and `router.invalidate()` completes, a control proves root `fetchCount` advanced, but `Recovered page` never appears and the fallback remains. `MatchesInner` computes its reset key through a raw `matchStore.get().fetchCount`; raw TanStack Store reads do not establish Vue reactivity, and the same root match ID leaves the computed cached after the failed child subtree disappears.

#### Required implementation

1. Implement N06's core committed-tree revision signal and subscribe to it with Vue's `useStore` in `packages/vue-router/src/Matches.tsx`. Do not read a TanStack `Atom` through raw `.get()` inside `Vue.computed`; the global boundary must own a live subscription even after its child tree has failed.
2. Pass N06's stable scalar `router-instance namespace + committed revision` reset key through `CatchBoundary` unchanged. It must distinguish router replacement and every accepted active match-tree generation, including descendant-only background publications, without relying on a collision-prone bare root `fetchCount`.
3. Keep reset semantics scoped: accepted committed semantic publication resets a captured global error; cache-only/preload/pending/losing transaction changes do not.
4. Keep this private revision separate from P02's restored `loadedAt`. N01 subscribes to the collision-free revision; it must not broaden the public compatibility clock to child-only background publications.

#### Tests and acceptance criteria

1. Make the focused same-route invalidate test render `Recovered page` after proving `fetchCount` increments.
2. Add navigation to a different root-match identity with an equal numeric fetch count, repeated same-route invalidations, failed invalidation, and manual boundary-reset controls.
3. Assert the boundary does not reset for cached-route changes or a losing transaction that never publishes.
4. Cover default global fallback and a custom root error component, and ensure no warning/error is emitted after successful recovery.

### N06 — Reset global boundaries on any accepted committed-tree generation

**Severity:** major recovery failure in React and structurally all adapters. **Validated by:** a hardened failing React regression and three independent core/adapter reviews.

#### Observable failure

`packages/react-router/tests/pr-7805-review-global-boundary-background-reset.test.tsx` latches the global boundary on child revision 1, starts a child-only background reload, and proves revision 2 commits while the exact root object/fetchCount remains unchanged and the child advances once. The router is idle at `/child`, but the global fallback remains because React's key is only root ID/fetchCount. Solid and Vue use the same root-only shape (with Vue additionally affected by N01's non-reactive read).

#### Required implementation

1. Add a private per-router instance namespace/token and a monotonic committed-match-tree revision atom/store in router core. The namespace is stable for that Router instance and unique across instances; increment the revision exactly once, in the same batch as each accepted `publishMatches` semantic publication, whether foreground or `runBackground` and whether the changed match is root or a descendant.
2. Do not increment for pending offers (`stores.setMatches` presentation-only snapshots), preload cache publication, cache GC, a losing/stale transaction, a losing background CAS, or decorative store reads. One atomic multi-match publication increments once.
3. Initialize the revision deterministically for client-only startup and hydration. Hydration's accepted server match tree should establish one generation; merely reading/dehydrating state must not advance it.
4. In React, Solid, and Vue `MatchesInner`, subscribe reactively to the core revision and combine it with the router-instance namespace into one stable scalar global `CatchBoundary` reset key (for example an interned/string key). Do not allocate a fresh tuple/object every render, and do not substitute router object equality or root route/match ID: provider router replacement can preserve component/boundary identity and two route trees can share IDs and revision numbers.
5. Retain per-route boundary reset keys based on each route match generation; N06 concerns only the global fallback that can catch errors from any descendant.
6. Do not drive P02's public `loadedAt` from this revision. Preserve `loadedAt` at its base foreground/server on-ready commit boundary; the private revision alone advances for later accepted child/background semantic publications and is the correctness key. Do not use `Date.now()` as the private boundary key.
7. Implement N01's Vue fix with this same reactive signal; it repairs same-root foreground invalidation and descendant-only background recovery without two competing key mechanisms.

#### Tests and acceptance criteria

1. Make the hardened React N06 test recover without weakening any root/child identity, fetchCount, location/status, or diagnostic control.
2. Port the controlled scenario to Solid and Vue; each must prove the global rather than route-local boundary owns the error and recovers after child-only background success.
3. Retain N01's same-route Vue invalidation regression and make it pass through the same revision subscription.
4. Add deep-child, child background error -> later success, root identity replacement with equal fetchCounts, one multi-child background publication, and `RouterProvider` replacement between two Router instances at the same revision and same root/route IDs. The equal-revision router replacement must reset once; ordinary rerenders of one instance must not.
5. Add negative controls proving pending offers, valid preloads/cache writes, losing background CAS, and stale transactions do not reset a latched global boundary.

## Verified test-suite repairs

These are verified defects in PR-added regression coverage. They do not by themselves establish a production failure, so keep their tests separate from the production regressions above and do not claim a runtime fix until the hardened oracle fails before the corresponding code change and passes afterward.

### G01/P09 — Retain passing semantic-prefix and redirect-boundary controls

These two focused tests falsified suspected production defects but cover high-risk boundaries that the PR did not directly pin. Keep them in the eventual test patch:

1. `packages/router-core/tests/pr-7805-review-c-child-loader-deps-reuse.test.ts` must continue to prove a stable parent preload context is reused while changed child-only `loaderDeps` rerun child beforeLoad/loader and publish fresh child context/data. Harden with explicit different child IDs and unchanged final parent ID; keep call/data assertions as the public contract and private `_preloadContext` checks as diagnostics.
2. `packages/router-core/tests/pr-7805-review-p09-preload-redirect-boundary.test.ts` must continue to prove step 0 -> 20 is exactly twenty followed redirects and step 21 never executes. During P12/N02 redirect refactoring, also assert active `/` location/matches remain untouched and step 21 does not enter cache.
3. Do not add production changes for either passing case. Add thrown/returned, beforeLoad/loader, and reloadDocument variants only where shared redirect/prefix code changes make those controls valuable.

### T01 — Make the Vue root-pending test observe the pending phase

**Severity:** confidence gap in changed Vue rendering behavior. **Validated by:** three independent test/source audits.

#### Current false-positive window

`packages/vue-router/tests/Matches.test.tsx` names `should show pendingComponent of root route` but waits only for final `root-content`. Neither `root-pending` nor `default-pending` is queried. Its comments describe the deleted thrown-Promise/Suspense model even though this PR directly renders `status === 'pending'`, so removing pending rendering entirely still passes.

#### Required implementation and acceptance

1. Replace the 100 ms sleep with a controlled loader promise and set deterministic `defaultPendingMs: 0`/minimum timing.
2. Mount the provider, wait for the root route's `root-pending`, and assert the router is pending and final content is absent before releasing the gate.
3. Require `default-pending` to be absent while `root-pending` is visible. The root route's own `pendingComponent` is the precedence contract this named test must pin; do not retain an alternative expectation branch.
4. Release inside Vue's render flush, await final root content, then assert both pending variants are removed and router status/resolved location are idle/current.
5. Delete the obsolete Suspense comments and add a negative mutation/control proving the test fails if Vue `MatchInner` stops rendering pending matches.

### T02 — Isolate preload selector notifications from provider startup

**Severity:** bogus performance/correctness oracle across React, Solid, and Vue. **Validated by:** three independent setup/publication audits.

#### Current false-positive window

Each `store-updates-during-navigation.test.tsx` setup renders `RouterProvider` and returns immediately. The `redirection in preload` case snapshots selector calls while the initial router load can still publish, then attributes a rebaselined `+2` to preload. It neither isolates the operation nor proves the active semantic tree stayed unchanged.

#### Required implementation and acceptance

1. Make each framework setup asynchronous. Await index content, `router.state.status === 'idle'`, and resolved/current `/` before returning or baselining.
2. Clear the selector spy after initial settlement. Capture active location, resolved location, ordered active match IDs/object identities, status, and rendered UI.
3. Execute and fully await only the redirecting `/posts` preload. Assert the `/posts` loader and redirect each execute exactly once, but the operation does not navigate, replace active semantic matches, change active status/location, or render either redirecting or target route. Subscribe separately to `router.stores.cachedMatches`: require one successful `/other` target match to be published (with the active root excluded), no `/posts` error/redirect match, and no other cache publication. The preload follows the redirect and returns no public redirect object, so do not look for redirect metadata in `RouterState`.
4. After the settled-baseline spy reset, require exactly **zero** notifications from the existing public aggregate-state selector for the redirecting preload in React, Solid, and Vue. This selector reads active router state, not the cache; any nonzero notification is a failure rather than a value to rebaseline.
5. Add a non-redirect preload control and run the identical semantic assertions/counting procedure in React, Solid, and Vue.
6. Prove the hardened case fails if preload mutates active matches/location and remains stable if initial-load scheduling is deliberately delayed.

### T03 — Make the issue-7120 E2E execute and observe the View Transition path

**Severity:** merge-confidence gap for a race-specific fix. **Validated by:** three independent audits of the fixture, issue path, and Playwright assertions.

#### Current false-negative window

`e2e/react-router/issue-7120/tests/issue-7120.repro.spec.ts` waits for the root pending UI, releases the redirect, and asserts only the final `/posts` presentation and absence of logged errors. It never proves that `document.startViewTransition` existed or ran, and it never records intermediate commits. The test therefore passes if the browser skips the named View Transition path or if stale `Home` content commits briefly before `Posts loaded`.

#### Required implementation

1. Install a deterministic `document.startViewTransition` wrapper with `page.addInitScript` before `page.goto`, preserving the browser implementation when available and supplying an API-compatible test shim otherwise. Record invocation count, update-callback start/end, `updateCallbackDone`, and `finished` settlement.
2. Add stable fixture markers for the app/root shell, pending UI, stale Home route, and target Posts route. Start a `MutationObserver` plus requestAnimationFrame/commit log before releasing `redirectGate`; record semantic states rather than raw HTML.
3. Assert exactly one View Transition invocation, exactly one update-callback start/end pair, and successful settlement of both `updateCallbackDone` and `finished`. Do not permit a fixture-dependent alternative count.
4. Assert the presentation sequence contains pending followed by target, and contains neither stale Home nor an empty/unknown app state after the gate release. Keep final URL/content and page/console-error assertions as controls.
5. Make the instrumentation self-cleaning and diagnostic: on failure, include the ordered timestamped state/transition log, not a polling timeout alone.

#### Tests and acceptance criteria

1. Prove the hardened test fails when `startViewTransition` is disabled/bypassed and when a deliberate stale-Home commit is inserted into the fixture.
2. Prove it passes with native Chromium View Transitions and with the deterministic shim used in CI.
3. Avoid screenshot-only timing assertions; the semantic mutation/commit log must be the gating oracle.

### T04 — Observe every presentation between issue-7457 pending and target

**Severity:** merge-confidence gap for a transient blank-screen fix. **Validated by:** three independent audits of the E2E timeline and assertions.

#### Current false-negative window

`e2e/react-router/issue-7457/tests/issue-7457.repro.spec.ts` establishes only that pending appeared sometime (`__pendingSeen`) and that `/another` eventually rendered. A blank app root or transient index route between those endpoints satisfies all assertions.

#### Required implementation

1. Give the app shell, pending component, index route, and `/another` target stable semantic markers. Install a MutationObserver before router startup (prefer `page.addInitScript` plus an app-owned log hook) and record every coalesced commit/presentation state.
2. Begin the gating interval when pending first appears and end it only when the target has committed. For every observation in that interval, require the shell to contain pending or target; explicitly reject an empty shell, index-route content, simultaneous incompatible routes, and an unknown state.
3. Include a requestAnimationFrame sample after each mutation so an empty state lasting a render frame is observable while harmless same-task DOM replacement does not become flaky.
4. Keep `pageerror`, console error, final URL, target uniqueness, and pending disappearance assertions. Report the full ordered state log if the invariant fails.

#### Tests and acceptance criteria

1. Insert a controlled one-frame blank and a controlled one-frame index commit in a negative fixture/mutation; each must fail the hardened oracle.
2. Run the real auto-code-splitting reproduction repeatedly under CI scheduling without fixed sleeps.
3. Ensure the observer starts before the first route presentation and is removed after the terminal assertion.

### T05 — Assert Solid issue-7283's configured pending minimum

**Severity:** merge-confidence gap for selective-SSR hydration timing. **Validated by:** three independent audits of the route configuration and lifecycle log.

#### Current false-negative window

`e2e/solid-start/selective-ssr/src/routes/ssr-false-pending-min.tsx` configures `pendingMinMs = 1500` and stores timestamped lifecycle events. `issue-7283-dev-hydration.spec.ts` maps each event to `type` and discards `t`, so a 50 ms pending flash passes the same order assertion as a compliant 1500 ms presentation.

#### Required implementation

1. Return the full `{type, t}` records from `page.evaluate`. Select the final complete `pending-mounted -> pending-unmounted -> target-mounted` cycle by index rather than slicing types independently.
2. Measure page-side monotonic `performance.now()` timestamps and require `pending-unmounted.t - pending-mounted.t >= 1400` ms for the configured 1500 ms minimum. The fixed 100 ms tolerance covers scheduling/clock sampling only. Do not add an upper-duration correctness assertion; use Playwright's bounded test/expect timeout solely as the liveness guard for a fallback that never settles.
3. Assert loader completion precedes or coincides with the terminal transition as intended by the fixture, and `target-mounted` does not precede `pending-unmounted`.
4. Keep the development-mode hydration mismatch collection, final target visibility, pending detachment, and data-only control.
5. Export/expose the fixture's `pendingMinMs` to the test or record it in the event log so the test does not silently drift from the route constant.

#### Tests and acceptance criteria

1. Temporarily lower/disable the router's pending minimum in a negative fixture and prove the duration assertion fails.
2. Run under the dedicated Vite dev server because Solid's development hydration checks are part of the original contract.
3. Use monotonic page-side timestamps (`performance.now`) for differences and print the full lifecycle log on failure.

### T07 — Add a deterministic settles-during-mount transition regression

**Severity:** explicit unit-coverage gap for a known liveness race. **Validated by:** three independent reviews of the current test and original interleaving.

#### Current limitation

`packages/react-router/tests/preloaded-mount-resolution.test.tsx` is valuable and should remain: it verifies a completely settled pre-mount load emits `onRendered` after provider mount. Its own comment correctly says JSDOM does not deterministically reproduce the original case where loading flips/settles during the mount/effect batch. A benchmark is not a focused unit oracle for that interleaving.

#### Required implementation and acceptance

1. Retain the existing settled-before-mount test unchanged as one contract case.
2. Put the deterministic case in a new isolated `packages/react-router/tests/pr-7805-review-t07-mount-batch.test.tsx`; do not add its hoisted mock to `preloaded-mount-resolution.test.tsx`, because that would also withhold the effects on which the retained settled-before-mount control depends. In the dedicated file, partially `vi.mock('../src/utils')` with `importOriginal`. Keep every actual export except `useLayoutEffect`; implement that named export with native `React.useLayoutEffect`, but have its wrapper enqueue `{ordinal, callback, active, ran, cleanup}` instead of running the adapter callback. Use `vi.hoisted` state plus an async mock factory (`await import('react')`) so module hoisting is deterministic. The native wrapper cleanup must mark its queued entry inactive even if it never ran, and invoke a retained production cleanup exactly once if it did run. This intercepts only the adapter helper imported by `Transitioner.tsx` and `Matches.tsx` in this isolated module graph, not native React effects, and changes no shipping source.
3. Configure `router.options.InnerWrap` as a `CommitProbe` around the complete `Matches` inner tree. `CommitProbe` uses native `React.useLayoutEffect` to record each real React commit. Render an **unresolved** router through raw `createRoot` with the act-environment flag disabled. At the first commit, require exactly three active queued entries in source order: Transitioner callback installation, Transitioner mount reconciliation, then the initial MatchesInner acknowledgement. Capture their identities/ordinals and prove no loader, route event, or resolved location exists yet.
4. Run the three initial entries synchronously in their real layout-effect order, before yielding to any microtask. Entry 1 must install `router.startTransition`/`router._rendered`. Entry 2 must take the unresolved-location branch and start the real initial `router.load()`; wrap/spy that method before render to retain the exact returned `Promise<void>` without substituting its implementation, and require one call. Entry 3 then calls the installed `_rendered` while no final transition acknowledgement exists yet, so it must emit nothing and settle nothing. This third call is required for scheduler fidelity: React runs every layout effect in the commit before loader microtasks. Configure no pending component/offer, await the gated loader's start through microtasks, and release it immediately in that same host task before yielding to a React render task. Do not use `act`/`flushSync` between loader start and release, because that would manufacture an intermediate presentation commit.
5. Let the accepted match publication cause the next real commit. The already-run initial MatchesInner wrapper must be cleaned and marked inactive; exactly one new active MatchesInner acknowledgement entry must be appended for the final match snapshot, while the two Transitioner entries remain the already-run originals. Before running the new entry, require Home committed in the DOM and exactly one `onLoad`/`onBeforeRouteMount`, but an unsettled captured load promise, pending router status, undefined resolved location, and zero `onResolved`/`onRendered`. Run only that current acknowledgement entry, then drain microtasks: it must resolve the real transition acknowledgement and the captured `router.load()` promise with `undefined`, producing exactly one `onResolved` and one `onRendered`, idle status, and current resolved `/`. Because this harness starts a direct load rather than `commitLocation`, assert `router.commitLocationPromise` remains `undefined` throughout and no orphan commit promise appears. Invoking or draining an inactive entry must be a test failure, not a way to complete the load.
6. Add an unmount/remount variant so P03's teardown repair cannot mask the mount-time race. In `finally`, release the loader if needed, run retained production cleanups for active entries, unmount, and boundedly drain the captured load; assert no queued callback or signal survives cleanup.
7. Prove the oracle is diagnostic with source-local negative mutations: deleting Transitioner's unresolved mount-load branch must leave the loader unstarted, while deleting the final MatchesInner `_rendered` acknowledgement must leave the DOM committed but the public load promise unsettled and `onRendered` at zero. Restore each mutation after the negative run. Keep a bounded timeout only on these liveness waits, never as the scheduler.

### T08 — Fill pending replacement/stale-content parity across adapters

**Severity:** cross-framework parity gap. **Validated by:** three independent test-matrix inventories.

#### Current gap

React and Solid cover both root and child continuously visible fallback replacement; Vue covers root only. Solid alone has a direct same-route stale-content/no-fallback case. These omissions do not prove adapter failures, but leave shared core behavior capable of regressing selectively through framework scheduling.

#### Required implementation and acceptance

1. Build a table-equivalent scenario matrix for all three adapters:
   - root fallback promise replacement;
   - child fallback promise replacement;
   - same-route stale content before `pendingMs` when no usable fallback exists;
   - `forcePending` with `pendingMinMs` across a replacement;
   - supersession before the first and after the second fallback acknowledgement.
2. Use shared conceptual gates/deadlines and adapter-specific flush helpers. Assert semantic events, visible content, exact fallback mount/unmount counts, and final idle/location rather than matching implementation render counts.
3. Preserve the original pending-min deadline across same-boundary replacement and prove P08's updated snapshot fields belong to the successor.
4. Drain both predecessor and successor navigation promises and assert no post-unmount acknowledgement/onRendered event, tying the matrix to P03/P05.
5. Keep framework-specific tests where needed, but use identical case names and expected state timelines so future parity audits are mechanical.

### T09 — Remove accidental transaction overlap and prove predecessor settlement in issue 7051

**Severity:** false-positive/liveness gap in two React regressions. **Validated by:** three independent setup and promise-ownership audits.

#### Current false-positive windows

`packages/react-router/tests/issue-7051-force-pending-suspense.test.tsx` mounts `RouterProvider` and immediately invokes `router.load()` itself. The provider effect can already own an initial same-location load, so the test's baseline may exercise supersession, joining, or cache adoption rather than the ordinary provider-only initial load it claims to establish. In the regular-navigation case, the `/first` navigation is intentionally started with `void`; only `/second` is retained. A regression that aborts `/first` but never settles its public promise therefore passes every current assertion and can leak into test cleanup.

#### Required implementation

1. In the `forcePending` case, remove the explicit `router.load()`. Mount the provider, await the route content, then wait until status is `idle`, current/resolved location is `/force-pending`, `router._pending === undefined`, and a settlement observer attached to the retained current `router._tx.done` has already fulfilled with `undefined`. Do **not** require `_tx === undefined` or infer liveness from its controller signal; this PR intentionally retains the settled current transaction pointer. Record the initial loader call count so invalidation is proven to be the next and only operation.
2. Start `invalidate({forcePending: true})` only after that baseline. Keep the controlled reload gate, assert pending UI/status and no error boundary before release, then await the invalidation and final idle state. Require exactly one additional loader call and drain cleanup in `finally` if an assertion fails.
3. In the `/first` -> `/second` case, capture both returned navigation promises. Attach explicit settlement observers before superseding so a rejected promise cannot become an unhandled rejection and a hanging promise is visible.
4. After `/second` starts and `/first`'s signal aborts, assert the `/first` `Promise<void>` is still unsettled while the current successor is pending. This pins the existing `awaitCurrent` contract: a superseded public load waits for the current winning transaction rather than rejecting or reporting an independent success. Require no `/first` `onResolved`/`onRendered` event and keep the visible predecessor fallback only while the successor owns pending presentation.
5. Release the second loader and record `/second` commit/events before settlement. Require both public navigation promises to **fulfill with `undefined`** only after `/second` commits (neither rejects and `/first` cannot remain pending); no relative microtask order between the two fulfillments is part of the contract. Then require idle `/second`, resolved/current location agreement, second content, no first pending/error content, no error-boundary call, and no unhandled rejection.

#### Tests and acceptance criteria

1. Run each case alone and together; neither may depend on provider effect timing or prior cache state.
2. Demonstrate the second test fails under a negative mutation that leaves the superseded navigation promise unresolved even though `/second` renders.
3. Preserve the original issue-7051 force-pending presentation assertions; the hardening changes ownership/setup observability, not the expected runtime UI.

### T10 — Prove the throwing onLoad listener executes and is isolated

**Severity:** bogus oracle for the event-emitter catch-and-continue path. **Validated by:** three independent emitter/test audits.

#### Current false-positive window

`packages/react-router/tests/transitioner-listener-errors.test.tsx` registers a first `onLoad` subscriber that throws for `/first`, but never records that subscriber or the caught exception. Route hooks, the later subscriber, and both route UIs still satisfy all assertions if the throwing subscriber is skipped entirely. The production contract at `Router.emit` is explicit: invoke matching subscribers in registration order, catch each exception, report it with `console.error`, then continue iterating.

#### Required implementation

1. Define a spied first listener that records the event pathname and throws the exact `listenerError` only for `/first`; keep its registration before the later listener.
2. Spy `console.error` before navigation and restore it in cleanup. After `/first`, assert the first listener ran exactly once with an `onLoad` event whose `toLocation.pathname` is `/first`, and `console.error` received the exact error object exactly once.
3. Require the exact ordered log `throwing listener -> console.error(listenerError) -> later listener` for the same `/first` `onLoad` event. `Router.emit` is synchronous and registration-ordered, so no weaker order/count branch is acceptable.
4. Unsubscribe the throwing listener, navigate to `/second`, and prove it receives no second event or report while the later subscriber and `onEnter` hooks continue exactly once per route.
5. Retain final UI, loaded-path, and cleanup assertions. Fail on any additional console error so unrelated render/router errors cannot hide behind the deliberate diagnostic.

#### Tests and acceptance criteria

1. The hardened test must fail if the first subscriber is deleted/skipped, if the emitter stops after it throws, or if the error is swallowed without the documented report.
2. Keep a separate non-throwing multiple-listener control if exact callback order becomes relied upon elsewhere; do not overfit this regression to React render counts.

### T11 — Replace the Vue abort test's real-time polling with owned gates and exact lifecycle oracles

**Severity:** slow and non-diagnostic navigation-abort coverage. **Validated by:** three independent timing, signal, and settlement audits.

#### Current false-positive window

`packages/vue-router/tests/loaders.test.tsx`, `navigating away from pending UI aborts its loader`, waits `30 * WAIT_TIME` (roughly three seconds) so a `pendingMs = 20 * WAIT_TIME` fallback appears while the loader timer is `40 * WAIT_TIME`. It then checks only that the pending component and abort callback ran at least once and that Bar eventually appears. Duplicate loaders/aborts, the wrong signal being aborted, a hung `/foo` navigation, stale Foo/pending UI, or a non-idle final router all pass.

#### Required implementation

1. Start from a fully settled `/` provider baseline. Replace the Foo loader timer with controlled `fooStarted` and `fooGate` promises, capture its exact `AbortSignal`, and attach one `{once:true}` abort handler that records/settles an `fooAborted` gate. Configure `pendingMs: 0` (and deterministic `pendingMinMs`) so no wall-clock sleep is needed.
2. Invoke `router.navigate({to:'/foo'})` directly and retain that returned public promise; require exactly one Foo loader invocation and one pending mount, the signal initially live, pending visible, Foo absent, and router pending at `/foo`.
3. Capture the `/bar` navigation promise, await the exact abort/start transition, and assert the captured Foo signal—not merely any callback—became aborted exactly once. Assert no error component/event was published for `AbortError`.
4. Resolve any loader gates needed for deterministic cleanup, then await both predecessor and successor navigation promises with a bounded liveness helper. Require idle current/resolved `/bar`, Bar present exactly once, and Pending/Foo absent; require exact loader, abort, pending mount/unmount, and route hook counts.
5. Put gate resolution and both promise drains in `finally` so an early assertion never leaves a live timer, signal listener, or navigation. Prefer controlled promises; use fake time only for a separate pending-threshold/minimum case.

#### Tests and acceptance criteria

1. The case must complete without multi-second sleeps and fail if the wrong loader is aborted, abort fires twice, Foo settles visibly after Bar, or either public navigation never settles.
2. Add an adjacent ownership control where Foo completes before Bar navigation: prove its public navigation promise is fulfilled before starting Bar and its captured signal remains live while the committed Foo match owns the flight. When Bar unloads Foo and releases the final lease, require that exact signal to abort exactly once, without publishing an `AbortError` component/event. This deliberately follows P04/N05's lease contract; completion alone does not detach a committed match from its flight.
3. Add the same direct-`router.navigate` owned-signal case in React and Solid as well as Vue, with identical signal, promise-settlement, final-state, and semantic UI assertions. T08's presentation matrix does not substitute for this abort-ownership oracle.

### T12 — Replace the context-insensitive pending-preload reuse oracle

**Severity:** bogus oracle in a PR-added core contract test. **Validated by:** N10's failing context-sensitive reproduction and four independent test/source reviews.

#### Current false-positive window

`packages/router-core/tests/preload-beforeload-reuse.test.ts`, `keeps beforeLoad independent while joining a pending preload loader`, expects two beforeLoad calls and one loader call, but its loader ignores public `context` and returns a shared string. It therefore passes when navigation reruns version-2 beforeLoad yet joins loader data computed under version 1. The newly added preload documentation says a pending preload does not donate beforeLoad context, while the loader contract says loader context includes the accepted route/beforeLoad context; the existing expectation combines those promises inconsistently.

#### Required implementation and acceptance

1. Replace the context-independent loader return with a snapshot containing the exact route-context and beforeLoad-context generation received by each invocation. Gate preload version 1 and navigation version 2 independently and retain both public promises.
2. For the pending-preload case, require two beforeLoad calls, two loader calls, and final navigation context/data both from version 2. Assert the version-1 result may settle only for the preload's own lineage and cannot enter the active match/cache as version 2.
3. Split safe coalescing into its own positive case: establish an explicit completed donor or identical already-established input-generation token, then require one loader and coherent donated context/data. Do not preserve “one loader” merely because route ID/path/loaderDeps match.
4. Put all gate releases, promise drains, signal/lease assertions, and cache cleanup in `finally`. Run the hardened incompatible case against the current PR head before the production fix and prove it fails for N10's exact context/data split; run the compatible control and prove it stays green.
5. Add negative mutations for (a) ID-only flight lookup and (b) grafting a flight result into a differently contextualized match. Each must fail the hardened incompatible oracle, while disabling compatible coalescing must fail the positive control.

## Final implementation sequencing

1. **Land diagnostic test hardening first.** Implement T01, T02, T03, T04, T05, T07, T08, T09, T10, T11, and T12 without production changes. T07's deterministic scheduler lives entirely in its test-time partial mock. Run each hardened oracle once against an intentional negative mutation (or the known broken interleaving) so it is proven diagnostic, then restore the mutation. Retain G01 and P09 as passing controls. T12's incompatible case is already red through N10; its safe-donor control must remain green. This prevents later production edits from appearing correct only because an existing PR test is non-diagnostic.
2. **Restore the compatibility/publication foundation.** Implement P02's stores and aggregate state first. Write public `loadedAt = Date.now()` exactly once at the accepted foreground/server on-ready presentation commit and never for a later background publication. Add N06's separate private monotonic committed-tree revision at accepted foreground publications and additionally at accepted child/background semantic publications, then wire N01/N06's reactive global-boundary keys in React, Solid, and Vue. Gate on P02, N01, and N06 focused tests plus losing/pending/preload negative controls before touching transaction algorithms.
3. **Repair framework transition ownership.** Introduce one stable owner-safe non-rendering fallback, then implement P03 in React and P05 in Solid/Vue. Only Vue owns writes to P02's compatibility `isTransitioning` store; React keeps transition state local and Solid preserves the public store's base false value. Run mounted, unmount-during-flight, post-unmount navigation, StrictMode/remount, false-acknowledgement, and pending-min tests for all three adapters.
4. **Make client transaction resources and projection private.** Implement N05's explicit transaction resource bag/transfer/release helpers, then P04's private asset-projection lane on top of that ownership model. Prove every stale/pre-commit/view-transition/error exit releases exactly once and that losing projections cannot mutate or notify committed matches.
5. **Repair pending-session presentation.** Implement P08's same-boundary owner transfer and successor snapshot republish without restarting the original pending minimum. Re-run the T08 cross-adapter replacement matrix and T09 predecessor-settlement case so lifecycle changes cannot hide a stuck superseded load.
6. **Unify complete loader-input lineage.** Implement P10, N03, and N10 together: one semantic parent descriptor for hook context and one post-contextualization input-generation token for loader execution, cache reuse, and flight identity. Include both parent lineage and the route's own route/beforeLoad context; keep incompatible same-ID flights independently owned while compatible generations coalesce. Run P10/N03/N10 failures, T12's rewritten cases, and G01's stable-parent/changed-child passing control after each substep.
7. **Replace redirect authority atomically.** Implement P12's exact one-shot redirect handoff, then have N02 planning failures consume/count the same chain depth before transaction creation. Run primed/fresh, returned/thrown, beforeLoad/loader/planning, unrelated-navigation, self/cycle, and P09 exact-boundary controls; step 0 -> 20 must remain accepted and step 21 must remain excluded.
8. **Separate obsolete chunk waits from shared chunk work.** Implement N04's lane-local abort race without aborting the shared dynamic import or changing terminal chunk error selection. Then implement P06's React attempt-local reload latch reset. Run normal/pending/error/not-found chunk race matrices and recognized/generic/concurrent lazy retry cases.
9. **Repair HMR importer provenance.** Implement H01's source-owned versus generator-owned lazy importer metadata and transfer/removal rules. Update both Vite and Webpack handler snapshots, run explicit source add/change/remove cases and generated lazy-route preservation, and prove an obsolete import cannot install after `_lazy` ownership is cleared.
10. **Repair server contextualization and boundary readiness as one ordered phase.** Implement N07's pre-selector context materialization and P11's pre-selector local fallback computation in the same `load-server.ts` pass. Do not publish that fallback into the selector's `matches` snapshot unless the selector fails. Keep current-route beforeLoad absent on selector failure, preserve inherited `true`/`false`/`data-only`/shell semantics, and load only the selected terminal boundary. Run the eager N07 sync/async cases first, then P11 lazy-boundary cases and policy/not-found/redirect matrices.
11. **Repair hydration presentation without widening adoption.** Implement N08's one-frontier context projection after the committed prefix is rebuilt. Run the full server render/dehydrate/core hydrate/`hydrateRoot` regression through terminal client settlement and assert no frontier loader/head/chunk work occurs during projection.
12. **Restore generic redirect HTTP status.** Implement P07 in every string/stream response-construction branch after server result selection is stable. Run returned/thrown redirects from each phase and React/Solid/Vue renderer status/header/cleanup matrices; do not change request-handler callback/dehydration sequencing as part of this fix.
13. **Change conditional-import topology last.** Implement D01 only after lane APIs and resource helpers have their final shapes. Run production server, production browser, and development conditional graph assertions, client/server smoke navigation, clearCache/HMR, package builds, and the measured `react-router.minimal`, `solid-router.minimal`, and `vue-router.minimal` emitted bundles. Gate on symbol/module absence, with gzip/raw sizes recorded as diagnostics.
14. **Final acceptance.** Run every focused production regression independently so a shared failure cannot mask another; then router-core and React/Solid/Vue unit, type, and lint targets; generic SSR string/stream integration; router-plugin HMR tests/snapshots; package builds; hardened issue-7120/7457/selective-SSR E2E; conditional-export/DCE checks; and the full bundle-size matrix. All intentionally failing review tests must be green without weakened assertions, G01/P09 must remain green, and P01/N09 must receive no production change.

This sequencing covers every verified production and test-suite finding in `ISSUES.md`. Rejected P01, P09-as-a-defect, and N09 remain documented controls/caveats only and are deliberately absent from production work.
