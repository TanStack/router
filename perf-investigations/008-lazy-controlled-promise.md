# 008 — create `ControlledPromise`s lazily on the sync path

|                 |                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Area            | `packages/router-core/src/router.ts`, `load-matches.ts`, `utils.ts` (shared client+server)                 |
| Benchmarks      | client-nav (react)                                                                                         |
| Expected impact | Medium (60-90 controlled-promise allocations per benchmark iteration eliminated)                           |
| Confidence      | Medium-high (beforeLoadPromise part is high; loadPromise part needs a consumer audit)                      |
| Risk            | Medium (suspense + concurrent-load coordination)                                                           |
| Prior art       | partially adjacent to `origin/flo/load-matches-sync-fastpaths` ([004](004-load-matches-sync-fastpaths.md)) |

## Problem

On the fully-sync fast path, each match allocates 2-3 `ControlledPromise`s per navigation (3 for brand-new matches), all resolved and nulled before `loadMatches` returns, with nothing ever awaiting them:

- `router.ts:1620` — every new match in `matchRoutesInternal` gets `_nonReactive: { loadPromise: createControlledPromise() }`.
- `load-matches.ts:397-401` — `executeBeforeLoad` unconditionally replaces `loadPromise` with a fresh controlled promise chaining the previous one (so the constructor-time one is immediately superseded).
- `load-matches.ts:451` — `beforeLoadPromise` is created **before** knowing whether `beforeLoad` is sync.
- `load-matches.ts:925` — `loaderPromise` created on every non-skip `loadRouteMatch`.
- `utils.ts:462-486` — each `createControlledPromise` = native promise + executor closure + resolve/reject closures + status fields.

The only consumers are React suspense (`react-router/src/Match.tsx:316/338/434/461` via `getMatchPromise`, only when status is `'pending'`/`_displayPending`) and overlapping-load coordination (`load-matches.ts:364-368, 893-905`).

## Proposed approach

1. **`beforeLoadPromise`**: create it only inside the `isPromise(beforeLoadContext)` branch (`load-matches.ts:516`) — move creation after the call; sync callers never observe it. (Highest confidence, smallest diff.)
2. **`loaderPromise`**: create only when `handleLoader` decides async work will actually happen; it's needed by concurrent `loadRouteMatch` calls only once a load is genuinely in flight.
3. **Constructor-time `loadPromise`** (`router.ts:1620`): audit consumers — it's superseded at `:397-401` on every load; either drop the eager creation or create lazily via a `getMatchPromise`-side fallback. Must guarantee existence whenever a match can render as `'pending'` (suspense reads it).

## Risks & constraints

- Overlap detection: a second `loadMatches` (preload or rapid double navigation) checks `prevMatch._nonReactive.loaderPromise` (`load-matches.ts:893`) to detect in-flight loads. Creating it later shrinks but doesn't eliminate the window (everything before the first await is synchronous) — verify the preload/navigate race tests.
- Suspense: `Match.tsx` reads `loadPromise` while status is `'pending'`; the lazy path must cover `_displayPending`/`pendingComponent` scenarios.
- Bundle delta neutral-ish; verify.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/router-core:test:unit && pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: suspense/pending-component, preload, concurrent navigation.
