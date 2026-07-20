# Match loading internals

This document describes the architecture that loads route matches on the
client, on the server, and across hydration. It is for maintainers of router
core and the framework adapters.

The loader is intentionally small in concepts. Runtime state exists only when
it represents a real authority or an owned resource. Phase names and invalid
transitions belong in TypeScript whenever possible; they do not justify a
second runtime state machine.

All `_`-prefixed fields mentioned here are internal. Their spelling and shape
may change, but the ownership rules in this document must continue to hold.

## The architectural rule

For each mutable result, there must be one answer to each of these questions:

1. Who may publish it?
2. Who owns the work and cancellation signal that produce it?
3. What proves that the answer is still current after an `await`?

Do not add a flag, counter, copied deadline, or second completion promise merely
to describe an existing fact. Add runtime state only when it removes an
independent writer, resource owner, or invalid transition.

The main authorities are:

| Authority                    | What it owns                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| `_tx`                        | The one client navigation allowed to commit, redirect, and complete |
| `_preflight`                 | The current client plan or asynchronous hydration reconstruction    |
| `_handoff`                   | The temporary right to transfer one reconstructed SSR prefix        |
| `_committed`                 | The accepted current lane and lifecycle/background CAS base         |
| `stores.matches`             | The current match presentation exposed to renderers and users       |
| `router._cache`              | Off-screen loader generations and first same-ID planning seeds      |
| Active preload entry         | One still-running speculative whole lane                            |
| Loader flight registry entry | The latest same-ID loader generation available to new consumers     |
| Match flight lease           | Ownership keeping that loader work alive                            |
| Pending session              | One reveal/minimum-visible deadline and its current owner           |
| React acknowledgement slot   | The one requested publication whose render may settle a transition  |
| Request signal               | Lifetime of one server request and any accepted SSR stream          |
| Accepted SSR stream response | Cleanup ownership transferred from the handler to the response body |

These authorities are related, but none is a substitute for another. In
particular, presentation is not semantic authority, registry membership is not
resource ownership, and a promise settling is not permission to publish.

## Code map

- `src/router.ts` matches locations, creates match objects, owns public router
  state, history, cache operations, and entry points into loading.
- `src/stores.ts` reconciles route-keyed presentation stores and their ordered
  aggregate.
- `src/load-client.ts` owns client planning, transactions, preloads, loader
  flights, reduction, pending presentation, background reloads, and commits.
- `src/load-server.ts` runs the request-local server lane.
- `src/route-chunks.ts` owns lazy route-option installation and component
  readiness without adding a JavaScript-module cache.
- `src/hydrate.ts` reconstructs the server-resolved prefix and the initial
  selective-SSR presentation.
- `src/ssr/createRequestHandler.ts` connects request lifetime, server loading,
  dehydration, redirects, rendering, and cleanup.
- `src/ssr/handlerCallback.ts`, `ssr-server.ts`, and
  `transformStreamWithRouter.ts` transfer stream ownership and coordinate
  serialization, injection, abort, and cleanup.
- Framework `Transitioner` and `Matches` implementations acknowledge exact
  publications and render only through the selected boundary. Framework
  `RouterClient` and render-to-stream implementations complete hydration and
  connect request abort to their renderer.

## Semantic state and presentation state

The rewrite deliberately separates two views of matches.

### Semantic matches

`_committed` is the accepted current semantic lane. It supplies lifecycle
identity and is the exact base for background compare-and-swap. Pending
presentation never replaces it as a planning base.

For an individual match ID, matching first consults `router._cache` and then
falls back to `_committed`. A cached loader generation can therefore
shadow the currently displayed same-ID generation for future planning without
becoming current presentation or lifecycle authority.

Semantic matches may own loader-flight leases. They are not mutated by losing
transactions or by pending presentation.

### Presented matches

`stores.matches` is the array visible to router state and framework stores.
Before `pendingMs` expires it can still contain the source presentation. Once
pending presentation is published, it contains the whole destination lane,
including descendants that are still loading. Terminal publication follows the
same membership rule: an ordinary error is retained at the throwing match,
while not-found is moved to its selected boundary, but neither removes
structurally matched descendants. The framework renderer derives its cutoff
from the first pending or terminal boundary instead of requiring core to hide
descendants.

The same cutoff is used by every authoritative post-load output projection:
framework head and script construction, route response headers, SSR manifest
assets, dehydration, and cache exclusion during commit. A structural descendant
below the cutoff remains observable in state, but it cannot contribute those
outputs or evict a newer cache generation merely because it is present in the
lane. Start's static early hints are the deliberate exception: they are
speculative route-tree hints emitted before loading selects a terminal boundary,
and an already-sent 103 response cannot be retracted.

The presentation pool is keyed by route ID, not match ID. `stores.ids` defines
active membership and order, while `stores.getMatchStore` obtains the one stable
mutable atom in `stores.byRoute` for a route. That atom contains the route's
presented match or `undefined`. An active route branch contains a route at most
once, so this shape cannot alias two visible matches. When params, search, or
loader dependencies produce a new semantic match ID for the same route,
reconciliation replaces the value in that route's existing atom. Leaving a
route tombstones that atom with `undefined`; re-entering fills the same atom
again. Route components and `useMatch({ from })` therefore keep one subscription
across match generations and A-to-B-to-A membership changes. `ids` is published
before departure tombstones so framework trees stop reading a leaving route
before its atom is cleared. The pool retains atoms for route IDs encountered
during the router's lifetime; it is not an LRU or a cache of match generations.
Semantic caches and loader flights remain keyed by match ID and must not use the
presentation pool as their authority.

This distinction matters for user code. Once the destination is presented, a
selector can inspect every destination match and observe `isFetching` while the
renderer still shows only the valid prefix. Before that publication, same-ID
matches in the source presentation can expose updated fetching state, but a new
destination-only match is still private.

Pending entries are flight-free snapshots. They may copy loader data and context
for presentation, but they never become a planning base and never own semantic
resources.

### Location state

`stores.location` is the requested location. It can advance before loading
finishes. For foreground client navigation, `stores.resolvedLocation` advances
only after the framework transition acknowledgement settles. Settlement, not a
`true` render result, is what permits navigation completion. Router `status` is
`pending` during that interval and returns to `idle` at completion. A `true`
result separately permits `onRendered` and pending minimum timing. Server
publication and hydration perform their request/initial-load handoffs directly,
as described below.

### Canonical locations and rewrites

Initial client and server canonicalization compares `publicHref`, the
browser-facing URL produced by the rewrite contract. Parsed semantic `href` and
rebuilt `href` are not necessarily symmetric: input and output rewrites run in
opposite directions. The client ignores a trailing-slash-only difference while
the server can redirect to the exact browser-facing canonical URL.

