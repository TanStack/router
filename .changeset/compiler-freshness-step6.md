---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Dev servers: a module compiled while one of its imports was missing no longer keeps "not found" for that import once the file is back, also when the module had been compiled before with another import that never resolves (a types-only `./types`), and when the resolver answered from before the file came back. A file removed and created again within one watcher event (a branch switch, a stash and pop) re-plans the modules that found another file of its name meanwhile (`x/index.ts` beside `x.ts`). A Vite hot update no longer compiles a route in every environment when none of its split chunks were loaded: rewriting or editing 750 routes at once (a checkout) settles in about 0.2 s instead of 0.9 s on a 3,000-module app.
