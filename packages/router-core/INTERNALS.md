# Router Match Loading Internals

This document describes the match-loading architecture shared by router core and
the React, Solid, and Vue adapters. It is intended for maintainers changing
navigation, preloading, pending UI, SSR, hydration, route chunks, or route HMR.

Its scope ends at route-match publication and the immediate framework handoff.
The request handler, manifest reduction, Seroval stream protocol, backpressure,
and HTTP response cleanup in `src/ssr/` are separate concerns except where they
determine the server-to-client match handoff described here.

The implementation is deliberately a small ownership and publication protocol,
not a second match-status state machine. TypeScript brands constrain
phase-specific call sites, and closed outcome unions make control results
exhaustive. Reentrancy, cancellation, resource ownership, pending timing, and
publication remain runtime concerns enforced by the identities described below.

All `_`-prefixed fields and functions discussed here are internal. Their exact
shape is not a compatibility contract.

## Design constraints

The loader is built around these rules:

1. A foreground navigation builds a private lane. Only the current transaction
   may commit it, and presentation remains separate from accepted semantics.
2. Context is materialized serially from parent to child. Client loader and chunk
   work start concurrently; server chunks start after concurrent loader
   selection. Each parallel phase consumes results in structural route order.
3. Shared work never grants semantic publication authority. Losing work releases
   its resources and cannot commit a stale lane.
4. Runtime state exists only for a real ownership, publication, or completion
   boundary. Phase naming and impossible local transitions belong in TypeScript.

Correctness takes priority over size, but the architecture must remain lean. In
particular, do not reify TypeScript-only phases as runtime state, and do not add a
second cache for work already cached by the JavaScript module system.

## Navigation at a glance

The normal client path is:

```text
Router.load lifecycle events
  -> synchronous matching under foreground preflight ownership
  -> install transaction and requested location
  -> serial beforeLoad contextualization
  -> concurrent loader and route-chunk work
  -> phase-local reduction
  -> projection
  -> guarded foreground commit
  -> transition acknowledgement
  -> resolved location, idle status, and navigation completion
```

Pending presentation may publish while the private lane runs. A guarded
background reload may publish a later semantic replacement after the foreground
commit. Neither is a second foreground transaction.

The location and match references intentionally advance at different moments:

| Moment                                  | `stores.location` | `stores.resolvedLocation` | `_committedMatches` | `stores.matches`               | Status    |
| --------------------------------------- | ----------------- | ------------------------- | ------------------- | ------------------------------ | --------- |
| Idle                                    | old               | old                       | old lane            | old lane                       | `idle`    |
| Transaction installed                   | new               | old                       | old lane            | old lane or new pending prefix | `pending` |
| Terminal commit, before acknowledgement | new               | old                       | new lane            | new lane                       | `pending` |
| Transition acknowledgement settled      | new               | new                       | new lane            | new lane                       | `idle`    |
| Installed transaction rolls back        | new               | old                       | old lane            | old lane                       | `idle`    |

`latestLocation` is the parsed history input captured before planning. It is not
another published phase. In particular, `stores.location` advancing does not
mean that destination matches have committed or rendered. After an unexpected
post-install orchestration failure, `idle` likewise does not imply that
`stores.location` and `stores.resolvedLocation` are equal.

## File map

Paths in this section are repository-relative.

- `packages/router-core/src/router.ts` matches locations, owns router-level
  authorities, and starts client or server loads.
- `packages/router-core/src/load-client.ts` contains client lanes, foreground
  transactions, loader flights, preloads, pending presentation, background
  reloads, and atomic commits.
- `packages/router-core/src/load-server.ts` contains the request-local server
  lane and SSR selection.
- `packages/router-core/src/hydrate.ts` reconstructs the server-resolved prefix
  and hands unresolved work to the ordinary client loader.
- `packages/router-core/src/route-chunks.ts` owns lazy-route option installation
  and component preloading.
- `packages/router-core/src/stores.ts` owns the common active/cache pool topology
  and reconciliation algorithm. Adapter `routerStores.ts` files provide the
  reactive or non-reactive primitives and optional derived indexes.
- `packages/router-core/src/ssr/` serializes server results and coordinates the
  stream and response lifecycle, which is mostly outside this document's scope.
- `packages/{react,solid,vue}-router/src/Transitioner.*` connect history and
  renderer transitions to router core.
- Adapter `Matches.*` files own aggregate/root rendering and React's render
  acknowledgement. Adapter `Match.*` and `ClientOnly.*` files own per-route
  pending, error, not-found, selective-SSR, and client-only boundaries.
- `packages/router-plugin/src/core/hmr/handle-route-update.ts` installs route
  updates and asks core for a development-only refresh.

## Vocabulary

**Match** is the state for one route at one location. Its semantic fields include
route and `beforeLoad` context, loader data, status, and failure information.
Match identity is derived from route id, interpolated path, and loader
dependencies. It controls semantic and cache reuse.

**Lane** is an ordered root-to-leaf array of matches for one location. Its
semantic result is private until commit; pending UI may project a presentation
prefix from it without acquiring semantic authority.

**Transaction** is the identity that authorizes foreground publication for a
client navigation. It owns a lane, a cancellation controller, and a completion
promise. The latest transaction remains installed after settlement, so its mere
presence does not mean loading is active.

**Presentation** is what `stores.matches` currently exposes to the framework. It
may temporarily be a shortened lane ending in a pending match.

**Committed lane** is the accepted active semantic generation in
`router._committedMatches`. It normally contains the last terminal result and
remains the planning base while pending UI is presented.

**Terminal lane** is a reduced and projected client lane ready for semantic
publication. It may end in success, an ordinary error, or not-found.

**Resolved prefix** is the count of accepted leading matches whose semantic work
is already complete, usually from SSR hydration or the active lane. It is a
length, not a zero-based boundary index.

**Terminal cache** is the set of off-screen semantic matches exposed by
`stores.cachedMatches`. The cache is neither active presentation nor a registry
of in-progress work.

**Flight** is one loader generation and its outcome. A lease means a particular
match owns that generation and its `AbortSignal`.

**Projection** computes non-loader route output such as head metadata, scripts,
styles, and, on the server, headers after semantic outcomes have been reduced.