## A lane and its phases

A lane is one location plus an ordered array of work matches. Its phase is
encoded in TypeScript:

```text
matched -> contextualized -> reduced -> projected
```

### Matched

Matching establishes route order, params, validated search results, loader
dependencies, match ids, initial status, and possible semantic reuse. It does
not run `beforeLoad` or grant publication authority.

A match id identifies loader/cache compatibility. It is derived from route
identity, interpolated path params, and serialized `loaderDeps`. Ordinary search
values affect loader identity only when the route includes them in
`loaderDeps`.

Matching treats `params.parse`, `validateSearch`, and `loaderDeps` as pure
planning functions. For the same input they must return the same value without
navigating or mutating router/application state. A `loaderDeps` result and its
serialization hooks must also be side-effect-free. These callbacks may be
evaluated more than once; supporting reentrancy from them would add runtime
ownership checks to every planning step without representing a supported use.

### Contextualized

Contextualization walks parent to child. For each route it:

1. computes route context from the completed parent context,
2. handles params/search validation,
3. runs `beforeLoad` when required, and
4. merges the result before moving to the child.

This serial order guarantees that child route context, child `beforeLoad`, and
child loader context cannot observe a partially completed parent guard.

Route context is synchronous in the public type contract. Its own contribution
is cached on the match as `_ctx`, and match identity includes route identity,
path params, and `loaderDeps`. A same-ID cache hit may therefore reuse that
route-local result, including one produced by a completed preload. The merged
context is still rebuilt parent-first from the current parent's merged context,
the route's `_ctx`, and the current `beforeLoad` result. Reusing `_ctx` must never
reuse an older merged context or `beforeLoad` contribution.

Server requests have fresh matches and execute route context normally.
Hydration executes each accepted route context locally, stores its `_ctx`, and
then merges transported `beforeLoad` output. An active identical preload donates
the whole lane it is still contextualizing.

### Reduced

On the client, eligible loaders and normal component chunks start concurrently.
On the server, loaders reduce before normal render chunks are consumed.
Reduction turns their outcomes into one terminal semantic lane and one cutoff.
No task publishes while reduction is in progress.

### Projected

After semantic reduction, client asset hooks derive `meta`, `links`, styles, and
scripts from the final lane. Server projection additionally derives response
headers. Projection cannot replace the selected loader/before-load result.

Only an owner that remains current after projection may publish.

## Client planning and the single writer

Planning is intentionally separate from transaction installation. Lifecycle
events and route execution callbacks can synchronously reenter the router.
Planning callbacks used for params, search, and loader-key derivation are the
pure functions described above and do not create a second reentrancy boundary.

A planning controller is installed before `onBeforeNavigate`, `onBeforeLoad`,
and matching, invalidating an older synchronous plan. The planner checks its
authority after supported reentrant callbacks and before installing a
transaction. A stale plan exits without installing a transaction or altering
semantic state.

Once planning succeeds, the router installs one `_tx`. The transaction owns:

- the destination and its private matches,
- one lane cancellation controller,
- `done`, the transaction-completion promise used by current transaction
  waiters and by React to retain the Suspense source tree while a published
  pending match is still loading,
- redirect depth for the chain currently being executed, and
- any pending session transferred to it.

`LoadTransaction`, the lane execution options, and the pending session are
labeled TypeScript tuples. They are deliberately not runtime state machines:
the labels make each slot type-safe for maintainers, while the compact runtime
shape avoids repeating property names throughout the client loader. Changing a
slot means updating the tuple declaration and every typed consumer together;
it must not introduce a second owner or completion signal.

Throwing `done` from a pending React match does not stop the transaction's work.
Once the lane has reduced and projected, its successful destination is
published inside the framework transition; that render acknowledgement then
allows `done` to settle. `_commitPromise` is the internal promise backing public
history/navigation completion. Current completion resolves it, and a
superseding transaction can chain it forward, but it is also not permission to
publish. These promises describe different wait relationships; `_tx` remains
the only client writer authority.

Redirect depth transfers only through the exact `_pendingLocation` created by
`followRedirect`. It is not inherited from the previous transaction: a user
navigation that reenters during a redirect starts a fresh chain even though the
redirecting transaction is still alive.

The latest `_tx` remains installed after it settles. Its presence is writer
identity, not a loading flag; public loading state comes from router `status`
and per-match `isFetching`.

Installing a successor removes the predecessor's publication authority. The
predecessor must still settle and release everything it owns; cancellation is a
liveness mechanism, not a license to abandon cleanup.

Commit and cache handoff install the accepted semantic/cache recipients before
releasing replaced resources. Releasing the last flight lease aborts a public
signal and can synchronously reenter user code, so an old generation must never
be released while it still appears to be the accepted owner. The committed lane
is also removed from the transaction's private ownership before publication.

Every asynchronous client publication checks `_tx` immediately before the
write. Background publication additionally checks the exact committed base
array from which it was derived.

## `beforeLoad`: execution, active adoption, and hydration

`beforeLoad` context is not a cache.

A completed client preload never stores reusable `beforeLoad` output. When its
loader data enters the route cache, the merged context is discarded; the
same-ID route-local `_ctx` may remain reusable. A later navigation rebuilds the
merged context from the current parent and `_ctx`, then reruns `beforeLoad`, even
when it reuses completed loader data.

There are two deliberate exceptions.

### Identical active whole-lane adoption

A navigation may latch onto an entry in `router._preloads` that is still running
only when the whole lane is identical. Admission is decided before rematching
from the preload's href, route-tree identity, semantic owner, parsed search,
router root context, additional context, and user-supplied location state;
router-managed history keys do not participate. With deterministic route
planning, those inputs imply the same ordered routes, params, validated search,
and global-path-miss meaning. They may be observed by `beforeLoad` even when the
route lane is unchanged.
Adoption inputs are treated as immutable values: replace a context/state object
to express a generation change; in-place mutation is not detected.
Adoption is all-or-nothing. There is no prefix donation and no
completed-preload freshness window for `beforeLoad`. Matching derives
global-path-miss semantics for every lane, including preloads, so an otherwise
identical candidate cannot erase that terminal meaning during adoption.

The active preload also captures the identity of `_committed` from which
it was planned. Whole-lane adoption requires that semantic owner to remain
current. Invalidation replaces the committed generation, so an older preload
may still donate an identical loader flight but cannot donate its pre-invalidation
`beforeLoad` context.

The adopting navigation takes ownership of the active lane and its controller.
The original public preload call must then stop releasing that lane. Individual
successful loader tasks may still publish cache entries through their original
per-match compare-and-swap; that publication belongs to the transferred lane,
not to a second whole-lane owner.

