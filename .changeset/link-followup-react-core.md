---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
'@tanstack/history': patch
---

Fixed Link destinations that resolve to a route mask are now reused across navigations instead of being rebuilt every time. A mounted Link now follows changes to its `href` and `reloadDocument` props, and React Links no longer each subscribe to a hydration flag.
