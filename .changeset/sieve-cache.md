---
'@tanstack/router-core': patch
---

Replace the internal LRU cache behind path resolution, route matching and the SSR manifest lookup with a smaller SIEVE cache whose hits no longer relink a list, and fix an eviction edge case in the old implementation.
