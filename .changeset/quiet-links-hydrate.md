---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Fix `<Link>` hydrating with the wrong active state (`data-status`, `aria-current`, active class) when a navigation starts before a Suspense boundary containing the link has hydrated. `hydrate()` now records the location the server rendered with, and links resolve their `href` and active state against it while hydrating, then follow the live location once hydrated.
