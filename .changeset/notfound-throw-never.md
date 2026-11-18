---
'@tanstack/router-core': patch
---

Type `notFound({ throw: true })` as returning `never`, so code after it is treated as unreachable and values narrow accordingly.
