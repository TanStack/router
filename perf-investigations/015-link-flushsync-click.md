# 015 — Link click handler: `flushSync` + per-click `onResolved` subscription

|                 |                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/link.tsx`                                                                                                |
| Benchmarks      | client-nav (react)                                                                                                                  |
| Expected impact | Small-medium (a forced synchronous React render+commit per click, before navigation even starts; 10 clicks per benchmark iteration) |
| Confidence      | Medium (correctness is easy; need to confirm no test relies on synchronous attribute visibility)                                    |
| Risk            | Medium (observable timing of `data-transitioning`)                                                                                  |
| Prior art       | none found                                                                                                                          |

## Problem

`link.tsx:618-639` — on every internal-navigation click:

```ts
e.preventDefault()
flushSync(() => {
  setIsTransitioning(true)
})
const unsub = router.subscribe('onResolved', () => {
  unsub()
  setIsTransitioning(false)
})
router.navigate({ ... })
```

- `flushSync` forces React out of batching and synchronously renders+commits the clicked link's subtree **before** `router.navigate` runs. Per [013](013-link-options-memo-stability.md), that render re-runs `buildLocation` when option props are inline.
- The only consumer of this state is the `data-transitioning` attribute (`link.tsx:716, 724`) — the render-prop children only ever receive `isActive` (`link.tsx:929-934`).
- A one-shot `onResolved` subscription is allocated per click.

## Proposed approach

Option A (most conservative): drop `flushSync` and let the urgent state update batch with the navigation's first store write — the attribute still appears within the same frame.

Option B (bigger win): set the attribute via direct DOM mutation on `innerRef.current` (`el.setAttribute('data-transitioning', '')` / `removeAttribute`) instead of React state, removing both renders per click. The ref is stable; re-renders that recreate props must keep the attribute consistent (set it in both the DOM path and the rendered props while transitioning).

Either way, the `flushSync` import from `react-dom` may become removable — a bundle-size win.

## Risks & constraints

- Timing of `data-transitioning` becomes asynchronous relative to the click (Option A) or non-React-managed (Option B). Check `link.test.tsx` for assertions on synchronous visibility.
- Option B must handle: component re-render while transitioning (React would not know about the attribute — ensure rendered props agree), unmount mid-transition (the `onResolved` unsubscribe already handles state; DOM node is gone anyway).
- Keep `preventDefault`/navigation ordering identical.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

## Related

- [007](007-transitioner-transition-refcount.md) (the Transitioner-level transition churn) and [013](013-link-options-memo-stability.md) (what each forced render costs).
