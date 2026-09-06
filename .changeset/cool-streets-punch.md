---
'@tanstack/router-core': patch
---

Reduce Promise allocations during client navigation and static server SSR policy resolution. Skip cancellable waits for synchronous beforeLoad results while preserving navigation cancellation.
