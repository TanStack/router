# 009 — `parseLocation` reuses the location `navigate` just built

|                 |                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/router.ts` (shared client+server)                                                                                                                   |
| Benchmarks      | client-nav (react); small SSR benefit                                                                                                                                         |
| Expected impact | Small-medium (once per navigation, but it's the densest string-processing block in the commit path; combos with 001)                                                          |
| Confidence      | Medium (a previous broader attempt was reverted — see history)                                                                                                                |
| Risk            | Medium-high — **this exact area has a revert in its history**; keep the change strictly guarded                                                                               |
| Prior art       | #6398 "don't reparse upon navigation" was **reverted in #6468**. Read both PRs before starting. This proposal is deliberately a much narrower, byte-equality-guarded variant. |

## Problem

A navigation builds a complete `ParsedLocation`, commits it to history, and then immediately re-derives the same thing from the href:

1. `buildLocation` produces `{href, publicHref, pathname, search, searchStr, hash, state}`; `buildAndCommitLocation` stores it as `this.pendingBuiltLocation` (`router.ts:2282`).
2. `commitLocation` pushes only `publicHref` + state into history (`router.ts:2226-2230`).
3. The history subscriber (`react-router/src/Transitioner.tsx:37`) calls `router.load()` → `beforeLoad()` → `updateLatestLocation()` (`router.ts:1220-1225`) → `parseLocation(this.history.location)` (`router.ts:1294-1374`), which re-runs `parseSearch` (URLSearchParams decode + JSON.parse attempts incl. thrown exceptions, see [001](001-search-params-json-parse-exception-storm.md)), re-runs `stringifySearch` for normalization (`router.ts:1309-1310`), `decodePath` ×2, `nullReplaceEqualDeep` on search and `replaceEqualDeep` on state — reconstructing what `pendingBuiltLocation` already holds.

Timing is favorable: history `notify` fires synchronously inside `commitLocation`, before the `queueMicrotask` at `router.ts:2297-2301` clears `pendingBuiltLocation`, and `beforeLoad` runs synchronously inside `load()`'s `startTransition`.

It also breaks structural identity: the re-parsed `search` is a fresh object, re-shared via `nullReplaceEqualDeep` against the _previous_ location rather than reusing the built object.

## Proposed approach

A guarded fast path in `updateLatestLocation` (or a dedicated branch in `parseLocation`):

```
if (this.pendingBuiltLocation
    && this.pendingBuiltLocation.href === this.history.location.href
    && !this.history.location.state.__tempLocation
    && !this.rewrite) {
  // reuse pathname/search/searchStr/hash/href/publicHref from the built location;
  // take only state via replaceEqualDeep(previous?.state, history.location.state)
  // (history adds __TSR_key/__TSR_index)
}
```

Fall back to the full parse for: masked locations (masked commits store `__tempLocation` state, `router.ts:2190-2217`), rewrites/external URLs, any href mismatch, and back/forward events (no pending built location).

Alternative lighter form: an LRU of `rawSearchString → {search, searchStr}` inside the router, which also dedupes repeated parses of equal strings across history events — less reuse but fewer preconditions.

## Risks & constraints

- **Why the previous attempt was reverted**: read #6468's description/tests and make those cases explicit fall-backs. Keep the byte-equality guard (`href` exact match) so non-canonical hrefs still go through re-canonicalization.
- Custom `createHref`/browser history mutating the committed href: the post-roundtrip `history.location.href` comparison handles this (memory history's `createHref` is identity, `history/index.ts:628`).
- `parseSearch` impurity: search would skip the parse round-trip; the built object was produced by validators/middleware — which is what `matchRoutes` consumes anyway — but only behind exact href equality.
- Async history adapters: verify `pendingBuiltLocation` lifetime holds (it's cleared on a microtask).
- Bundle delta ≈ +15 guarded lines in router-core.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
```

Focus tests: location masking, rewrites/basepath, back/forward, custom parseSearch/stringifySearch, hash handling. Find and re-run whatever test motivated the #6468 revert.