If the adopted speculative lane succeeds, the navigation may use the
`beforeLoad` calls that ran with `preload: true`. A redirect from that same
active lane is also accepted as navigation control flow. An ordinary failure,
not-found, or cancellation is not authoritative for navigation: the real
navigation replans and reruns `beforeLoad` with `preload: false`. Successful
loader work anywhere in the settled lane remains eligible for reuse, including
a descendant that completed after an ancestor loader failed. Each successful
loader generation has already attempted its own cache publication at settlement,
so retry does not scan the terminal lane or create another cache handoff. It
discards the failed speculative semantic lane and replans cache-first. The retry
rebuilds the serial context chain and reruns `beforeLoad`; only independently
successful loader generations cross that boundary through the normal
cache/flight rules.

Routes with `preload: false` do not permit active whole-lane adoption. Their
speculative `beforeLoad` may run with `preload: true`, but navigation reruns the
serial chain and performs the skipped loader work.

Rejecting whole-lane adoption does not require discarding loader work before
the real lane reaches its reload decisions. The rejected preload may remain a
resource-only donor until that lane settles.

### Hydration

The server-resolved prefix is authoritative for the initial document. Hydration
therefore restores transported `beforeLoad` output for the accepted prefix
without rerunning it on the client. This applies to the server-rendered prefix
in selective SSR; the unresolved client suffix follows ordinary navigation
rules.

Hydration is not a general `beforeLoad` cache. Its temporary handoff is valid
only for the initial client load of the same document entry and exact committed
owner; rejection, invalidation, or any later load returns to normal serial
execution. The claim also requires the same route tree, root/additional context,
search, user history state, and exact browser history generation. That initial
load may transfer the accepted hydration prefix and
keep its transported context while it completes a selective-SSR suffix. A
preload never claims this prefix. Frameworks must start the initial client load
before descendant route code can preload; invoking a preload in the gap after
raw `hydrate()` and before that load is outside the supported handoff protocol.

## Loader data, cache entries, and flights

Loader data is designed to be reusable. It is independent from `beforeLoad`
provenance.

### Completed cache entries

Successful loader-backed matches can be cached by match id. Staleness,
invalidation, `shouldReload`, stale reload mode, and GC policy decide whether a
lane uses that data or runs the loader again.

It is valid for cached loader data to have been produced under context from an
older `beforeLoad` generation. Loaders are the cache boundary; guards are not.
When a new loader run is needed, it receives the current lane's freshly built
context.

An invalid successful entry may remain in the cache as stale data and an identity
carrier, but it can never satisfy freshness and must reload. Failed, canceled,
loaderless, and expired generations do not become reusable loader-cache
entries.

A terminal preload lane can still contain independently successful loader
generations when its error or not-found came from `beforeLoad`, validation, or
another route. Each preload loader success attempts cache admission immediately,
before whole-lane reduction. The cache receives a non-terminal copy and an
additional flight lease; the speculative lane keeps its own lease and terminal
meaning until it is adopted or discarded. This works even below the eventual
render boundary and does not preserve the speculative parent chain: merged
context and `beforeLoad` output are cleared. Same-ID `_ctx`, loader identity,
and successful loader data remain reusable by design.

Hydration retry is the transported-work exception because it did not run those
client loader tasks. There, `loaderData` membership together with
`invalid === false` proves a successful generation even when terminal boundary
state is attached to the match. Hydration normalizes that copy before passing it
through the same cache compare-and-swap and lease rules.

The dehydrated payload omits `loaderData` when no loader result exists.
Reconstruction must preserve that absence. Manufacturing an own
`loaderData: undefined` property would falsely turn a terminal match whose
loader never ran into reusable success during hydration retry.

The cache may deliberately contain a successful generation with the same match
ID as a committed match. For example, a speculative lane can produce reusable
ancestor loader data before failing below it while the older committed
generation remains visible. Cache-first matching lets the next lane use that
newer loader generation. Its merged context and `beforeLoad` contribution have
been removed; the merged chain is rebuilt from current parents and same-ID
route-local context before `beforeLoad` reruns. Committing a lane removes cache
entries for its IDs.

### Same-id in-flight work

`router._flights` is the only registry from which a new consumer discovers
same-ID loader work. Every new loader generation registers there, whether it
was started by navigation, preload, or background refresh. A newer generation
replaces the registry entry synchronously. A flight has its own abort
controller; it does not use one consumer transaction's controller as its
lifetime.

Two facts must remain separate:

- registry membership means new consumers may join the flight;
- a match lease means an existing consumer keeps the flight alive.

Registry membership itself owns no lease. A settled generation remains
discoverable while at least one semantic or cached match owns it. Releasing the
last lease removes that generation only if it is still the current registry
entry, then aborts its controller. Every copied semantic match that retains a
flight must acquire a lease, and every discarded match must release one exactly
once. Consequently, a flight referenced by a match or discoverable in the
registry always has a positive lease count. Acquisition code must not recover
from a referenced zero-lease flight; that would hide an ownership bug.

Releasing a set of matches is deliberately two-phase. First every outgoing
match drops its `_flight` lease and every zero-owner generation is removed from
the discovery registry. Only after the entire outgoing set is detached are the
collected flight controllers aborted. Do not interleave one flight abort with
detaching later matches in the same replacement: an abort listener can
synchronously reenter, and that load must observe every logically removed lease
and registry entry as already gone.

A successful accepted match may keep its lease after the loader promise has
settled. This keeps the loader's public `AbortSignal` alive for that semantic
generation. The signal aborts when the last active or cached owner is replaced,
unloaded, expired, or discarded; promise settlement alone does not end it.

Loader error normalization, including route `onError`, runs only while the
originating match still owns that exact flight. Releasing the match before a
late rejection makes the generation semantically discarded; abort-triggered
rejection must not call user error hooks. This is an ownership check, not a
separate cancellation flag. A loader that aborts its own flight controller while
its match remains owned can still fulfill or reject normally.

A planned match holds only the lease for the accepted generation copied from
cache or committed state. After `beforeLoad` and `shouldReload` decide that a
loader will run, it may synchronously acquire the registry's latest different
same-ID generation. It never reacquires its own accepted generation merely to
avoid a requested reload. A blocking reload replaces the accepted lease with
the donor; a background reload keeps accepted data visible and gives the donor
lease to its private candidate. This one lookup covers work started by active
preloads, navigation, and background refresh without scanning those owners.

When a different lane supersedes an active preload at the same href, the old
lane stops being adoptable but retains its resources until the successor lane
settles. Its leased flights therefore remain discoverable for the successor's
late reload decisions without giving every planned match a second reservation
lease. The successor then releases the old lane; any borrowed flight remains
alive through the successor match's ordinary `_flight` lease.

