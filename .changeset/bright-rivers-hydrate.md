---
'@tanstack/router-core': patch
---

Run custom router hydration before the initial client route match so hydrated router configuration, such as request-specific URL rewrites, can be installed before SSR hydration compares matches.
