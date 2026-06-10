DONE IN https://github.com/TanStack/router/pull/7595

# 011 — `useMatch` selector throws (and React swallows) an Error per unmounting subscriber per navigation

|                 |                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Area            | `packages/react-router/src/useMatch.tsx`                                                                             |
| Benchmarks      | client-nav (react)                                                                                                   |
| Expected impact | Small-medium (~1% of client profile + GC), very low risk                                                             |
| Confidence      | High (profiled: `invariant` 50.8 ms self in a 5.4 s profile; mechanism verified in React's `checkIfSnapshotChanged`) |
| Risk            | Low                                                                                                                  |
| Prior art       | none found                                                                                                           |

## Problem

`useMatch.tsx:182-198` — the selector passed to `useStore` throws when the match is missing:

```ts
return useStore(matchStore ?? dummyStore, (match) => {
  if (!match) {
    if (opts.shouldThrow ?? true) {
      ...
      invariant()   // throws Error('Invariant failed')
    }
    return undefined
  }
  return selector(match as any)
})
```

When navigating away from a route (e.g. `/search` → `/items`), the subscribed match store resolves to `undefined` during the commit. The store notification re-runs each hook's selector via React's `checkIfSnapshotChanged`; the selector throws, **React's try/catch swallows the error and forces a re-render**, and the component unmounts before any render observes the throw. The Error (with stack capture) is pure overhead.

In the benchmark: ~30 route-level subscribers on `/search` (10×3 hooks) and ~12 on `/ctx` each construct+throw+catch an Error on the navigation that removes them — every iteration.

## Proposed approach

Return a sentinel (or `undefined`) from the selector when the match is missing, and move the `shouldThrow` invariant into the hook body, applied to the value returned by `useStore` (i.e. on the render path):

- Renders with a genuinely missing match still throw, with identical public behavior and message.
- Transient store notifications on about-to-unmount subscribers stop allocating/throwing.

Needs a sentinel distinct from a legitimate `undefined` selector result (a module-level `const MISSING = Symbol()` or object) so `shouldThrow: false` keeps returning `undefined` to the caller while the hook can distinguish "missing match" from "select returned undefined".

## Risks & constraints

- Preserve `shouldThrow: false` → `undefined` exactly.
- The dev-mode descriptive error message (`useMatch.tsx:185-189`) must still be thrown from the same user-visible point (component render).
- Solid/vue have analogous code; out of scope here but note for parity.
- Bundle delta ≈ neutral (moves a branch).

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/react-router:test:unit
pnpm nx run @benchmarks/bundle-size:build -- --scenario react-router.minimal,react-router.full
```

Focus tests: `useMatch`/hooks with `shouldThrow` both values, hooks used outside a matching route, unmount-during-navigation.
