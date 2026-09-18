---
'@tanstack/router-core': patch
---

Reduce navigation cache allocations by retaining the cache map and unchanged entries, and skip loader-flight registry sweeps when no unowned work was reserved. Preserve synchronous expiration.