**Authority** is an identity or state comparison whose equality permits a
publication or resource mutation. A boolean that merely restates an authority is
not a new authority.

## The runtime authorities

There are intentionally few independent authorities:

| Authority                  | Meaning                                                        | Must not be used as                    |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `router._tx`               | Latest foreground transaction; equality authorizes publication | A loading boolean; use `stores.status` |
| `router._committedMatches` | Accepted active semantic generation                            | The currently rendered lane            |
| `stores.matches`           | Presentation offered to the renderer                           | A semantic planning base               |
| `stores.cachedMatches`     | Off-screen semantic cache                                      | Active routes or in-progress work      |
| `stores.status`            | Public loading-state projection                                | Foreground writer identity             |
| `stores.location`          | Requested location                                             | Proof that loading finished            |
| `stores.resolvedLocation`  | Last location whose load/hydration settled                     | The requested location                 |
| `router._pending`          | One pending reveal/minimum-duration session                    | A second navigation transaction        |
| `router._preflight`        | Latest synchronous foreground planning controller              | A second writer                        |
| `router._preloads`         | Active complete preload lanes                                  | Per-match loader sharing               |
| `route._lazy`              | Current lazy-route import owner or loaded marker               | A component-module cache               |

The most important separation is:

```text
transaction/preload lanes -> private work; no semantic publication yet
_committedMatches         -> active semantic reuse, planning, background CAS
stores.cachedMatches      -> inactive semantic reuse and preload cache CAS
stores.matches            -> renderer presentation, including pending prefixes
```

Pending presentation can remove hidden suffix entries from the reactive match
pool. Planning from it would therefore forget valid committed matches and make
presentation timing affect loader semantics. Once `_committedMatches` is
initialized, full lane planning and semantic reuse use it and the terminal
cache. Lightweight matching for `buildLocation` may still consult the active
presentation pool only to reuse already-parsed params; it is not loader planning.

The active and cached pools remain separate, so the same match id may exist in
both. Reconciliation preserves existing per-id stores, suppresses exact
same-object writes, and updates each pool's id order only when that order changes.
These are framework-notification and indexing rules, not loading authority.

### Completion scopes

Promises also have deliberately narrow ownership:

| Promise or acknowledgement | Scope                                                  |
| -------------------------- | ------------------------------------------------------ |
| Flight outcome             | One loader invocation                                  |
| `tx.done`                  | One private foreground transaction                     |
| Pending/transition ack     | Settlement and render confirmation for one publication |
| `commitLocationPromise`    | History/navigation completion                          |
| `parentMatchPromise`       | One loader's view after its parent's loader settles    |

These scopes are not interchangeable. A new “latest load” promise usually
duplicates transaction or history-completion authority and makes supersession
ambiguous. On the client, a successful parent has already received its loader
data when `parentMatchPromise` resolves; parent error/not-found reduction may not
yet have run. The server instead resolves the promise to a snapshot with the raw
loader outcome applied, not the final reduced lane or selected not-found
boundary.

## Planning a lane

`matchRoutesInternal` performs synchronous, parent-first planning in two passes.

The first pass:

1. validates and accumulates search,
2. computes `loaderDeps`,
3. interpolates the raw path params,
4. derives the match id from route id, interpolated path, and serialized loader
   dependencies,
5. looks up an allowed committed or cached semantic match, and
6. parses strict params only for a fresh match, then creates or clones the work
   match.

The second pass finalizes params and runs route `context` functions for fresh
matches in parent-first order.

Route continuity and match reuse are related but distinct:

- Match id controls semantic/cache reuse.
- Route id controls `enter`, `stay`, and `leave` lifecycle semantics.
- The previous active match for a route stabilizes params, search, and loader
  dependencies. A cached match is not an active route merely because it is
  reusable.

### Why `_preflight` exists

Planning calls user code synchronously: search validators, `loaderDeps`, param
parsers, route context, and related hooks can trigger reentrant navigation.
`assertMatchOwner` checkpoints after these calls. A new foreground plan aborts
the previous `_preflight`, so an obsolete stack frame cannot later install
itself as writer.

`_preflight` is not a second completion authority. `_tx` remains the sole writer
until a replacement has finished matching successfully. Folding preflight into
`_tx` would require publishing a partially constructed transaction and then
rolling it back if matching throws. The small preflight controller represents a
real synchronous ownership boundary and avoids that invalid partial state. Its
presence alone does not prove planning is active: a failed current plan may leave
an aborted controller installed until the next plan replaces it.

Client preloads do not replace `_preflight`. They use a local controller and a
snapshot of `_tx`, because speculative work may be canceled by foreground
navigation but may never claim foreground planning authority. A merely built or
blocked navigation likewise does not change `_tx`; only a successfully planned
foreground lane installs a replacement transaction.

### Planning failures are not lane outcomes

The owner of an error depends on whether matching produced a lane:

- A foreground plan invalidated by reentrant navigation quietly follows the
  successor transaction. A planning redirect starts a replacement navigation.
  Any other planning failure leaves the previous committed lane and its
  resources in place, then settles the pending history waiter.
- If client preload matching produces no lane because its local controller was
  aborted, preload returns as canceled. If no lane was produced and the
  controller is still current, the planning/input error is rethrown to the
  caller. It must not become an unconditional core `console.error`.
- Once a lane exists, its ordinary route, loader, and chunk failures are reduced
  as lane outcomes. The lane owner is then responsible for cleanup and redirect
  handling.

This boundary is why planning cancellation is detected from the existing
controller rather than another flag.

## Typed lane pipeline

Client lanes use phantom TypeScript phases:

```text
MatchedLane -> ContextualizedLane -> ReducedLane -> ProjectedLane
```

The phase marker emits no runtime state and prevents accidental phase mixing in
phase-specific helper signatures. `executeClientLane` exposes only a projected
lane or a control outcome, and its current callers commit only the projected
branch. Runtime ownership, currentness, and the commit itself are not type
guarantees. The server uses corresponding matched, contextualized, and reduced
phases.

Explicit construction casts mean these brands guard local orchestration, not the
whole runtime protocol.

Client loader results are a closed tuple union:

```text
success(data) | error(error) | notFound(error) | redirected(redirect) | canceled
```

The server counterpart uses `skipped` for an `ssr: false` loader instead of
`canceled`. It also uses `skipped` when a server loader settles after that
match's controller has been aborted; the server has no lane-level cancellation
outcome.

The compact numeric representation is internal. The union matters because
cancellation and redirects are control outcomes, not match states, while errors
and not-found results become terminal match semantics at the reducer's selected
cutoff. Resolved and thrown redirects/not-found values normalize to the same
outcomes. `onError` may transform an ordinary error by throwing a control value.
Lane waiting and `beforeLoad` recognize cancellation only from the exact aborted
lane signal; an arbitrary `AbortError` or user-thrown signal is an ordinary
error. A loader flight instead normalizes either settlement branch to canceled
whenever its own controller is already aborted, regardless of the settled value.

A native `Promise` used as the thrown value or rejection reason of `beforeLoad`
is a deliberate exception: contextualization rethrows that value to the lane
owner instead of reducing it into route error state. An ordinary rejected
`beforeLoad` promise is still a route error, and a promise thrown by a loader is
normalized like any other loader error.

The client phase driver, `executeClientLane`, performs:

```text
adopt flight leases
  -> contextualize serially
  -> start loader/chunk tasks concurrently
  -> reduce outcomes in route order
  -> project assets
```

No phase publishes the terminal semantic lane. Foreground task readiness may
offer pending presentation through its `onReady` callback. Background lanes
reuse the phases with mixed semantic ownership and detached projection output.

## Contextualization and concurrent work

`beforeLoad` is deliberately serial. For each match, contextualization:

1. handles param/search validation failures,
2. combines the completed parent context with route context,
3. awaits `beforeLoad` unless the prefix was already resolved by hydration, and
4. merges the selected result before advancing to the child.

This guarantees that child `beforeLoad`, child loader context, and
`parentMatchPromise` never observe a partially updated parent context.

### Match reuse, `beforeLoad` reuse, and loader reload are separate

Matching first decides whether a semantic match object can be reused by id.
Execution then makes two independent decisions:

- `beforeLoad` reruns for every independently executed navigation lane. An
  adopted active preload supplies its complete already-contextualized lane;
  completed preload context is never cached. Hydration may skip the accepted
  server-rendered prefix. Custom `shouldReload` remains loader-only.
- Loader execution considers status, invalidation, configured `shouldReload`,
  freshness, navigation cause/forced reload, and blocking versus background
  reload mode. Reusing a match therefore does not imply reusing its loader data.

Age-based staleness alone does not reload every successful stay match. Unless
the match is invalid or `shouldReload` says otherwise, the stale-time branch also
requires a forced stale reload, an entering match, or another active id for the
same route.

An adopted active preload ran `beforeLoad` with `preload: true`, and navigation
intentionally accepts that context as part of the complete lane. A navigation
that does not adopt the complete lane runs its own serial `beforeLoad` chain and
its own loader work.

`preload: false` does not suppress speculative `beforeLoad`: the hook still runs
with `preload: true`, but its completed context is not cached. The loader is skipped and
the match remains invalid, so navigation reruns `beforeLoad` and performs the
loader work. Normal component and pending-component readiness may still run for
the preload.

On the client, after contextualization reaches its terminal prefix, task
creation starts loader and route-chunk work without awaiting siblings. Loaders
therefore run concurrently. Each client task exposes three related milestones:

- `outcome`: the semantic loader result,
- `ready`: a successful outcome plus the route's render chunk readiness, and
- `match`: the parent-facing match promise.

Separating `outcome` from `ready` is essential. A redirect or error can win
without waiting for irrelevant successful descendant chunks, while a successful
lane cannot commit before the chunks it needs to render are ready. The client
`match` promise resolves after the loader outcome settles; successful data has
already been applied, but error/not-found state is selected later by reduction.

`resolvedPrefix` skips repeated contextualization and loader work while
preserving the task chain needed for parent promises and chunk readiness. A
client preload derives it from the contiguous active successful same-id prefix.
The subsequent unresolved-suffix transaction after hydration instead adopts the
entire committed prefix or none of it, under the href/key/id/currentness checks
described below. Joinable work already attached to an adopted prefix is still
accounted for, and projection may restart at its retained terminal match.

## Phase-local reduction and failure boundaries

Failure selection deliberately follows execution phases instead of running a
global comparator over every possible boundary. The client and server use the
same small reduction policy:

1. Param/search validation and `beforeLoad` run serially. The first terminal
   outcome stops contextualization. Route `context` ran earlier during planning;
   if it throws, no lane exists and the planning-failure rules apply.
2. Loaders for the permitted ancestor prefix have already started concurrently.
   Their promises are consumed from root to leaf. The first ordinary error or
   not-found fills one loader-failure slot; redirect/cancel is kept separately as
   control flow.
3. Control flow wins. Otherwise the loader-failure slot wins, falling back to
   the serial failure when loaders succeeded.
4. The selected outcome determines one semantic cutoff. Only successful normal
   chunks needed before that cutoff are considered, again in route order. The
   first relevant chunk failure replaces the selected failure; if that failure
   is a redirect, it becomes control flow.
5. Core applies the result once, trims once, and attempts the selected terminal
   component once. In ordinary client/server lane reduction, terminal-component
   preload is best-effort: rejection is swallowed, does not call route `onError`,
   and does not restart selection. Hydration readiness is stricter, as described
   below.
6. Projection runs after semantic reduction and cannot replace its result.

An ordinary serial error still permits loaders strictly above the throwing route
to run. A serial not-found permits work through its effective not-found boundary,
but never past the throwing route: an ancestor boundary's loader runs, while the
throwing route's loader does not run when that route is itself the boundary. A
serial redirect/cancel starts no loader work.

“First” inside a concurrent phase means structural route order, not promise
settlement timing. There is no error-over-not-found priority, render-boundary
ranking, sorting, or convergence loop. Consumption stops at the first structural
redirect/cancel; already-started later work may settle, but it is not considered
for this lane.

