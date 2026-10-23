---
'@tanstack/start-plugin-core': patch
---

Release each environment's server function compiler when its build ends, so its module cache and hook context no longer stay in memory while later environments build.
