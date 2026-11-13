---
'@tanstack/router-generator': patch
---

A dev server or `tsr watch` keeps writing the route tree after its temporary directory (`.tanstack/tmp` by default) is deleted under it, for example by `git stash -u` or `git clean -fd` in a repository that doesn't ignore `.tanstack/`; until now, every later route change failed until restart.
