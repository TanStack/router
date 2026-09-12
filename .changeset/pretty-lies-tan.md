---
'@tanstack/router-core': patch
---

Initialize routes directly during route-tree processing, removing the callback indirection while preserving parent-first initialization and route indexes.
