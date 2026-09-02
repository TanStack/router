# RESULT — perf/task3-ssr-manifest-cache

## Goal

`packages/router-core/src/ssr/ssr-server.ts` `dehydrate()` re-serializes the static
route manifest (matched-route asset descriptors) through seroval on **every**
request, although it is byte-identical for a given matched-route set. This work
caches the _serialized_ manifest fragment in an LRU and emits it as a separate
script assignment so only dynamic data goes through the per-request stream.

## Cross-reference analysis (task 1) — why splitting is safe here

Seroval's `crossSerializeStream` builds one reference-ID graph (`$R["tsr"]`)
per stream call and deduplicates shared object identity inside that graph.
Naive splitting would be unsafe **only if** objects were shared across the
manifest/match boundary — then one side would reference an ID the other side
never defines, breaking hydration.

Analysis of the data:

- The manifest fragment (`preparedManifest.routes`, `scriptFormat`,
  inline-CSS placeholder) is produced by the bundler plugin at build time:
  plain JSON-safe data (strings, arrays, plain objects, booleans).
- The per-request part (`matches` → `dehydrateMatch()`: loaderData,
  beforeLoadContext, errors; plus optional request-scoped assets) is created
  independently at runtime by loaders/user code.
- No code path assigns a manifest route object into match data or vice versa;
  the two trees never share references (request assets are merged via
  `{...spread}` copies into a fresh root-route object,
  `mergeRequestAssetsIntoRootRoute`).

Conclusion: no cross-references exist between the two portions, so splitting is
hydration-safe. Additionally, the split halves are emitted into the _same_
inline `<script>` block in order (initial `$_TSR.router=` chunk →
`$_TSR.router.manifest=` assignment → streamed continuations → `$_TSR.e()`),
and client hydration (`hydrate()` in `load-client.ts`) reads
`$_TSR.router.manifest` only after all scripts have executed, so replay order
is preserved.

## Design (task 2/3)

- New LRU (`createLRUCache`, size 100, WeakMap-keyed per `ServerManifest`)
  caches a `SerializedManifestFragment { head, routes, tail }` keyed by the
  existing matched-route-id cache key (`getMatchedRoutesCacheKey`).
  - `head/tail` wrap `"routes":` including any static `scriptFormat` /
    `inlineStyle` placeholder entries; `routes` is seroval
    `serialize(preparedRoutes, { plugins })` — the same plugin set as the main
    stream, so custom serialization adapters still apply.
- On cache hit with no request-scoped assets, `dehydrate()` emits exactly one
  pre-built string:
  `$_TSR.router.manifest=<head><routes><tail>`
  and passes `manifest: undefined` into `crossSerializeStream`.
- With request-scoped assets, the merged root route is serialized per request
  (small) and spliced in without touching the cached bytes:
  `$_TSR.router.manifest=<head>Object.assign({},<routes>,{"__root__":<merged>})<tail>`
- The assignment script is enqueued inside `onSerialize(initial=true)`
  immediately after the initial router chunk — `ScriptBuffer` preserves order,
  so it can never run before `$_TSR.router` exists nor after `.e()`.
- Gated to production (`isManifestSerializationCacheEnabled()` reads env lazily)
  to avoid stale fragments under dev HMR — same policy as the existing
  prepared-manifest LRU.
- Failure fallbacks: if fragment or merged-root serialization throws, the code
  logs and falls back to embedding the full manifest in the stream graph
  (exact previous behavior). Escaping/safety is unchanged: output strings are
  seroval-produced expressions embedded in `<script>` exactly as before.

## Tests (task 4)

New file `packages/router-core/tests/ssr-server-manifest-cache.test.ts`:

1. Second request with same matched-route set produces identical parsed
   hydration result and byte-identical cached manifest fragment.
2. Manifest is emitted as a separate `$_TSR.router.manifest=` assignment
   ordered between the `$_TSR.router=` chunk and `$_TSR.e()`, and evaluates to
   the correct routes.
3. Cache-hit hydration result deep-equals the uncached path result
   (manifest + matches).
4. Request-scoped assets merge correctly over a cached fragment, repeatedly.
5. 2×50 distinct route sets (> LRU size 100 total insertions) force eviction;
   evicted-and-recomputed requests stay correct.
6. Direct LRU boundedness/eviction-order unit test.

All 107 test files / 1612 tests pass (`test:unit`), plus `test:eslint`
(0 errors) and `test:types`. Note: the full-suite exit-code failure from 2
pre-existing jsdom `window.scrollTo` unhandled errors reproduces identically on
the untouched base commit — not introduced by this change.

## Numbers (task 5)

`tests/ssr-manifest-dehydrate.perf.test.ts` (gated perf test, excluded from CI;
run with `RUN_BACKPRESSURE_PERF=1 pnpm vitest run tests/ssr-manifest-dehydrate.perf.test.ts`).

Scenario: nested route tree, single request matches **51 routes** (**root** +
50 segments), each segment with 10 preloads + 1 module script + 1 css link;
emitted payload ≈ **75,915 bytes**. Timing covers `serverSsr.dehydrate()` +
`takeBufferedScripts()` only (router.load excluded); n=200 each, median of 3 runs:

| path                         | median           | p95               |
| ---------------------------- | ---------------- | ----------------- |
| uncached (baseline)          | 0.55–0.59 ms     | ~2.8 ms           |
| cached, first request (miss) | 0.53–0.57 ms     | ~0.9–3.8 ms       |
| cached, subsequent (hit)     | **0.24–0.25 ms** | **~0.28–0.49 ms** |

≈ **2.3× faster dehydrate+serialize (~57% less time)** on warm requests, and a
large tail-latency improvement (p95 ~6–10× lower). Cache-miss cost is
indistinguishable from baseline. Absolute savings scale with manifest size;
larger real-world manifests (more assets per route) benefit more.

## Risks / notes

- Prod-only by design: dev-mode HMR mutations of a manifest object in place
  would be masked by the cache. If manifests mutate in place in prod
  deployments (not a known pattern), stale fragments could be served.
- If user serialization adapters were required to serialize values inside
  _static_ manifest routes, the cached fragment is computed with those adapters
  on first request; adapters whose output depends on per-request state would be
  baked into the first request's bytes (no such adapter exists today; default
  plugins handle Error/ReadableStream/RawStream which don't occur in build-time
  manifests). A serialization throw falls back to the uncached path.
- Client contract addition: `$_TSR.router.manifest=` may arrive as its own
  statement after the router chunk. All framework entry points read the
  manifest only via `hydrate()` after script execution, so ordering is safe;
  verified against `load-client.ts hydrate()`.