A joining navigation accepts successful shared loader work. A failure,
not-found, or cancellation produced under another speculative generation is not
allowed to govern it; the navigation releases that flight and registers its own
generation. Redirect remains control flow and is never cached as loader data.

### Semantic parent chain

`parentMatchPromise` represents the semantic parent generation, not merely the
currently displayed parent.

This distinction is essential for mixed reload modes. If a parent is refreshing
in the background while a child reloads in blocking mode, the child borrows the
fresh parent candidate. The final lane must not combine fresh parent data with
child data derived from the stale visible parent.

The same semantic-parent chain is used by blocking and background loader work.
Task arrays track readiness/outcomes; they are not a second parent authority.

### Components and lazy route options

There is no router-level component-promise cache. The browser module cache and
framework lazy-component machinery already cache loaded JavaScript.

Lazy route loading retains only the authority needed to install lazy route
options, ignore obsolete HMR settlements, and retry failed imports. It is not a
general JavaScript-module cache.

Lazy option installation has one route-owned promise. Success installs options
only while that promise is still the route's owner. Rejection clears the owner
so a later load can retry, and development refresh can clear ownership so an
obsolete import cannot install options afterward.

Normal component readiness is part of route readiness, not merely an asset
prefetch side effect. Client loader and normal component work may run in
parallel, and a blocking match becomes successful only after both are ready.
Chunk settlement also wakes pending selection, so a `pendingComponent` supplied
by newly installed lazy options can become visible while the route's loader is
still running. This does not require retaining a component promise on the
match: the route's lazy-option owner and the framework/module loader provide the
necessary work identity.

Client and server not-found boundary searches settle lazy options on each
candidate route before testing for `notFoundComponent`. A lazy rejection while
locating the boundary does not replace an already selected not-found, but
cancellation or request abort still stops the search. The selected terminal
boundary component is then loaded best effort.

## Outcomes and failure selection

Internal work normalizes returned and thrown values into a small closed set:

```text
success | error | not-found | redirect | canceled/skipped
```

Redirect and cancellation are control flow, not committed match statuses.
Error and not-found are terminal semantic outcomes assigned once during
reduction.

Returned and thrown redirects/not-founds normalize identically. Only an
ordinary error invokes route `onError`; if `onError` throws, its value is
normalized again and may itself become an error, not-found, or redirect.
Router cancellation and request abort bypass `onError`. Aborting the
`AbortController` exposed to a loader is not by itself proof that the router
discarded the work: a still-owned loader may fulfill or reject afterward, and
that settlement is normalized normally. On the client, zero flight leases prove
that an aborted generation was discarded. On the server, the request signal
proves request cancellation, while the already selected failure/control outcome
proves that an aborted descendant is obsolete. The client calls a discarded
non-result `canceled`, while the server calls it `skipped`; neither is a
publishable terminal state.

The client and server follow the same deliberately chronological policy.

### Serial phase

Route context, validation, and `beforeLoad` run parent-first. The first terminal
serial outcome stops descent and wins over later ordinary work.

An ordinary serial error allows loaders strictly above the throwing route to
finish. A serial not-found allows work through its effective ancestor boundary,
but never past the throwing route. A serial redirect or cancellation starts no
loader work.

### Parallel loader phase

Eligible loaders start concurrently. The first ordinary loader error or
not-found to settle becomes the ordinary loader failure. This is promise
settlement chronology, not route-order ranking and not a shallowest-boundary
comparator.

A redirect is control flow and wins even after an ancestor loader has already
failed ordinarily. Reduction therefore waits for started descendant loader work
to reveal a redirect, including a descendant already refreshing in the
background. An ordinary failure does not cancel already-started descendants
before this selection completes. Once all relevant work has settled, the first
ordinary failure is used only if no redirect won. The client retains the full
structural branch and releases only work that no accepted semantic or background
candidate owns; the server may abort work below the selected boundary.

Loader settlement does not directly install an error or not-found on the lane.
It leaves a failed attempt as a renderable, invalid success until reduction
installs the one selected terminal outcome. This keeps every ancestor of a
deeper chronological winner renderable, while ensuring that a swallowed losing
attempt is reloaded rather than treated as fresh cache data. Semantic
`parentMatchPromise` snapshots still expose each loader's own outcome to its
descendants.

No error-over-not-found sort is performed. The selected not-found is moved to
its effective not-found boundary; an untargeted not-found searches eligible
ancestors, while a targeted not-found respects its target.

A global path miss is terminal by `_notFound` even when the selected match
remains successful and has no error attached. An explicit not-found reduced to
root also attaches its error there. Both forms cap rendering and hydration and
produce a 404 response.

For a fuzzy global miss, synchronous matching installs the best boundary visible
from eager route options. Before contextualization, client and server feed that
fallback through the same lazy-aware ancestor search used for explicit
not-found outcomes. This prevents serial hooks below the effective boundary
from running while still preserving the historical deepest-route-with-children
fallback when no route supplies a not-found component. `notFoundMode: 'root'`
bypasses that search.

### Chunk readiness

Normal route chunks needed before the selected cutoff are awaited. Although the
work may start concurrently, readiness outcomes are consumed root-to-leaf. The
first relevant ordinary chunk failure is used only when no serial or loader
failure already won; a redirect from relevant readiness remains control flow.
Terminal boundary-component preloading is best effort during normal loading; it
does not start a second failure-selection algorithm.

On the client, lazy/chunk readiness starts independently of loader completion
and notifies pending selection when it settles. A `pendingComponent` installed
by lazy options can therefore become the visible boundary while an eager loader
is still unresolved.

### Projection errors

Client `head` and `scripts`, plus server `head`, `scripts`, and `headers`, are
decorative with respect to route control flow. They run only after semantic
reduction. Rejections are logged and swallowed; they never replace the chosen
loader/before-load outcome or trigger another boundary-selection pass.

The implementation should stay this simple. If a proposed fix requires a new
error candidate list, ranking pass, boundary score, or convergence loop, it is
almost certainly rebuilding the discarded complex architecture.

## Terminal commit and lifecycle

A successful client lane remains private through projection. At commit, one
framework transition publishes semantic matches, cache changes, and route
lifecycle callbacks.

The client order is:

1. publish final matches/cache and run `onLeave`/`onEnter`/`onStay`,
2. emit `onLoad`, then `onBeforeRouteMount`, while the transaction is current,
3. wait for the framework transition acknowledgement to settle,
4. publish `resolvedLocation` and `idle`,
5. emit `onResolved`, and
6. emit `onRendered` only if the acknowledgement was `true` and the same
   transaction is still current.

Each reentrant callback can start another navigation. A currentness check after
each publication boundary suppresses stale later events. In particular, an
`onResolved` navigation suppresses the old transaction's `onRendered`.

