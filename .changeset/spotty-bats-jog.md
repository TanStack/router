---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Reduce the bundle cost of shared Link pathname interpolation while preserving its rendering performance. Reuse one interpolation pass for pathname and optional metadata, keep the bounded cache on the router, and simplify React Link active-state and prop merging.
