---
'@tanstack/router-core': patch
---

Keep a route's `params.parse` false-skip and `params.priority` when it has a pathless layout child without its own `params.parse`. Before, adding such a child let URLs that the parent's `params.parse` rejected match the parent and its whole subtree.
