# 013 — Link `_options` memo defeated by inline `search`/`params` props

|                 |                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/link.tsx`                                                                                                                                                                                                                                    |
| Benchmarks      | client-nav (react)                                                                                                                                                                                                                                                      |
| Expected impact | Small-medium (+2 avoidable `buildLocation` calls per click today; medium in apps whose link parents re-render often)                                                                                                                                                    |
| Confidence      | High                                                                                                                                                                                                                                                                    |
| Risk            | Low                                                                                                                                                                                                                                                                     |
| Prior art       | `origin/perf/react-link-location-deps` explored this area (incl. removing search validation from buildLocation); its author judged the approach unsatisfactory ("i dont think this is good, just technically fun") — read it for pitfalls, don't resurrect it wholesale |

## Problem

- `link.tsx:385-400` — the `_options` memo's dependency array includes `options.search`, `options.params`, `options.state`, `options.mask` **by identity**.
- Typical usage (and the benchmark) passes inline literals and updater arrows: `search={{ page: 1, ... }}`, `params={{ id: itemsId }}`, `search={(prev) => ...}` — so `_options` is new on **every render**, invalidating the `next` memo (`link.tsx:410-413`) → full `buildLocation`, and recreating `doPreload`/`preloadViewportIoCallback` (`link.tsx:565-582`).
- Concretely: the clicked link re-renders twice per click from `setIsTransitioning(true/false)` (`link.tsx:620-627`) and pays two extra `buildLocation`s each time. Any parent re-render makes it O(`buildLocation` × links).

## Proposed approach

Stabilize `_options` with a previous-value ref doing a cheap equivalence check:

- Keep prior dep values; compare `search`/`params`/`state`/`mask` objects via `deepEqual`/shallow compare (small POJOs — cheap; `deepEqual` is already imported in link.tsx), functions by identity only (same as today, no regression).
- Return the previous `_options` object when equivalent, so `next` truly recomputes only when `currentLocation` or real option values change.

## Risks & constraints

- `deepEqual` on every render costs something — these are tiny objects; ensure the compare short-circuits on reference equality first.
- Function props (updaters) can't be deep-compared; identity-only means inline updaters still invalidate — that matches current behavior, so no regression, but the win for updater-links comes from [002](002-match-routes-lightweight-memo.md)/[003](003-build-middleware-chain-cache.md) instead.
- Bundle delta small; reuse existing imports.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- [016](016-link-render-granularity.md) is the structural version of this fix; [013] is the low-risk subset.