Route lifecycle callbacks are invoked directly and are expected not to throw.
The coordinator does not carry a second error-handling path for callback
failures. All `onLeave` callbacks run before callbacks for retained or newly
entered routes; the relative ordering of `onEnter` and `onStay` is not a public
contract.

Server render results are published request-locally and run the documented
route `onLeave`/`onEnter`/`onStay` callbacks against the previous server
generation after final matches have been installed. Server redirects do not
publish a render lane or run those callbacks.

Terminal outcomes do not change route membership. Client and server state keep
the complete structurally matched branch, lifecycle compares that full branch,
and renderers derive the visible prefix from match status. Projection likewise
stops after the terminal match. SSR transport may serialize only that terminal
prefix because the client can reconstruct hidden structural descendants without
executing them.

## Pending presentation

Pending UI is presentation, not partial semantic commit.

The first unresolved boundary is the only pending candidate. Its route or the
router default must provide a pending component, and its effective `pendingMs`
must allow presentation. Core does not skip an ineligible ancestor to expose an
unrelated deeper fallback.

A successful route without a loader still participates in chunk readiness and
projection, but is not changed back to pending merely because a descendant has
blocking work.

When pending is offered:

- `stores.matches` receives a flight-free snapshot of the complete destination
  lane;
- the selected boundary is marked pending;
- descendants remain observable in state; and
- the renderer stops at the boundary.

There is one pending session in `router._pending` and one absolute deadline:

```text
reveal deadline -> exact render acknowledgement -> minimum-visible deadline
```

The session also remembers the pending component identity. A normal lazy route
chunk can install a more specific `pendingComponent` after the default fallback
has already rendered; chunk settlement re-offers the same lane so the framework
can replace that fallback without creating another pending session or deadline.

The reveal deadline is anchored to the transaction's lane-level `startedAt`.
Discovering lazy pending options later, advancing to another boundary, or
retrying the offer does not restart `pendingMs`. If the absolute deadline is
already past when a pending component becomes eligible, core publishes it in
the current turn instead of introducing a `setTimeout(0)` race.

`pendingMinMs` starts only after the framework confirms that the pending
publication rendered. A superseded publication that never rendered creates no
minimum-visible obligation.

Hydration or a redirect can leave an already visible pending presentation
without a pending session that owns its original acknowledgement. On takeover,
core conservatively treats that presentation as rendered and starts its minimum
from the takeover time instead of delaying its reveal again.

A successor may take over timing only when the boundary index and match id are
the same. It keeps the existing deadline but republishes a full snapshot from
the successor, so pending UI cannot show stale search, params, or context from
the superseded navigation. Changing the boundary discards the old session.

## Exact framework acknowledgement

`startTransition` returns a promise whose boolean result has a precise meaning:

- settlement means the framework transition can no longer block navigation
  completion;
- `true` means the exact requested match publication rendered;
- `false` means core must finish without emitting `onRendered` or starting a
  pending minimum based on that publication.

React cannot await `React.startTransition` directly. Its adapter has one current
acknowledgement slot, and `Matches` settles that slot from a layout effect. A new
expected publication first settles the previous slot as `false`, then installs
itself before the transition callback runs. This ordering matters because
publication can invoke a route lifecycle callback that synchronously starts and
publishes a successor navigation. Installing the expectation after the callback
would let the superseded publication replace the successor's slot.
The lifetime-owned Transitioner installs these callbacks during render, before
the sibling match tree can register its acknowledgement effect.

An already-settled router mounted into React uses the same acknowledgement slot
for its initial `onRendered` event. It therefore emits only after the exact match
tree and its descendant layout effects have committed, rather than from the
earlier history-subscription effect.

A generation is its array length plus the ordered sequence of match ID,
execution-controller identity, and render status. These are existing semantic
facts rather than a separate generation counter. A new transaction or
background candidate changes controller identity; pending-to-terminal
publication changes status. Object reference equality is deliberately not
required because `isFetching` and per-match store reconciliation can replace
objects without changing the logical publication. An exact signature settles
the current slot as `true`. A mismatched render is ignored; only installing a
successor settles the current slot as `false`.

Solid awaits its transition, and Vue awaits its render tick. For an
already-settled Solid mount, history subscription remains before the route tree
while a post-match notifier emits the initial `onRendered` event after
descendant mount effects. The architecture assumes exactly one Transitioner is
mounted per router and remains mounted for the lifetime of the application. Its
history subscription and acknowledgement machinery are therefore
lifetime-owned; there is deliberately no second unmount-time completion
authority.

Every core write passed to `startTransition` must notify the aggregate matches
store even if much of the lane is structurally reused. Suppressing the write can
strand the acknowledgement promise.

## `isFetching` and background reloads

`isFetching` is public presentation state. It is observable during normal
`beforeLoad`, normal loaders, and background loader refreshes.

For a foreground navigation this means the destination match exposes its phase
once the destination lane is presented. Before pending publication, a
destination-only match remains private; a same-ID source match can be reconciled
to the active phase earlier. Background reloads operate on the already
presented lane and therefore expose their phase immediately.

A background reload keeps successful loader data visible while a private
candidate runs. The full presented lane remains installed and the affected
match reports the active phase. Completion clears fetching state whether the
candidate publishes, fails, or is superseded. A successor may join its loader
flight, but never adopts the private candidate lane.

Background loader and chunk work may begin and settle while the foreground
publication renders. Background reduction, projection, and publication do not
start until the foreground transition acknowledgement settles. A fast refresh
therefore cannot replace the exact generation that the framework still needs to
acknowledge.

When background tasks exist, execution creates their settlement observer
eagerly alongside foreground reduction and retains that promise in the lane
result. `runBackground` consumes the same settlement chronology after the
foreground acknowledgement. Recreating the observer then would process work
that already settled by task attachment or iteration order and could change
which ordinary failure or descendant redirect wins. This promise is an outcome
witness, not another publication or completion authority.

Background work starts from an exact committed base. Before projection it uses a
fully private lane, including clones of untouched matches, so asynchronous asset
hooks cannot mutate committed objects without a store publication.

Final background publication requires both:

```text
router._tx is the owner
router._committed is the exact base
```

If either check fails, the entire staged lane is discarded and all candidate
and clone resources are released. A successful background publication replaces
the semantic/presented lane atomically but does not change location, foreground
status, or foreground navigation lifecycle events.

Foreground completion does not join background publication. After the
foreground acknowledgement, the refresh continues independently and may publish
before or after `resolvedLocation`, `idle`, and `onResolved`. Active work
remains publicly observable through `isFetching`; any later publication still
requires the owner/base compare-and-swap.

