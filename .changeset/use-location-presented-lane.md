---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

`useLocation` now returns the location that produced the matches currently
being rendered instead of the location the router has parsed but not yet
loaded. A component on the route being left no longer re-renders with the
destination's pathname before it unmounts. The presented location is
published on the same lane as the matches it describes, so the two can never
disagree. `router.state.location` is unchanged and still reports the
requested location while it loads.
