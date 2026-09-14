---
'@tanstack/router-core': patch
---

Parse the location once when `router.update()` changes the basepath or rewrite, collect `invalidate()` match ids in a single pass, and build the basepath rewrite without intermediate arrays.
