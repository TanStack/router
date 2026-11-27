---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Only set `aria-current="page"` on Links whose pathname exactly matches the current location. Fuzzy/ancestor path matches remain active for styling (`isActive`, `activeProps`, `data-status`) but no longer receive `aria-current`.
