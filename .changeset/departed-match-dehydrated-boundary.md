---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Fix a crash when a navigation commits while a route's Suspense boundary is still dehydrated. React hydrates that boundary once with its old children before it applies the navigation, so the departed route's `Match`, `Outlet` and `useMatch` read a match store that `setMatches` had already cleared, and threw `Cannot read properties of undefined (reading 'routeId')` or `Invariant failed: Could not find a nearest match!`. The router stores now keep the previous route ids and the last match of each route that left with the latest change of route ids, and a tree that still renders a departed route reads them. `useMatch({ from })` for an inactive route still throws everywhere else.
