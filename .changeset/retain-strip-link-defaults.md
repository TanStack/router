---
'@tanstack/router-core': patch
---

Fix `retainSearchParams` before `stripSearchParams` so Link hrefs omit default search params instead of keeping them and breaking active matching.
