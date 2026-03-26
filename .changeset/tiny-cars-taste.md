---
'@tanstack/router-generator': patch
---

Fix file-based route generation when custom `routeToken` or `indexToken` values start with regex metacharacters like `+`.
