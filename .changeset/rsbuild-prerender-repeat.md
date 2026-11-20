---
'@tanstack/start-plugin-core': patch
---

Rsbuild: a second `build()` in one process (a program that calls `build()` again on its Rsbuild instance) prerenders its pages with its own server build. It rendered them with the first build's server, which Node had kept by its file name, so the second build's HTML had the first build's pages and file names.
