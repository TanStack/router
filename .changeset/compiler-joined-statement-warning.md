---
'@tanstack/router-utils': patch
---

A binding only split code uses that stays in the route module because a statement calling a known method on a binding the route module keeps uses it (`table.add(d)` on a `Set`, `list.push(d)`, `map.set(k, d)`) is now reported once, as the same statement with an unknown method already was.
