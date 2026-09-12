---
'@tanstack/router-core': patch
---

Collect search middlewares with a counted loop so the optimized code stays valid across navigations. This removes a JIT recompilation that raised peak memory in the interrupted-navigations client memory benchmark.
