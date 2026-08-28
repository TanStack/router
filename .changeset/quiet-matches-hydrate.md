---
'@tanstack/react-router': patch
---

Prevent match store updates from invalidating client-only Suspense boundaries
before they hydrate.
