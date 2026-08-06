---
'@tanstack/router-core': patch
---

Improve route-tree construction and matching performance by fusing static and
dynamic node creation, sorting only dynamic sibling lists that need it, and
deriving matcher depth from trie nodes.
