---
'@tanstack/start-plugin-core': patch
---

Require `exsolve` `^1.1.3`, which no longer keeps compilers alive through cached failed lookups, so memory no longer grows across builds in one process.
