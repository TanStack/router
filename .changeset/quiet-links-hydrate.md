---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix `<Link>` hydrating with the wrong active state (`data-status`, `aria-current`, active class) when a navigation starts before the component containing the link has hydrated. `hydrate()` now records the location the server rendered with, and links resolve their `href` and active state against it while hydrating, then follow the live location once hydrated. Affects React, Solid and Vue: none of the three rectifies the mismatched attributes, so the stale state persisted on the element.
