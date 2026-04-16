---
'@tanstack/router-core': patch
'@tanstack/solid-router': patch
---

fix: prevent navigation deadlock when the pending pool's latest write races the commit snapshot

After SSR hydration, navigating (e.g. `router.navigate({ to: '/$slug' })`)
to a route with a loader could deadlock the router in
`status: 'pending'` / `isLoading: true`, with the target match never
promoted into the active pool and `onResolved` never firing.

Root cause: committing pending → active did
`setMatches(pendingMatches.get()) + setPending([])`, which took a plain
snapshot of the pending store values and then discarded the pending
stores. If a write landed on a pending store after the snapshot was
read (e.g. a loader completion flushing inside a framework
transition), that write was lost — the new active store held the stale
`'pending'` status and the `Transitioner`'s `hasPending` gate stayed
pinned to `true`.

The fix:

- Add `stores.commitPending(nextMatches)`, which moves the pending
  store references into the active pool, preserving store identity and
  always reading the pending store's latest value (not the caller's
  snapshot).
- Wire the router's commit batch through `commitPending`.
- Read the pending pool in `hasPending` in addition to active-pool
  `status: 'pending'`, so the gate is never pinned by a stale active
  store.
