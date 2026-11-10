---
'@tanstack/router-generator': patch
---

Dev: when a batch of route file changes fails because one file can't be read (permissions, a directory in its place), the other files' changes still reach the route tree with the next batch, instead of the tree keeping a route a file no longer exports until a file is added or removed.