An ordinary background error or not-found also stays private through reduction
and projection, then may atomically replace the successful base with the full
matched branch carrying its terminal boundary. Hidden descendants retain route
membership, so background publication does not synthesize leave/enter lifecycle
events. It is not published incrementally.

Background redirects use the same control-flow and ownership rules as foreground
redirects. A losing background lane cannot redirect.

## Invalidation, cache clearing, and development refresh

Invalidation creates a new semantic generation and reloads through the ordinary
transaction path. It does not turn `stores.matches` into a planning lane.

Filtered invalidation evaluates committed and cached matches and collects the
selected match IDs. Every committed and cached generation with one of those IDs
is then replaced as invalid. This ID-wide rule prevents a cache-first same-ID
generation from escaping invalidation merely because a different generation
was the one passed to the filter. Route context needs no invalidation marker;
every new lane rebuilds it regardless.

Invalidated successful data may remain visible until pending or terminal
publication, depending on reload mode. Error/not-found generations reset through
the same loading protocol rather than becoming cache successes.

Cache clearing derives the retained active-preload and cache maps, installs both
replacement authorities, bulk-detaches removed leases, lets that operation
abort zero-owner flight controllers, and only then aborts selected preload lane
controllers. A public loader signal can synchronously reenter from its abort
listener; that reentrant load must observe the cleared authorities and every
removed lease as already detached. Unselected concurrent preloads remain
independent, and every later cache publication must still pass the per-match
cache-entry identity check captured during planning.

Development refresh is deliberately aggressive: it aborts flights, discards
active preloads and caches, drops the committed semantic lane, and rematches
from the current route definitions. This prevents same-ID reuse from retaining
obsolete params, context, loader data, or projected assets. Correct ownership
and eventual usable state matter more than preserving speculative HMR work.
Flight discovery entries are removed before their controllers are aborted.

## Speculative preloading

A preload uses the same match, contextualize, reduce, and project phases as
navigation, but it never becomes `_tx` and never publishes match presentation.

Its match/cache ownership effects are limited to:

- an active identical whole lane that a navigation may adopt while it is still
  running;
- joinable same-id loader flights; and
- individual successful preload loader generations entering the loader cache as
  they settle.

A preload can also install durable lazy route options through the separate
route-chunk owner described above. That is route definition readiness, not
authority over a completed match lane or `beforeLoad` result.

A completed preload's failure, not-found, redirect, cancellation, and route
context do not become authority for a later navigation. An adopted still-active
identical lane is the exception described above, including its redirect control
flow. Standalone preload redirects may be followed only while the preload
remains current and within its bounded redirect policy. A preload never performs
a document reload.

The public `preloadRoute` result describes the speculative lane, not merely its
cacheable subset. An ordinary error or not-found therefore resolves with the
terminal match array while any eligible successful loader generations can still
enter the cache. Cancellation or control flow that does not yield a reusable
lane can resolve `undefined`.

Each preload loader task compares the current cache entry for its match ID with
the entry captured when that task was planned. It cannot overwrite a cache
generation installed since that plan. Admission happens at loader settlement,
without waiting for whole-lane success. A distinct successful generation may
coexist with an older committed same-ID generation; this changes future
planning precedence, not current presentation. A duplicate sharing the already
accepted flight is discarded.

`preloadRoute` also works on a server router. It runs the same speculative
protocol with `preload: true`, can return matches and populate that router's
loader cache, and does not replace the request's location, committed lane, or
presentation. Ordinary request loading still uses the request-local server lane
and calls its hooks with `preload: false`.

## Server loading and request lifetime

Server loading is request-local, so it does not need the client `_tx`
coordinator. It still uses the same semantic phases, context ordering, outcome
normalization, chronological failure policy, semantic parent promises, and
projection behavior.

Each server match gets the public controller passed to its callbacks. The
request signal—not the mere fact that a callback aborted that controller—is the
request-liveness authority checked across contextualization, loaders, chunk
readiness, terminal boundary readiness, and projection. A request abort cancels
the whole lane. An ordinary loader failure does not abort already-started
descendants before selection, so a later descendant redirect can still win.
After selection, applying the terminal boundary aborts the hidden suffix that
the result no longer owns. Redirect aborts the whole request-local lane.

The request signal also governs the surrounding request pipeline. The generic
handler races manifest lookup, route loading, custom dehydration, and the
handler/render callback. Start applies the same rule to entry and router
resolution, middleware, manifest work, and redirect finalization. An abort can
therefore settle the handler during every awaited phase rather than waiting for
user code that ignores its signal.

A raced promise may still fulfill after abort. If that late value owns an SSR
stream, the race disposes it instead of allowing it to regain response or
cleanup authority. Other user promises may continue executing, but after abort
they cannot publish a response or inject SSR output. If cleanup occurs while
application dehydration is awaited, dehydration returns before starting
serialization; injection and serialization completion also ignore later work.

A server result is a closed union: render status plus matches, or an HTTP
redirect. Redirects short-circuit framework rendering and preserve their real
status, `Location`, and custom headers.

Projection parity is intentional: server `head`, `scripts`, and `headers` use
the final reduced lane and loader data. As on the client, failures are logged and
swallowed.

### Stream cleanup handoff

Until a response is accepted, the request handler owns router SSR cleanup. A
non-stream response, redirect, or failure leaves cleanup with the handler. An
accepted SSR stream transfers that ownership to the response and is immediately
bound to the request signal, so an abort after handoff still disposes it.

Disposal is idempotent and severs router SSR ownership before best-effort body
cancellation. This order matters because a custom or framework stream may ignore
or indefinitely delay cancellation. Replacing a stream response, resolving a
redirect from it, or stripping a HEAD body disposes the old stream under the
same request signal before accepting the replacement.

Framework renderers connect request abort to their upstream renderer as well as
the router stream transform. Normal completion, downstream cancellation,
request abort, renderer failure, and stream lifetime timeout all converge on the
same cleanup authority; none creates a second response owner.

Once a server lane is accepted for rendering, its match controllers are
registered with that same SSR cleanup authority. They remain live through
dehydration and response streaming so deferred loader work can finish while the
response is active, then abort when the response or stream lifetime ends.

## Selective SSR

SSR policy is the first parent-to-child serial step, before route context,
params/search validation handling, and `beforeLoad`:

- `true` runs server `beforeLoad` and loaders, loads render chunks, projects
  assets, and renders the component.
- `'data-only'` runs server `beforeLoad` and loaders and projects `head`,
  `scripts`, and `headers`, but does not render that route component.
- `false` skips server `beforeLoad`, loaders, and route projection/component
  chunks. Route context and params/search validation still run, so their errors
  remain real server outcomes.

A parent restriction cannot be relaxed by a child: `false` remains false, and a
`'data-only'` parent caps a child requesting `true` at `'data-only'`.