An ordinary error marks its throwing match and trims descendants. The
framework's nested catch boundaries may ultimately render a parent, default, or
root error component. A not-found is assigned to the nearest eligible ancestor
not-found match before trimming. Its throwing route and terminal match may
therefore differ. A global root not-found remains a successful root match marked
`globalNotFound`, because the root shell still renders while presenting the
global not-found result.

The server uses redirect control flow and `skipped` for omitted or aborted work;
the client also has cancellation control flow. Those representation differences
do not change the failure-selection policy.

A `globalNotFound` assigned while matching is planned presentation metadata, not
a thrown lane outcome. The client retains the planned lane and the framework
stops rendering below the marked boundary. The server caps and trims its
request-local lane at that boundary before rendering the 404. Do not feed this
case into the thrown-outcome reducer merely to make the two storage shapes look
identical.

Redirect and cancellation outcomes never become committed match states.
Installed foreground and background client-lane redirects are followed by
replacement navigation. Their depth is inherited one hop at a time, and the 21st
non-document redirect is reduced to `Redirect cycle detected`. The current
transaction's `redirecting` boolean is the inheritance condition; it is not an
identity binding to a particular destination. Redirects thrown during
synchronous foreground planning are followed before transaction installation and
do not participate in that counter. Client preloads recursively preload a
redirect target under a separate limit and stop quietly beyond it; a preload
planning redirect remains the caller's planning error. The server returns a
redirect result to its request layer.

Ordinary client/server projection runs only after reduction, so hooks see the
final lane and loader data. Client projection starts `head` and `scripts`
together; server projection also starts `headers`. Results for one route are
applied only if the whole group resolves. A rejection is logged and swallowed
without replacing the semantic result. Reused matches may therefore retain
projection output from their previous generation. Hydration uses a different,
serial projection policy described below.

## Foreground transaction lifecycle

`RouterCore.load` refreshes `latestLocation` and captures that object for
`onBeforeNavigate` and `onBeforeLoad`. It then delegates to `loadClientRoute`,
which reads the current `latestLocation` after those synchronous listeners have
run. A reentrant listener can therefore replace the location that the outer call
would otherwise plan; preflight and transaction currentness decide which load
wins. Scroll restoration consumes lifecycle location values and `_scroll` state,
not parsed-location object identity.

`loadClientRoute` first plans under `_preflight`. Only after planning succeeds
and both the preflight owner and previous writer are still current does it install
a `LoadTransaction` as `_tx`. Installation then:

1. aborts and releases the previous writer's private lane,
2. publishes the requested location and `status: 'pending'` together,
3. offers pending presentation, and
4. runs the private lane pipeline.

The transaction may publish a terminal lane only while `router._tx === tx`.
Currentness is checked before committing, inside the view transition, and after
the framework transition acknowledgement. A losing lane releases its matches and
returns without touching committed state.

Expected route failures have already become typed lane outcomes by this point.
If orchestration itself rejects unexpectedly, the transaction aborts and
releases its private work, restores the committed lane as presentation, returns
the router to idle, and settles the pending history completion. It never
publishes a partially reduced lane or turns that orchestration failure into route
error UI. `tx.done` and `commitLocationPromise` are waiters, not publication
authority; equality with `_tx` remains the write guard.

On success, `commitMatches`:

1. derives the next terminal cache,
2. publishes presentation, `_committedMatches`, and the terminal cache in one
   batch,
3. transfers flight leases from old/cache/private owners to the new owners,
4. clears the transaction's reference to its transferred lane, and
5. runs route enter/stay/leave callbacks.

The `tx.matches = []` assignment is intentional. The same array has become the
committed lane, so setting its `.length = 0` would erase committed state. Replacing
the transaction's reference records the ownership transfer without adding an
ownership flag.

Transition settlement gates resolved-location, idle, and history-completion
publication; a `true` acknowledgement additionally permits `onRendered`.

`awaitCurrent` follows successor transactions, so a superseded call to
`router.load()` does not resolve while the navigation that replaced it is still
active.

### Lifecycle event order

Client lifecycle ordering is part of the protocol:

1. `RouterCore.load` synchronously emits `onBeforeNavigate`, then `onBeforeLoad`.
2. Inside the framework transition, terminal matches/cache publish and route
   `onLeave`/`onEnter`/`onStay` callbacks run.
3. If those callbacks did not supersede the writer, core emits `onLoad`, then
   `onBeforeRouteMount`. The latter is therefore before destination mount/effects.
4. After the transition acknowledgement settles, core sets the resolved location
   and idle status. It emits `onResolved` while the transaction is still current,
   then emits `onRendered` only when the framework confirmed that the publication
   rendered.

Listeners may start another navigation. Currentness is checked while emitting
the pre-mount lifecycle: a route callback suppresses stale `onLoad`, and an
`onLoad` listener that supersedes the writer suppresses stale
`onBeforeRouteMount` and later completion publication. Listener exceptions are
isolated and do not stop later listeners or leave acknowledgement cleanup
unfinished. There is currently no currentness recheck between `onResolved` and
`onRendered`; a synchronous navigation started by an `onResolved` listener can
therefore coexist with the acknowledged transaction's `onRendered` event.

## Pending presentation and renderer acknowledgement

Pending UI is a projection of an in-progress transaction, never a semantic lane.
Pending publication uses a cloned prefix ending at the selected pending
boundary. Every visible match is a snapshot with `_flight` removed, and only the
terminal snapshot changes status to `pending`. Presentation therefore never
shares a mutable match object with the private writer lane. A later failure may
bubble to a visible ancestor without mutating the pending UI in place or being
hidden from fine-grained match stores by unchanged object identity.

The boundary is the shallowest non-success match, or the shallowest successful
match already visibly presented as pending. If that boundary has no route or
default pending component, or its effective `pendingMs` is non-numeric or
`Infinity`, no pending session is offered; core does not skip it to search for a deeper
fallback. Task readiness offers pending again, so the shallowest unresolved
boundary may move deeper as ancestors settle. An invalid boundary has zero
reveal delay; the pending-session rules still determine whether it is actually
presented and how long confirmed presentation remains.

There is one `PendingSession`:

```text
reveal deadline -> renderer acknowledgement -> minimum-visible deadline
```

