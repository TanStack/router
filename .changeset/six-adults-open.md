---
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Reduce Link bundle size by sharing exact/fuzzy active-path checks and resolving only the selected active or inactive props. Avoid unnecessary class/style allocations while preserving reactive style updates, server rendering, and each framework's prop-override behavior.
