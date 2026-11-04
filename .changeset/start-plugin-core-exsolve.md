---
'@tanstack/start-plugin-core': patch
---

Require `exsolve` `^1.1.3`, so memory no longer grows across builds in one process: a failed lookup that exsolve caches no longer keeps its callers alive. Entry lookups bypass exsolve's process-wide cache, so a dev server restart finds an entry file (such as `src/start.ts`) created since.
