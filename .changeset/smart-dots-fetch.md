---
'@tanstack/react-start-rsc': patch
---

Defer RSC stream decoding until render so unused server components do not load client JavaScript or CSS during navigation or hydration.