If a functional `ssr` option throws, the inherited/default policy is established
before calling it. The failure therefore retains the correct boundary
renderability instead of leaving `ssr` undefined.
An ordinary policy failure still reconstructs route context for its boundary;
if route context also fails, the original policy failure keeps precedence.
Redirects remain control flow and skip route-context reconstruction.

Shell mode resolves and dehydrates the root semantic match while the presented
server lane may include the first client-only pending boundary and its
descendants. This permits server and initial client presentation to agree.

## Hydration handoff

Hydration reconstructs server work; it does not run a competing hydration
loader. While reconstruction is asynchronous, its controller is `_preflight`.
No client transaction may exist. Framework entry points prevent navigation or
preloading during reconstruction. The same controller interrupts asynchronous
application hydration and chunk work, and every asynchronous phase rechecks
currentness before mutating or publishing.

Once hydration has accepted a semantic prefix and is ready to publish it,
`_preflight` is no longer the right authority: no planning operation is in
progress, but the first ordinary client load may still need to continue that
prefix. Hydration therefore installs `_handoff`, a temporary two-phase
capability, and detaches its controller from `_preflight`. This runtime state is
justified because it replaces eligibility inferred from several mutable fields
with one continuation owner. It is not a second completion promise or a general
cache.

The client router is fresh when hydration begins. Application `hydrate` hooks
may restore external integration state or update router options, but must not
start router loading or preloading before reconstruction finishes. This is a
supported-ordering contract, not another runtime guard.

The high-level process is:

1. install serialization adapters and application-dehydrated data,
2. match a fresh candidate lane for the browser location,
3. accept the identity-compatible serialized lane as the ordered prefix
   guaranteed by the document protocol,
4. copy server loader data, `beforeLoad` context, terminal state, and effective
   SSR policy into private candidates, and install each transported effective
   SSR value on its route so a functional server policy is not re-evaluated,
5. start exactly the chunks required by the accepted prefix and any selected
   terminal boundary concurrently, then consume their outcomes in route order
   so the earliest failed position can retire its suffix without waiting for
   irrelevant descendants,
6. rebuild route context parent-first,
7. project client `head` and `scripts` through the same projection
   function used after an ordinary client load, and
8. publish accepted semantic work and the complete structural presentation.

For ordinary SSR, the browser receives dehydrated data produced for the exact
document URL it requested, by the same route build, and the serialized matches
are an ordered prefix of the client lane. The payload carries compact per-match
IDs to prevent stale or cross-build data from attaching to a different local
match, but does not serialize a second URL identity.

An SPA shell uses the same ordered-prefix protocol for its root-only payload.
The framework owns making that shell payload applicable to the document it
serves. Hydration does not add a second URL authority to second-guess that
transport contract.

Ordinary and selective SSR payloads are ordered prefixes from the same route
build and exact document URL. Hydration bounds reconstruction to the local lane
and validates each transported position by compact match ID. A mismatch ends
the accepted prefix and leaves the local suffix for ordinary client loading. A
longer server lane is accepted only through a local global not-found boundary
that already caps the branch; otherwise no transported prefix is accepted.
A terminal server error, not-found, or global not-found caps client execution so omitted descendants do
not run. The client still reconstructs those descendants as unresolved matches
to preserve structural membership. Terminal hydration loads the selected
error/not-found component rather than waiting on the route's normal component,
and neither route context nor projection runs below the transported boundary.
The transported terminal route remains authoritative even when its effective
SSR policy is `false` or `'data-only'`: route context or validation was still
allowed to fail on the server, so hydration must not turn that outcome into an
unresolved client-only route. Before-load and loader work remain skipped there
according to the server policy.

Every executed context, `head`, and `scripts` hook nevertheless
receives the complete locally matched candidate lane. Hook arguments describe
structural membership; the accepted prefix describes execution authority.

If a required chunk or route-context reconstruction fails, hydration preserves
only the successfully reconstructed committed prefix.
The public presentation still contains the complete locally matched lane, so a
terminal server boundary does not make route membership disappear while its
client reconstruction is retried. Eligible transported loader successes cross
the normal loader-cache boundary with merged context and `beforeLoad`
contribution removed. Because `resolvedLocation` remains unset, ordinary
initial client loading retries the failed boundary or context and finishes the
unresolved suffix.

For a non-terminal selective-SSR handoff, the semantic committed prefix is the
complete contiguous transported prefix accepted as resolved. The first
`'data-only'` match is the presentation continuation boundary, but it does not
truncate semantic adoption: later transported successful data-only matches are
also committed and keep their server loader and `beforeLoad` results. A `false`,
pending, or otherwise unresolved match is the first semantic continuation
boundary and is not committed. Presentation can still contain the complete
candidate lane and marks its first presentation boundary pending as needed. In
particular, a shorter non-terminal server payload ending in a pending
`ssr: false` match is a valid selective-SSR handoff: hydration accepts the
resolved ancestors, presents the complete local branch, and lets the ordinary
initial client load execute from that client-only boundary.

For a successfully reconstructed terminal handoff, transport remains
prefix-capped but committed and presented membership use the complete locally
matched branch. Matches below the terminal boundary remain unresolved and
hidden; they own no transported `beforeLoad` result or loader data and do not
execute during hydration. This keeps public membership and lifecycle stable
without increasing the SSR payload or loading unreachable client chunks. If
reconstruction fails, only the accepted prefix is committed as described above;
the complete branch remains presentation, not semantic reuse authority.

Only the subsequent ordinary client load may transfer the whole hydration
prefix, and only while the exact committed-prefix owner, structurally shared
parsed history-state generation, and live hydration controller remain current
with no active transaction. The payload does not serialize a second URL
authority: Core captures the reconstructed browser generation only to prevent a
supported reentrant lifecycle event from handing document work to a successor
location. The transported prefix must also pass finish-time match-ID validation.
Core does not coordinate speculative work started between raw `hydrate()` and
that load; framework adapters own the supported ordering.

The two-phase transfer proceeds as follows:

1. Before public navigation events or matching, the initial client-load planner
   probes the capability without consuming it.
2. It installs its own `_preflight`, emits the events, matches a private lane,
   and asks the capability to finish the transfer.
3. Finish revalidates capability identity, transaction absence, hydration
   controller liveness, captured location identity, and the exact committed
   owner.
4. On rejection, the capability clears itself before aborting its controller,
   so abort listeners cannot reenter and claim a rejected handoff.
5. On acceptance, the prefix replaces the planner's private copies. A terminal
   prefix releases and removes its suffix; otherwise the suffix transfers to the
   hydration controller so one signal owns the continued lane.
6. The capability remains available across synchronous reentrancy until the
   current load installs `_tx`. That load installs `_tx` before clearing the
   capability; stale planners may release only their own private work.

