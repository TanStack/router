---
'@tanstack/router-generator': patch
---

A long-running dev server or `tsr watch` keeps a digest of each route file instead of its text (about 2.4 KB less per route file), and an edit that leaves the route tree unchanged no longer goes over every route file.
