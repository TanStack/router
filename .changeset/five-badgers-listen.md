---
'@tanstack/router-generator': patch
---

Fix malformed generated paths when a `physical()` mount points at a subtree rooted by `__virtual.ts`, including nested virtual layouts that mount additional physical routes.
