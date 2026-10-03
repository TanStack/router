---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Defer Link updates in departing route matches while keeping Links in retained matches current during navigation. Reuse built Link destinations for preloading and navigation without skipping search validation or live route callbacks.

Preserve current click options and source locations, including user event cancellation and state-prop overrides.

Consolidate Link hydration snapshots and avoid unused per-match presentation stores during server rendering.

Skip preload timer cancellation when no timer is pending, and catch up retained Link sources at the existing navigation completion boundary.

Use match-owned source contexts for Solid and Vue Links, including preload and click handlers. Read direct router and match snapshots in affected server hooks so server rendering does not create native reactivity.
