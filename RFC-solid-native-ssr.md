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
  The promise-valued half landed where the blocking contract puts it: not
  as whole-match entries (blocking loaders settle before publish by
  contract, so a pending match at serialize time doesn't exist on the
  happy path) but as _deferred `loaderData` fields_. An unawaited promise
  in `loaderData` rides `ctx.serialize` untouched — seroval streams its
  resolution, the shell flushes with the fallback, the value arrives in a
  later chunk, and the hydrating client adopts the same promise from the
  registry entry. Zero adapter code; verified by chunk-order assertions
  in the harness. Read-side, `<Await>` is compat surface only — the
  native consumption is a memo returning the promise read under a
  `Loading` boundary.
- **Provider-owned server dispatch.** _(Landed: `RouterProvider`.)_ The
  server entry no longer calls `await router.load()` — the provider
  detects an unloaded router (`!router._serverResult`), kicks `load()`
  itself, and parks the render on it through an async memo gating the
  match tree. Solid's streaming renderer awaits the park natively, so
  blocking-loader semantics are byte-identical to the manual await; the
  gate memo exists on both environments so hydration keys stay aligned,
  and the client resolves it immediately (boot is the constructor priming
  plus `Transitioner`'s settled-time load). Consequence: the bare pairing
  requires `renderToStream` — `renderToString` is synchronous by design
  in Solid 2 and throws on parked values. Recipes and templates use
  `renderToStream` unconditionally.
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
shared core and stays intact as a facade. The flight collector already
went through this door: `loadFlightTarget` absorbed the event-derivation
half. Phase 2 splits into transport and payload:

- **2a — Solid-owned script transport.** _(Landed:
  `renderRouterToStream`.)_ The Solid path no longer runs
  `transformStreamWithRouter` — the 900-line HTML transform that decoded
  every chunk, scanned for closing-tag boundaries, spliced router scripts
  in, and held the `</body></html>` tail until serialization finished.
  Router scripts now ride the response writer directly: the shell payload
  was always inlined by `<Scripts />` during the render (untouched), and
  late scripts (streamed loaderData resolutions, the end marker) write
  straight to the sink as the serializer emits them — the same
  after-the-shell placement Solid's own late chunks use (HTML5 parsers
  reparent trailing content; this is Solid's production protocol). The
  script barrier lifts when the chunk carrying the `<Scripts />` tag has
  been written (chunks are scanned only until the marker is seen); the
  response closes when both the render completed and serialization
  finished, with the transform's 60s timeout and cleanup semantics
  preserved. Zero per-chunk decode/scan/splice on the hot path.
- **2b — payload through Solid's JSON codec.** _(Landed.)_ The parse-time
  wall that blocked the registry route (adapter-typed values serialize as
  `$_TSR.t.get(key)(...)` calls that evaluate before `fromSerializable`
  implementations exist) doesn't exist on Solid's other channel: the
  eval-free JSON codec Start's server functions already ride —
  `createJSONSerializer` emits inert `SerovalNode` records, the client
  decodes at runtime with `makeSerovalPlugin`-wrapped adapters. The
  DehydratedRouter now takes that road — and, on this pre-release branch,
  with **zero diff outside the Solid packages**: everything rides
  Solid-side overrides of the (documented framework-only)
  `router.serverSsr` members, installed through the existing
  `onServerSsrAttach` lifecycle. A follow-up core-hooks PR against `main`
  will let the overrides collapse into supported seams.
  - **Attach seam (`solid-router`):** the `Router` constructor registers
    an `onServerSsrAttach` listener that resolves the installer through a
    slot (`solidSsrTransferSlot`) filled by the `ssr/server` entry module
    — the encode half of Solid's codec must never enter the client module
    graph (the Solid vite plugin treats it as server-only and a client
    bundle that reaches it loses its entry emission), and the package's
    `sideEffects` allowlist keeps bundlers from dropping the slot fill.
    Unfilled slot (client bundle, or a server render that never imports
    Solid's `ssr/server`) means core's script channel runs unchanged.
  - **Server (`installSolidSsrTransfer`):** replaces `serverSsr.dehydrate`
    with a Solid implementation that builds the DehydratedRouter the way
    core does (rendered matches, shell slicing, `options.dehydrate()`
    data, and a dehydrated manifest _derived_ from the public
    `router.ssr.manifest` getter — the raw ServerManifest is closed over
    by core's attach and unreachable from an adapter), then serializes it
    through `createJSONSerializer` with the RPC codec's plugin recipe
    (router adapters via `makeSerovalPlugin` + router defaults minus the
    ReadableStream plugin Solid's codec already carries). Records ride a
    Solid-owned mirror of core's `ScriptBuffer` as
    `(self.__TSR_P=self.__TSR_P||[]).push({...})` data pushes —
    `takeBufferedScripts`/`liftScriptBarrier` are overridden to serve it
    with core's exact shell-inline tag shape (barrier id, nonce,
    self-removal), so `<Scripts />` inlining, barrier deferral, and the
    2a sink all work unchanged.
    `isDehydrated`/`isSerializationFinished`/`onSerializationFinished`
    answer from Solid-side state (core's internal flags never advance
    since core's dehydrate never runs); `setRenderFinished`/`cleanup`
    wrap the originals so core's render-finished listeners and teardown
    still fire. Core's seeded `$R` scope header and `$_TSR` bootstrap are
    drained and discarded at attach — the channel carries no executable
    payload. Streamed loaderData promises settle through later records;
    the serializer's `onDone` is the end-of-stream that gates the sink
    close.
  - **Client (synthetic `$_TSR`):** core `hydrate(router)` is unchanged —
    it still reads `window.$_TSR` (sets `.t`, replays `.buffer`, then
    reads `.router`). Solid installs a synthetic `$_TSR` whose lazy
    `router` getter decodes the `__TSR_P` queue through
    `createJSONDataTable` at that final read — after adapters are
    finalized (`RouterClient` reads them off the router; Solid's
    `hydrateStart` reads the adapter array off
    `window.__TSS_START_OPTIONS__`, the same array core's `hydrateStart`
    populates before calling `hydrate`) — and hooks the queue's `push` so
    late records settle pending promises. The object is built from
    decoded JSON records; no parse-time eval, no `t` map, no
    deferred-script buffer. Two load-bearing details: the decode module
    is loaded through a dynamic import (a static one merges it into the
    importer's chunk — for default-entry apps the client entry itself,
    which then registers as a dynamic-import target of Solid's own lazy
    decode load and gets its `isEntry` stripped by the vite plugin's
    lazy-entry normalization, breaking Start's manifest capture), so the
    shim's install returns a promise the callers await before core
    hydrate; and the synthetic's `h()` deletes the global (the shim has
    no post-hydration role — late records ride the queue's hooked `push`,
    never `$_TSR.p`), keeping `typeof window.$_TSR === 'undefined'` a
    valid hydration-finished probe on both channels. The shim is a no-op
    when a real `$_TSR` bootstrap exists (a document rendered by a
    script-channel server), so React/Vue and older-server documents are
    untouched.

**Regression gate (2a + 2b, all green on a fresh build):** nine Solid Start
e2e suites — `basic` (80), `server-functions` (29), `deferred-hydration`
(15), `selective-ssr` (11), `scroll-restoration` (10), `basic-solid-query`
(6), `serialization-adapters` (5), `server-routes` (2), `spa-mode` (2) —
160 tests covering streaming order, selective SSR lanes, adapter decode,
scroll scripts, and shell mode, plus the bare-pairing harness.

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
- ~~`loaderData` streaming semantics vs the existing deferred API~~ —
  resolved: transfer is free (seroval streams promise fields in registry
  entries), and the existing `<Await>`/`useAwaited` API keeps working as
  compat while native reads (async memo under `Loading`) are the
  documented path.
- ~~Scroll restoration and `__TSR_SSR__` consumers beyond match state
  (manifest/asset injection) — inventory what else rides the script
  channel before swapping it~~ — resolved: the channel's only producer
  was `dehydrate()` itself (scroll restoration rides match meta/assets;
  the manifest is inside the DehydratedRouter). With 2b the payload
  carries everything and the bootstrap/cross-reference seeds are gone;
  the `scroll-restoration` suite is green on the new channel.
- Where the SSR teardown lands for router state (the query cache got
  cancel+clear on render disposal; matches may want the same).
