---
'@tanstack/history': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Add `useBlockerState` for global navigation-blocking state.

`useBlockerState` returns `{ status, proceed, reset, proceedAll }`, letting a single shared UI resolve a navigation blocked by any `useBlocker` registered elsewhere in the app, including browser back/forward and multiple blockers.

The `BlockerFn` contract is extended additively: a blocker may now return an `AsyncGenerator` in addition to the existing `boolean`/`Promise<boolean>`, so existing blockers and custom histories keep working unchanged.
