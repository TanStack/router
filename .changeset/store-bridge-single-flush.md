---
'@tanstack/solid-router': patch
---

Stop force-flushing Solid's scheduler on every router-core batch. Store writes now coalesce through the scheduler (one settle per navigation instead of 3-5 full synchronous flushes) while reads stay synchronously fresh via a shadow value in the store bridge.
