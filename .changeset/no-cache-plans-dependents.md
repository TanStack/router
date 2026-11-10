---
'@tanstack/router-utils': patch
---

With `TSR_COMPILER_NO_CACHE=plans` (or `all`), an edit of a module still updates the modules that read it: plans are no longer reused, but their dependencies are kept.