Before acknowledgement, `deadline` is the time at which pending UI may be
offered. After the renderer reports that the pending lane was actually rendered,
the same field becomes the earliest time it may be replaced. This single absolute
deadline avoids copied timers and competing completion authorities.

An acknowledgement **settles** when the framework transition is no longer
pending, even if it resolves `false`. A `true` value **confirms rendering**.
Settlement of the terminal commit gates resolved-location/idle publication;
confirmation alone gates `onRendered`, and confirmation of pending presentation
gates its minimum duration.

A replacement transaction may adopt the session only if the same boundary index
has the same match id. Otherwise the old timer/session is discarded. A completed
transaction waits for `pendingMinMs` only when the renderer confirms that the
pending state appeared; queued work that never rendered does not incur a minimum
duration. If core reconstructs a session around an already-visible pending
boundary rather than adopting its original session, it conservatively starts the
minimum duration from the time it observes that presentation.

Framework adapters implement `startTransition` as
`Promise<boolean>`:

- React queues acknowledgements around `React.startTransition`; `MatchesInner`
  resolves them from a layout effect after the new matches render. Cleanup
  resolves abandoned acknowledgements as `false`.
- Solid awaits `Solid.startTransition` and returns `true`.
- Vue runs the update, awaits `nextTick`, and returns `true`.
- Core's fallback applies synchronously and returns `false`, because it cannot
  prove that a framework rendered the update.

This acknowledgement is also why `onRendered` and navigation completion cannot
be inferred from a store write alone. In React, every publication passed through
`startTransition` must still cause the aggregate matches store to notify and the
layout effect to run. Reusing exact work objects while suppressing the match-store
write can strand the acknowledgement promise; preserve this liveness property
when optimizing store reconciliation. Test it through navigation completion and
rendered output, not `_rendered` itself.

## Loader flights and resource ownership

A `LoaderFlight` contains one outcome promise, its own abort controller, and a
lease count. Each loader execution creates its own flight; there is no global
per-match join registry. `match._flight === flight` means that match owns one
lease. Copies accepted from active or cached semantic generations acquire a
lease before execution.

`releaseFlight` removes one lease and aborts the loader only after the last
owner releases it. `transferMatchResources` performs bulk ownership transfers
based on match object identity.

The lease intentionally may outlive promise settlement. Once successful data is
accepted, the accepted match keeps the loader generation's public `AbortSignal`
alive. That signal is aborted only when the last owner is replaced, unloaded,
expired, or rejected from cache. Promise state therefore cannot replace the
lease count.

Active work sharing occurs only by adopting an entire identical preload lane,
not by joining individual loader flights. A failed, not-found, redirected, or
canceled adopted lane is discarded and the navigation executes its own complete
lane. Transaction cancellation races the preload promise through `waitFor`, so a
superseded navigation settles without forcing an otherwise independent preload
to stop.

Every loader flight checks its own controller after both loader resolution and
rejection. A loader that ignores `AbortSignal` therefore still normalizes to
canceled and cannot resurrect obsolete cache state.

Every losing, trimmed, superseded, expired, or cache-rejected match must release
its lease exactly once. Do not replace the lease protocol with boolean ownership
flags.

## Client preloading and the terminal cache

Client preloading uses the same matcher, contextualizer, task builder, reducer,
projector, and loader-flight ownership protocol as navigation, but it never
becomes `_tx`.

Loader reload and `preload: false` behavior are defined in the contextualization
section above. Preloading adds speculative ownership, redirect handling, active
complete-lane sharing, and cache publication; it does not add another per-match
reuse policy.

A preload snapshots the current writer and plans with an `_isCurrent` guard. It
derives the already-resolved active prefix, executes the lane, follows internal
redirects up to its redirect limit, and caches only an all-success result.
The planning cancellation/error distinction is described above. Routes with
`preload: false` still run `beforeLoad`, but skip their loader and remain invalid
as described in the reuse section.

The `_isCurrent` guard protects synchronous planning. Once a preload lane exists,
it is registered in `_preloads`. Another preload or a navigation may adopt it
only when the complete route sequence, match ids, params, and search are equal.
A navigation claim is accepted only if the captured committed base and cache
array remain current. Successful adoption transfers cancellation ownership to
the navigation; failed adoption retries the navigation's complete lane in
blocking mode. HMR may abort all active preload lanes.

Unexpected post-plan exceptions belong to the preload lane. It aborts its
controller; while still current, it follows eligible redirects, absorbs
not-found, logs other unexpected failures, and releases its resources. A
superseded lane must likewise release its resources before returning.

Cache publication is an identity compare-and-swap. A preload candidate is
discarded if it became active or if the corresponding cache entry changed since
planning. This prevents late preloads from overwriting fresher cache data without
adding a version counter. Development refreshes also reject context produced by a
`beforeLoad` function that is no longer installed, together with the descendant
suffix that depended on it.

The compare-and-swap is per match id, not a global cache epoch. `clearCache()`
releases entries present at that moment, but a still-running preload planned
against an absent entry may later publish whenever the entry is also absent at
publication. The slot need not have remained continuously empty between those
two snapshots.

Completed preloads discard `beforeLoad` context before caching. Foreground
commits retain successful exiting matches only when they have fresh loader-backed
data within the applicable normal/preload GC window. Active ids are removed from
the cache; failed, not-found, expired, and loaderless entries are discarded.
Clearing the cache releases leases before publishing the retained cache entries.
GC is opportunistic:
foreground commits apply these age checks; there is no eviction timer, and
preload publication does not sweep unrelated entries by age.

Server `preloadRoute` is a no-op. Server work is owned exclusively by normal
request loading.

## Background stale reloads

A stale successful match may keep its current data visible while a private
candidate reloads in the background. This is used only for loader-backed,
non-preload, non-sync work whose effective stale reload mode is not blocking.

Foreground reduction and commit proceed with the existing successful match. The
background candidate uses the same loader outcome and projection rules. A
successful background reload does not wait for the normal route chunk, which is
already loaded for the committed match; error and not-found reduction still
loads the selected boundary chunk. The candidate may publish only if both
conditions still hold:

```text
router._tx === owningTransaction
router._committedMatches === exactForegroundBase
```

