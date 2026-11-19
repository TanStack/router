---
'@tanstack/router-core': patch
---

Wait for the winning client load when navigation or invalidation replaces initial hydration, so hydration cannot finish before the new route state is ready.
