---
'@tanstack/router-core': patch
---

Cache route branches and interpolated paths on their route objects, removing the fixed template limit for registered routes and reusing cached paths across server requests. Rebuild tree-dependent caches together, preserve decoder and trailing-slash isolation, and keep unregistered templates bounded.
