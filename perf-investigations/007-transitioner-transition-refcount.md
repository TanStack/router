# 007 — ref-count Transitioner `setIsTransitioning` instead of toggling per `updateMatch`

|                 |                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area            | `packages/react-router/src/Transitioner.tsx`, `packages/router-core/src/router.ts`                                                                                                                                                   |
| Benchmarks      | client-nav (react)                                                                                                                                                                                                                   |
| Expected impact | Medium — React update processing (`updateReducerImpl`) is the single largest frame in the client profile at 15.8%; Transitioner churn is a significant driver beyond legitimate content re-renders                                   |
| Confidence      | Medium-high (mechanism verified; exact attribution within the 15.8% not isolated)                                                                                                                                                    |
| Risk            | Medium (`onResolved` emission ordering)                                                                                                                                                                                              |
| Prior art       | solid got an analogous cleanup in #7584 (`41e7a24f69`); React's side untouched. `origin/refactor-router-core-ready-transition-performance` (`cd6db1f5dc`) reworks the adjacent onReady/transition code in router.ts — read it first. |

## Problem

`Transitioner.tsx:26-32` installs:

```ts
router.startTransition = (fn) => {
  setIsTransitioning(true)
  React.startTransition(() => {
    fn()
    setIsTransitioning(false)
  })
}
```

and `router.ts:2698-2727` routes **every** `updateMatch` through `this.startTransition`. With 3-8 `updateMatch` calls per navigation (`load-matches.ts:421,435,505,683,700,717` …) plus `load()` itself (`router.ts:2454`), each navigation produces ~8-14 `startTransition` invocations = ~16-28 React `setState` calls on the Transitioner. They happen in separate async continuations of `loadMatches`, so they don't batch; each toggle re-renders the Transitioner and re-evaluates its 3 `useLayoutEffect`s + `usePrevious` hooks (`Transitioner.tsx:86-128`), and oscillates `isAnyPending`.

## Proposed approach

1. **Ref-count edges**: keep a depth counter in a ref inside the Transitioner-installed `startTransition`; call `setIsTransitioning(true)` only on the 0→1 edge and `setIsTransitioning(false)` only when the count returns to 0 (checked inside the transition callback). The boolean is only consumed as "any transition pending", so edge-triggering preserves observable semantics exactly.
2. Alternative (riskier): stop routing `updateMatch` through the bookkeeping wrapper entirely and use bare `React.startTransition` for match writes — but `isTransitioning` gates `onResolved` emission, so semantics need careful verification.

## Risks & constraints

- `isTransitioning` feeds `isAnyPending` → `onResolved`/`onBeforeRouteMount` emission timing (`Transitioner.tsx:86-128`). The client-nav benchmark itself awaits `onRendered`/`onResolved` — the final 1→0 edge must fire at the same point as today. The ref-count variant is the one that preserves this.
- Tests exist around `onResolved` ordering; run react-router unit tests.
- Bundle delta: a few bytes (one ref + two comparisons).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Use the flame benchmark (`test:flame:react`) before/after: the win should show as a reduction in `updateReducerImpl`/commit frames.

## Related

- [006](006-update-match-write-coalescing.md) reduces how many `updateMatch` calls happen at all; this file makes each remaining one cheaper on the React side. Independent but complementary.
- [015](015-link-flushsync-click.md) covers the Link-side `flushSync(setIsTransitioning)` per click.
