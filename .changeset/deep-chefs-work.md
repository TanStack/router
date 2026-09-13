---
'@tanstack/react-router': patch
---

Reuse hydration snapshot getters to avoid unnecessary store-instance effect updates when Links and other hydration-aware components rerender.
