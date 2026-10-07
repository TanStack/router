---
'@tanstack/solid-router': patch
---

Solid Links resolve their own props through one reactive memo instead of two, which makes mounting and updating many Links slightly faster.