The writer check rejects superseding navigation. The reference-identity check is
an inexpensive compare-and-swap that rejects invalidation, rematching, another
background publication, or any reentrant commit based on the same location. Both
checks are required after asynchronous reduction/projection; one cannot replace
the other.

A current background redirect uses the same guards and one-hop redirect depth
handoff. Losing background candidates release their resources. Background
publication updates matches through the normal publication primitive rather
than inventing a second commit protocol.

A background lane intentionally begins with mixed ownership. Reload task indexes
contain private candidates, while untouched indexes reference the committed base.
An ordinary failure can mutate its private candidate directly. If a not-found
bubbles to an untouched ancestor, reduction first clones that boundary and
removes `_flight`; the committed generation retains its object and lease until
the guarded publication succeeds. Trimming a background lane likewise leaves
shared suffix resources alone. The final transfer or discard of the background
batch is the single resource authority.

Projection runs on detached, flight-free match copies so asynchronous
`head`/`scripts` hooks cannot mutate the committed base before the two guards are
rechecked. On successful publication, loader-flight ownership moves from the
mixed semantic lane into the projected copies. On rejection, candidates are
released and the committed base retains its leases. Projection awaits are raced
against the lane controller, and projection-only copies preserve untouched
matches' `fetchCount`.

Background publication replaces an already-resolved presentation directly. It
does not enter the pending/renderer-acknowledgement protocol, change
`stores.status` or `resolvedLocation`, or emit foreground navigation lifecycle
events. Framework stores still receive the ordinary match publication.

## Invalidation

Invalidation replaces the committed and cached semantic entries with invalid
generations, then routes the reload through the ordinary foreground transaction.
It does not mutate `stores.matches` merely to manufacture pending UI; the new
transaction owns that presentation decision. `forcePending` may mark invalidated
semantic entries as pending when the route has work. Even without `forcePending`,
an invalidated error or not-found entry with route work resets to pending and
clears its error. The renderer still changes only through pending presentation or
terminal commit.

The invalidated clones carry the accepted generation's existing flight reference;
invalidation does not duplicate its lease or invent new loader ownership.

Replacing `_committedMatches` also changes its array identity. Any background
candidate based on the previous generation therefore fails the existing
exact-base compare-and-swap. Invalidation needs no scheduler, version counter, or
background-specific cancellation flag.

## Route chunks

On the client, normal component and pending-component preload starts
speculatively for every created task alongside loader work. Its failure is
semantically considered only when that loader succeeds and the task lies before
the selected cutoff. On the server, normal chunk work starts after loader
selection for the retained `ssr: true` prefix.

Error and not-found component preloads are requested only for the semantic
terminal match selected by ordinary lane reduction. A framework may still bubble
an ordinary error to a visibly different ancestor catch boundary. These terminal
preloads are best-effort because semantic selection has already finished;
hydration chunk readiness, including terminal boundary chunks, is required.

The current `route._lazy` encoding has three compact states:

```text
undefined = no current owner
Promise   = current lazy option import
true      = lazy options installed
```

Only the promise still stored in `_lazy` may install options or clear a failed
import. HMR clears `_lazy`, so a late obsolete import cannot mutate the updated
route. Lazy options never overwrite the generated route id.

There is deliberately no component-promise cache. Dynamic import and framework
component preload machinery already cache loaded JavaScript modules. Repeating a
component preload call is cheaper and safer than maintaining another runtime
authority. `route._lazy` remains necessary because it owns lazy-option
installation, rejects obsolete HMR settlements, and resets failed imports for
retry.

## Server loading

Server loading is request-local and needs no global transaction coordinator. It
uses a separate typed lane with the same high-level ordering:

```text
match -> resolve SSR + contextualize serially -> run loaders concurrently
      -> select serial/loader result -> load normal chunks before its cutoff
      -> apply and trim once -> preload terminal component once
      -> project -> publish a render descriptor or redirect
```

SSR policy is resolved parent-first before each route's `beforeLoad`:

- `ssr: true` runs `beforeLoad`, loads data and render chunks, and runs route
  projection hooks.
- `ssr: 'data-only'` loads data but does not render that route's component or
  run its route projection hooks on the server. Its `beforeLoad` still runs.
- `ssr: false` skips server `beforeLoad`, loader, route chunks, and route
  projection hooks. Its synchronous route context and params/search validation
  still run, so matching validation may still produce a server error or 404.
- A `false` parent forces descendants to `false`; a `data-only` parent caps any
  `true` descendant at `data-only`, whether explicit, computed, or inherited.
- Shell mode forces the root to `true` and every descendant to `false`. The
  server presentation lane may retain those client-only descendants and render
  their first applicable pending fallback, while dehydration retains only the
  root semantic match.

These bullets concern route-hook output. Bundler-manifest CSS, preloads, or
scripts may still be emitted for matched client-only routes so that the browser
can load them.

If an `ssr` callback throws, the server normalizes it through that route's
`onError`, records it as the serial failure for the route, and stops serial
descent just like a `beforeLoad` failure. The callback receives wrapped
search/params results and parent-first match summaries; `undefined` falls back to
`defaultSsr` before the parent restriction is applied. Shell mode bypasses route
SSR callbacks.

Hydration adopts the semantic work produced by `true` and `data-only`;
`data-only` still requires client rendering, while `false` begins the unresolved
client suffix. Initial reconstruction and the later unresolved-suffix handoff use
different identity checks, detailed below.

Loaders start concurrently and retain parent match promises. The request-local
lane consumes their outcomes in route order, keeping redirect as control flow and
the first ordinary error/not-found as its loader failure. Only after loader
selection does the server start normal route-chunk work concurrently for the
permitted prefix and consume those results in route order. It applies and trims
once, then attempts the terminal component once. For a planned global 404, the
server preloads both the normal shell and not-found component at the boundary.

Server projection runs only for `ssr: true` matches. Head, scripts, and headers
start together for each route. If any rejects, the rejection is logged and the
route's projection group is discarded; projection failure is non-fatal and never
overwrites loader semantics.

The final result is a closed union: either a render result with status and
matches, or a redirect. `loadServerRoute` owns matching, loading, reduction,
projection, and publication of that route result to router stores. The request
handler and framework adapter separately own dehydration, HTTP response
construction, rendering/streaming, redirect responses, and request cleanup.

