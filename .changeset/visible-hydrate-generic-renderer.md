---
'@tanstack/react-start-client': patch
---

Render `visible()` through `GenericHydrate` like the other hydration strategies. Its standalone renderer placed a `useEffect` after a conditional `use()`, so when React replayed a boundary whose gate had opened while it was suspended, the effect ran under the wrong hook dispatcher, hydration failed with "Update hook called on initial render", and React recovered by client-rendering the boundary — fetching the deferred chunk immediately instead of waiting for visibility.
