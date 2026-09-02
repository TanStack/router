# RFC: Solid-native SSR/hydration for `@tanstack/solid-router`

**Status:** draft for discussion
**Scope:** the Solid adapter's SSR transfer and hydration boot — not the cross-framework router API

## Context

The Solid v2 line has been converging on a pattern, one PR at a time: every
mechanism the router carried for moving state across the wire has a Solid
2.0 channel that does it natively, and every replacement so far has shrunk
code and payload while keeping every e2e suite green.

- SSR query transfer → the hydration registry, content-addressed
  (`solid-query` v6; `solid-router-ssr-query` retired in
  [#8193](https://github.com/TanStack/router/pull/8193), which removed a
  double-ship of every query payload)
- Post-mutation data → the multi-source single-flight envelope
  ([#8192](https://github.com/TanStack/router/pull/8192): named sources +
  `loadFlightTarget`)
- Redirects from cache-driven fetches → a dozen lines composing
  `isRedirect`/`resolveRedirect` with the caches' `config.onError`
- The reference for all of it: solidjs/templates `fullstack-tanstack`
  (bare vite + Router + Query, no Start, no integration package —
  [templates#287](https://github.com/solidjs/templates/pull/287))

What remains are the deeper assumptions, inherited from the React
integration model where the framework has no serialization channel and no
hydration-claiming, so the router had to build both:

1. **The router owns the SSR envelope.** `router.serverSsr`, the
   `dehydrate()`/`hydrate()` options, and the `__TSR_SSR__` script protocol
   form a parallel serialization channel through the router's own stream
   injection.
2. **The router loads before hydration.** The client is expected to
   resolve and commit matches before first render (the template's
   `bootLoad`, plus the prefetch-pausing it drags along) because React
   hydration can't claim through async work.
3. **The router owns the HTML's boundary structure.** A global catch
   boundary is injected client-side that the server never rendered —
   correct when TanStack's stream handlers produce the HTML, a hydration
   mismatch when Solid's renderer does (today's escape hatch:
   `disableGlobalCatchBoundary: true`).
4. **Suspense-era data ergonomics.** Deferred/`Await` patterns exist
   because components couldn't just read async values. In Solid 2 they
   can; the idiomatic usage is already "loaders as non-blocking prefetch
   hints, suspension at the read point."

## Principles

- **The framework channel is the transfer.** Anything Solid can serialize
  through the hydration registry (promise-valued, streamed by seroval as
  it settles) should not ride a router-owned side channel.
- **Never block up front.** No pre-hydration load pass, no up-front chunk
  resolution, no envelope waiting. Solid's `lazy` already participates in
  hydration — a route chunk resolves under its boundary and claims its
  markup when it lands — so `route.lazy` maps onto read-point resolution.
  The same goes for data: pending loaders transfer as promises and settle
  where they're read.
- **Loader API semantics are untouched.** Blocking loaders,
  `pendingComponent`, `beforeLoad`, deferred — the cross-framework
  contract stays. This RFC changes how the _adapter_ transfers and boots,
  not what the API promises.
- **Data lives in caches that know how to transfer themselves.** The
  router transfers _its_ state (matches, `loaderData`, statuses); query
  caches transfer theirs; the flight envelope keys them independently.
  Nothing aggregates someone else's state.

## Phase 1 — the bare pairing goes fully native (no Start exposure)

The template path (`createRouter` + `RouterProvider` under Solid's
renderer) never enters `createStartHandler`, so it can change freely.

- **Registry match transfer.** _(Landed: `registryTransfer.ts`,
  serialization in `RouterProvider`.)_ During server render the adapter
  serializes each settled match's state content-addressed
  (`tsr:<matchId>` keys) — the pattern `solid-query`'s provider proved.
  Still open within this bullet: promise-valued entries for matches
  pending at render time (streaming SSR). This core has no per-match
  settle promise, so it needs a dispatch-time hook; today pending matches
  are skipped and the client boot falls through to current behavior.
- **Hydration-claiming boot.** _(Landed: the `Router` constructor.)_
  Match synchronously, prime match state from the registry, commit
  without running loaders. Placement discovered to be load-bearing:
  committing inside the hydration render desyncs the claiming walk's
  registry bookkeeping even with writes moved off the owner — router
  creation is the client's natural pre-render moment (after document
  parse, before `hydrate()`). Route chunks resolve at the read point via
  Solid `lazy` semantics. This deleted the template's `bootLoad` (and its
  URL-divergence reload guard) and the prefetch-pausing flag outright —
  verified on the production template: zero server-function requests at
  boot, hydration clean, single-flight unchanged.
- **Boundary parity.** _(Already true on this line.)_ The adapter's
  boundary structure is symmetric between server and client
  (`_resolveMatchesLoadingBoundary` consults no hydration state), so
  `disableGlobalCatchBoundary` is no longer a parity workaround — it
  survives as a semantic choice: let errors (including SSR-thrown
  `redirect()`) bubble past the router to app-owned boundaries and the
  stream handler. The template's comment was corrected to say so.

## Phase 2 — Start rides it behind the existing contract

`start-server-core` orchestrates through `attachRouterServerSsrUtils`,
`dehydrate()`/`hydrate()`, and the stream handler — that contract is
shared core and stays intact as a facade. Within it, the Solid
`defaultStreamHandler`/`renderRouterToStream` source the transfer from the
registry channel instead of `__TSR_SSR__` script injection wherever both
exist; user `dehydrate`/`hydrate` hooks keep working. The flight collector
already went through this door: `loadFlightTarget` absorbed the
event-derivation half, and its extraction half shrinks further once match
state is registry-addressed.

**Regression gate:** the three Solid Start e2e suites
(`basic-solid-query`, `server-functions`, `server-routes` — 37 tests,
including redirect-from-query on both mount and SSR paths, and the
transition semantics) all run locally today and define "didn't break
Start."

## Phase 3 — upstream

Once both runs are proven, propose the defaults upstream with working
code and measured deltas (payload double-ship eliminated, boot code
deleted, boundary workaround gone), the same argument shape as #8193 one
layer deeper. React/Vue adapters are untouched throughout;
`router-ssr-query-core`'s transport remains correct for frameworks
without a native channel.

## Open questions

- Match key identity: route id + params hash vs match id — needs to be
  stable across server/client and across redirects into the same route.
- `loaderData` streaming semantics vs the existing deferred API: a
  promise-valued registry entry makes deferred _transfer_ free, but the
  read-side API compatibility needs mapping.
- Scroll restoration and `__TSR_SSR__` consumers beyond match state
  (manifest/asset injection) — inventory what else rides the script
  channel before swapping it.
- Where the SSR teardown lands for router state (the query cache got
  cancel+clear on render disposal; matches may want the same).
