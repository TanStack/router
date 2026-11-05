---
'@tanstack/start-plugin-core': patch
---

Require `exsolve` `^1.1.3`: a failed lookup that exsolve caches no longer keeps its callers alive, so Start's cached failed lookups no longer hold on to each build's objects. Entry lookups bypass exsolve's process-wide cache, so a dev server restart finds an entry file (such as `src/start.ts`) created since.
