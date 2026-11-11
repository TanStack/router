---
'@tanstack/router-utils': patch
---

Dev servers: a branch switch that rewrites thousands of files the app never loaded no longer stalls the dev server for about a second per 3,000 files: the imports a created file may take over (`./x` found `x/index.ts`, and `x.ts` appears) are looked up by directory and name instead of scanning every import of every compiled module. A repeated event of a `package.json` or tsconfig (the same save through a second environment, a touch) no longer resets the resolution cache.
