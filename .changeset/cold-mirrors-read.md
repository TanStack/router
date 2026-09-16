---
'@tanstack/router-core': patch
---

Reduce SSR Link rendering work by using fast-property null-prototype records on the server while preserving the existing client allocation path.