This ordering closes the gap between hydration publication and client
transaction installation without making the handoff an independent completion
authority. If reconstruction is superseded before publication, `_preflight`
currentness aborts its private work. If the published handoff becomes
incompatible, its compare-and-swap rejection retires the hydration controller
and ordinary client loading starts from a fresh preflight.

Generic framework `RouterClient` components signal streaming hydration
completion after the hydration attempt settles, including rejection. This
finally-style handoff allows bootstrap globals to be removed once the server
stream has also ended without stranding the stream on a hydration failure.

Each framework owns one module-level hydration promise for the document. The
SSR protocol provides one global bootstrap and one `RouterClient`; additional
client-only routers use `RouterProvider` and do not independently consume that
bootstrap. The promise deduplicates framework rendering/replay only. It replaces
neither `_preflight` reconstruction authority nor `_handoff`
continuation authority.

## Resource and reentrancy checklist

When changing this architecture, verify all of the following:

1. Only current `_tx` commits, redirects, or completes a client navigation.
2. Only current `_preflight` may publish a client plan or asynchronous hydration
   reconstruction; it is installed before supported reentrant lifecycle events
   and route callbacks. After hydration publication, only the exact
   `_handoff` may transfer that prefix to the initial client load,
   which installs `_tx` before retiring the capability. Preloads never claim
   the handoff.
3. Every async write checks its authority immediately before mutation or
   publication.
4. `_committed`, not pending presentation, is the lifecycle and CAS base;
   cache-first same-ID matching is the deliberate loader-generation seed.
5. Pending publication contains the full destination lane but owns no flights;
   a successful loaderless ancestor is not needlessly returned to pending.
6. Each successful preload loader generation may enter the cache as it settles,
   even if its whole lane later becomes terminal or is canceled. It may retain
   same-ID route-local `_ctx`, but never merged context or `beforeLoad` output.
7. Active preload adoption is identical-whole-lane only, including router
   context, additional context, and user-supplied location state. It also
   requires the semantic committed owner captured during planning to remain
   current; rejected lanes may donate loader flights, never `beforeLoad`
   context. Retrying a terminal adopted lane may retain every independently
   successful loader generation, but rebuilds merged context and reruns the
   serial `beforeLoad` chain.
8. Hydration is the only completed-work exception for `beforeLoad` reuse. It
   verifies each transported match identity, reconstructs the accepted ordered
   prefix, reruns route context locally, preserves terminal/selective-SSR
   authority, and presents the full local branch while executing only the
   accepted prefix. Its two-phase handoff is claimable only by the supported
   initial document load and revalidates the live controller, captured location,
   and exact committed owner. The framework's exact-document contract remains
   the URL authority; the captured location rejects supported reentrant
   successors, while compact serialized match IDs guard prefix compatibility.
   It clears before abort on rejection and remains reclaimable until `_tx`
   exists. Framework adapters start that load before descendant route code can
   create unsupported speculative work in the handoff gap.
9. Match-id cache compatibility and route-id lifecycle identity are not mixed.
10. Cache publication retains only the generation allowed by its planning CAS;
    same-ID committed and cached generations invalidate together, and accepted
    recipients are installed before replaced resources are released.
11. The registry is the sole discovery authority for the latest same-ID flight
    started by navigation, preload, or background work. Registry joinability
    and lease ownership remain separate; donor selection happens synchronously
    after the reload decision, and accepted signal lifetime may outlive promise
    settlement.
12. Child `parentMatchPromise` follows the fresh semantic parent generation.
13. The first parallel ordinary failure is chronological, while any started
    descendant redirect can still win as control flow.
14. Projection errors are logged and swallowed, and global path misses retain
    their `_notFound` representation, which may be a successful fuzzy/root
    match without an attached error.
15. Terminal outcomes preserve the complete structurally matched branch;
    rendering, head/scripts, headers, manifest assets, dehydration, and cache
    exclusion derive the same cutoff, while SSR transport may cap its payload
    at the terminal prefix.
16. Every discarded semantic match and background candidate releases resources
    exactly once; bulk release detaches every lease and registry entry before
    aborting any collected flight controller.
17. A background write checks both writer and exact base identity. A successor
    may join its flight but never adopts its candidate lane.
18. Background publication waits for the foreground acknowledgement, then
    remains detached from foreground completion. Its eager settlement witness
    is retained across that wait so chronological failure/control selection is
    not recomputed later.
19. `isFetching` clears for success, failure, cancellation, and supersession.
20. Transition acknowledgement settlement gates resolved/idle completion; React
    identifies the exact generation by length plus ordered ID, controller, and
    status, and installs it in one superseding slot before running the possibly
    reentrant transition callback. Only `true` gates `onRendered` and pending
    minimum timing.
21. The single Transitioner and its acknowledgement machinery live for the
    router's entire application lifetime.
22. Reentrant callbacks suppress every stale later event or publication.
23. Canonicalization compares browser-facing `publicHref`; semantic `href` is
    not a symmetric canonical key across input and output rewrites.
24. Request abort can settle every awaited server phase; late work cannot regain
    response or injection authority.
25. Exactly one of the request handler or an accepted stream owns SSR cleanup.
    Accepted streams remain bound to request abort, and disposal releases router
    state before best-effort body cancellation.
26. Cleanup prevents a still-pending custom dehydration from beginning
    serialization.

If a fix violates one of these, consolidate ownership instead of layering a
special case on top.

## Testing changes

Tests must assert public behavior, not the internal tuple shape, phase tag,
private promise, timer, or field name used to implement it.

Useful assertions include:

- rendered pending/error/not-found content and the boundary that rendered it;
- the complete public matches array and `isFetching` transitions;
- loader/before-load call counts, contexts, parent promises, and abort signals;
- navigation completion, lifecycle callbacks, and their surrounding router
  events, without asserting a relative `onEnter`/`onStay` order;
- preload/cache reuse observable through user loader calls;
- HTTP status, headers, redirects, and absence of renderer invocation;
- request-abort settlement, late-stream disposal, and single stream cleanup;
- hydration output, completion on rejection, and absence of client reruns below
  server terminal boundaries;
- absence of stale data/assets after supersession; and
- framework acknowledgement tied to the actual rendered destination.

While `tx.done` suspends a pending React destination, React may retain the previous
source tree in the DOM but hide it. Pending tests should assert visible user
content, not physical absence of the old route's nodes.

When testing a boundary, give root, parent, and child visibly distinct output.
An assertion such as `/Not Found/` or `/Error/` can pass at the wrong boundary
and is not sufficient.

Run focused category tests while changing the loader, then affected core and
framework unit/type suites, selective-SSR E2E tests for server/hydration changes,
and the bundle-size benchmark for any client runtime change.
