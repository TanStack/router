---
'@tanstack/history': patch
'@tanstack/router-core': patch
---

Use `slice` instead of `substring` where the bounds are always ordered and non-negative.