Before matching, server loading canonicalizes `publicHref`; a mismatch becomes a
redirect before lifecycle events are emitted. On the canonical path it emits
`onBeforeNavigate` and `onBeforeLoad`, but not the client mount/render lifecycle
events.

## Hydration handoff

Hydration reconstructs what the server actually resolved; it does not rerun a
parallel hydration loader. Before matching, it installs serialization adapters
and flushes buffered bootstrap scripts when adapters are configured, marks the
bootstrap initialized, installs the dehydrated manifest/CSP nonce, and awaits the
application's custom hydration hook.

For the current location, `hydrate`:

1. publishes the current requested location and matches a fresh candidate lane,
2. walks candidates while serialized match ids agree,
3. copies serialized loader/before-load/error/SSR data into a local resolved
   prefix,
4. makes the server's effective SSR decisions visible to immediate client
   rendering/planning,
5. loads the chunks needed to hydrate that prefix,
6. rebuilds complete route contexts before running any head/script hook,
7. rebuilds client head then script projection and derives the presentation
   frontier, and
8. after all asynchronous work and currentness checks, installs
   `_committedMatches` and publishes the presentation frontier.

The presentation frontier is the candidate prefix initially shown to the
renderer. The committed prefix includes server-resolved `true` and `data-only`
matches and excludes the first `ssr: false`, pending, or otherwise unresolved
match. The frontier may include that first unresolved match, or a pending clone
for `data-only`. For the initial handoff, committed `beforeLoad` and loader work
is authoritative and does not rerun; hydration rebuilds route context, chunks,
and client head/script output as required.

The initial serialized payload carries match ids but no server href/history key.
Bootstrap reconstruction therefore matches the browser's current location and
adopts only the contiguous serialized same-id prefix; it tolerates an unused
serialized suffix. Exact href/key comparison applies to the subsequent ordinary
client transaction, not this initial reconstruction.

If the whole location was resolved, hydration sets `resolvedLocation`. Otherwise
the framework Transitioner observes the unresolved location and starts an
ordinary client transaction. That transaction adopts the whole committed prefix
or none of it. Adoption requires the same canonical href and history key, exact
match ids at every committed index, and no invalidated match or development
refresh. A terminal adopted prefix also caps the candidate lane, so descendants
omitted below a server error/not-found boundary cannot execute on the client.
These checks derive `resolvedPrefix` from existing authorities; core adds no
second authority for deciding whether that transaction may adopt the committed
hydration prefix. Bootstrap and framework layers do have their own initialization
and hydration-completion state.

Candidate matching may already have invoked route `context`. After lazy options
are installed, hydration deliberately rebuilds context parent-first for the
accepted prefix and awaits each result before projection. Context functions must
therefore tolerate this hydration re-entry. Hydration also copies each serialized
SSR decision onto the route options so later client planning and framework
rendering observe the server's resolved mode; that mutation is the current
mechanism, not a required representation.

Hydration chunk and context readiness is required. A chunk failure is suppressed
when hydration became stale and otherwise rejects; a rejected context rebuild
propagates directly, with currentness checked only after successful context work.
Projection is deliberately serial within each route: `head` is awaited before
`scripts`, and hydration does not rerun `headers`. A current non-not-found
projection failure is logged, attached, and rethrown; a current not-found is
logged and attached without rejecting, while stale projection failures are
suppressed. Preserve these call-site-specific policies.

Hydration snapshots `_tx` and checks it after successful custom hydration,
chunk, context, and projection steps. Candidate matching and rejected custom or
context work can still throw after ownership changed, but stale hydration cannot
reach the final committed-lane/presentation publication. Hydration does set
`stores.location` and copy SSR decisions before its final guard, so this
currentness guarantee is specifically about semantic match publication, not
complete side-effect or failure isolation.

Framework `Match` implementations combine the SSR mode with match presentation.
`ssr: false` and `data-only` content is behind `ClientOnly`, with the pending
component as fallback. Solid's hydration signal must also respect
`Solid.sharedConfig.context`; a process-global “already hydrated” value alone can
otherwise reveal client-only content during a later hydration root.

## Development route refresh

Route HMR is a development-only client transaction, not direct mutation of live
match state.

The plugin preserves generated route options and component identity where Fast
Refresh requires it, installs new route options, rebuilds route indexes, syncs
the hot module's route export, clears the lazy owner and path cache, and calls
`router._refreshRoute(routeId)`. Core then:

1. aborts all preload lanes, releasing their leases,
2. clears cached match leases,
3. plans synchronously while refusing semantic reuse for the changed route and
   its descendants, then
4. installs and commits through the ordinary foreground transaction protocol
   without pending presentation; installation retires the previous foreground
   transaction and releases its leases.

Preload/cache retirement is deliberately global because old route code may own
work outside the visible subtree. Semantic rematerialization remains scoped to
the changed route and descendants; ancestors stay reusable.

The reuse predicate is planner-local. HMR does not temporarily mutate
`_committedMatches`, reach into loader-flight internals from the plugin, or create
a separate refresh lane. `_refreshRoute` and its special planning path must remain
dead-code-eliminable from production builds.

## Framework bootstrap

Each Transitioner subscribes to history before deciding whether an initial load
is needed. It canonicalizes the current URL, then either emits the initial
`onRendered` for an already-resolved location or calls `router.load()` once.

On a canonical mismatch, the adapter subscribes first, performs a replacing
`commitLocation`, and returns; the resulting history notification performs the
sole load. For an already-resolved location, the canonical parsed href and
history state key must agree before the adapter skips loading and emits
`onRendered`. The same href with a new key is a distinct history entry and must
not be mistaken for an already-rendered mount.

React additionally guards the router/history pair across Strict Mode effect
replay and refreshes `latestLocation` from history before canonicalization.
In React, swapping routers or histories installs the correct subscription and
initial load; Solid and Vue capture their router during setup and currently cover
unmount/remount catch-up instead. Listener errors must not prevent cleanup or
leave transition acknowledgements unresolved.

## Invariants to preserve

When modifying this system, keep these invariants explicit:

