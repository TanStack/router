# 012 — `Outlet`/`Match`/`MatchInner` re-render on every match-store set (fresh-tuple selectors, `===` compare)

|                 |                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/Match.tsx`                                                                                                                    |
| Benchmarks      | client-nav (react)                                                                                                                                       |
| Expected impact | Small-medium (one Outlet+Match+MatchInner per active level × every active-store set; `MatchView` rebuilds ~6 boundary elements + closures per re-render) |
| Confidence      | High                                                                                                                                                     |
| Risk            | Low-medium (under-selection of fields read in throw paths)                                                                                               |
| Prior art       | none found                                                                                                                                               |

## Problem

- `Match.tsx:524-527` (Outlet):
  ```ts
  const [routeId, parentGlobalNotFound] = useStore(
    parentMatchStore,
    (match) => [match?.routeId, match?.globalNotFound ?? false],
  )
  ```
  A new array per selector run with the default `===` compare (`@tanstack/react-store` `defaultCompare`) → **every** parent match-store `set` forces an Outlet re-render even when neither field changed.
- `Match.tsx:78-80` — `Match` subscribes with an identity selector (`(value) => value`), re-rendering on every set; it only consumes `routeId`/`ssr`/`_displayPending` (memoized into `matchState` at `:82-93`), but the component render + `MatchView` element-tree rebuild (`:163-218`, ~6 boundary elements, `getResetKey`/`onCatch`/not-found `fallback` closures) still happens.
- `Match.tsx:371` — `MatchInner` likewise subscribes with identity and re-renders fully on every set (its `out` element is memoized, the render isn't).

Each navigation performs several match-store sets per level (see [006](006-update-match-write-coalescing.md)), so with 3 active levels this is a steady stream of avoidable React renders.

## Proposed approach

1. **Outlet**: split into two scalar `useStore` selections, or pass a compare fn (`(a,b) => a[0]===b[0] && a[1]===b[1]`).
2. **Match**: select only the consumed fields (`routeId`, `ssr`, `_displayPending`) with a field-wise compare.
3. **MatchInner**: add a compare checking the identity of the fields actually read during render (`status`, `error`, `_displayPending`, `_forcePending`, `loaderDeps`, `_strictParams`, `_strictSearch`, …) — enumerate by reading the component body before finalizing the list.

## Risks & constraints

- Under-selecting a field read in a throw/suspense path is the failure mode — audit the full render body (note `match._nonReactive` is read fresh through `router.getMatch`, not via the subscription, so it's unaffected).
- Compare functions run per set per component — keep them field-identity checks only.
- Bundle delta: ± a few bytes.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Effect is amplified while [006](006-update-match-write-coalescing.md) hasn't landed (more sets today); still worthwhile after.
