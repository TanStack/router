---
'@tanstack/router-core': patch
---

Speed up `deepEqual`: identical array elements no longer recurse, the exact comparison keeps a single key counter, and the redundant `typeof` early exit is gone. Equal numeric arrays compare ~70% faster and record comparisons 5–12% faster in the mixed-mode workloads that Link option stabilization and active-state checks produce, with a slightly smaller bundle. Behavior, including key enumeration and getter read order, is unchanged.
