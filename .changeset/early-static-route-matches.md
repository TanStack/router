---
'@tanstack/router-core': patch
---

Fix route matching specificity so routes with the same number of static segments prefer the match whose static segment occurs earlier, including when competing with wildcard routes.