1. `stores.matches` never becomes a full-lane semantic planning base after
   `_committedMatches` exists.
2. Only the current `_tx` may redirect from an installed foreground lane, commit
   that lane, or publish its completion; planning redirects require the current
   preflight and unchanged previous writer. Only the current `PendingSession`
   owner may finish that session.
3. `_preflight` can invalidate synchronous foreground planning but cannot
   publish; preload planning uses its local controller and foreground-owner
   snapshot.
4. A foreground lane's semantic result remains private until one atomic terminal
   commit; pending is presentation only.
5. Parent route context is materialized first, and parent `beforeLoad` context is
   complete before child `beforeLoad` or loader work.
6. Match id controls reuse; route id controls enter/stay/leave semantics.
7. Concurrent loader and normal-chunk selection is structural, not
   promise-settlement ordering.
8. Pending UI is a flight-free presentation clone and never semantic authority.
9. An accepted loader generation's lease and public signal may outlive promise
   settlement; a lease is resource ownership, not promise state.
10. Every discarded match releases its resources exactly once.
11. Only an identical complete active preload lane may be adopted. Control or
    failure results cause the navigation to execute its own lane.
12. Completed preload `beforeLoad` context is discarded independently from
    cacheable loader data.
13. Final background lane publication requires both current-writer identity and
    exact-base identity. Projection runs on detached matches before those guards
    transfer resources and publish.
14. Hydration builds its committed resolved prefix privately, publishes that
    prefix only after currentness checks, and delegates the remainder to the
    normal client transaction.
15. Planning cancellation is not a lane failure; a current preload planning
    error remains the caller's error.
16. Invalidation replaces semantic generation identity and reloads through the
    normal foreground protocol.
17. Route lazy ownership is not a general component cache.
18. Runtime state is added only for a real authority or resource owner; phase
    naming and impossible transitions belong in TypeScript whenever possible.

## Testing changes

Tests should assert user-visible behavior: rendered content, loader calls and
signals, documented public router state, navigation promises, lifecycle events,
HTTP status, headers, redirects, hydration output, and absence of stale
publication. Avoid asserting private phase names, tuple tags, timers, internal
promises, or the exact shape of `_`-prefixed fields.

When boundary selection is the behavior under test, give root, parent, and child
boundaries distinct visible output. Assert output unique to the intended boundary
and the absence of broader/default boundary output. A generic `/Not Found/` or
`/Error/` assertion is insufficient.

Useful category-level suites include:

Unless a path is shown, core filenames below are relative to
`packages/router-core/tests/`:

- `client-lane-adversarial.test.ts` and `preflight-reentrant-context.test.ts` for
  ordering and reentrancy; `fatal-load-rejection.test.ts`,
  `blocked-navigation-current-load.test.ts`, and `superseded-load-await.test.ts`
  for planning, rollback, and waiter ownership,
- `preload-adoption.test.ts`, `preload-navigation-adoption.test.ts`,
  `preload-public-cache-behavior.test.ts`, and
  `preload-background-parent-coherence.test.ts` for complete-lane sharing and
  cache publication; `preload-beforeload-reuse.test.ts` for active adoption and
  completed-context lifetime,
- `background-assets-stale.test.ts` and `background-trim-abort.test.ts` for
  background projection, trimming, ownership, and writer supersession;
  `invalidate-pre-rematch-failure.test.ts` for generation replacement across a
  failed plan,
- `preload-public-signal-lifetime.test.ts`, `stay-match-abort.test.ts`, and
  `issue-7759-in-flight-preload-eviction.test.ts` for leases, accepted-generation
  signal lifetime, and cache clearing,
- `granular-stores.test.ts` for active/cached pool identity and notification;
  `parent-match-promise.test.ts` and `loader-thrown-promise.test.ts` for promise
  boundaries,
- `chunk-failure-lifecycle.test.ts`, `boundary-component-chunk.test.ts`, and
  `load-route-chunk.test.ts` for normal, terminal, and lazy-option chunk behavior,
- `hydration-currentness.test.ts`, `hydration-boundary-chunks.test.ts`,
  `hydration-asset-context-order.test.ts`,
  `hydration-terminal-error-child-head.test.ts`, and
  `issue-5427-hydration-root-global-not-found.test.ts` for bootstrap
  reconstruction and the server/client frontier,
- `server-concurrent-error-notfound.test.ts`,
  `server-chunk-failure-lifecycle.test.ts`, `server-ssr-option-error.test.ts`,
  `server-ssr-false-assets.test.ts`, and the selective-SSR E2E suites for server
  reduction and policy,
- `transformStreamWithRouter.test.ts`, `ssr-server-manifest.test.ts`, and
  `ssr-server-cleanup.test.ts` when changing the adjacent streaming/serialization
  system outside this document's primary scope,
- framework `store-updates-during-navigation.test.*`, pending-min, transitioner
  acknowledgement, and transactional-loading tests for rendered behavior, and
- `packages/router-plugin/tests/handle-route-update.test.ts`,
  `packages/router-plugin/tests/add-hmr.test.ts`, and the React Start HMR E2E
  suite for development refresh.

Framework coverage is distributed unevenly and equivalent tests do not always
share filenames. Shared bootstrap changes should cover canonicalization, exact
href/key reuse, same-href new-key navigation, unmounted catch-up, remount,
transition acknowledgement, and listener failures in every affected adapter.
React additionally needs Strict Mode and live router/history-swap coverage. Do
not infer cross-framework coverage from the presence of one `transitioner-*`,
`on-rendered-*`, or pending-min file.

Run category suites while developing, then the affected core/framework unit and
type suites. Changes to client runtime paths must also run
`CI=1 NX_DAEMON=false pnpm nx run @benchmarks/bundle-size:build --outputStyle=stream --skipRemoteCache --skipNxCache`.
For development-only helpers, diagnostics, and HMR paths, inspect the emitted
production output to verify that they are absent; package `test:build` is not a
bundle-size or dead-code-elimination check.

If a regression appears to require another flag, counter, copied deadline, or
completion authority, stop and identify which existing authority is ambiguous.
Fix the category at the architecture boundary rather than layering a local patch
onto one test.
