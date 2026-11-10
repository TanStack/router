---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

RSC: a server function nested in the statement right after a declaration it reads outside its handler (`const auth = createMiddleware(…)…` then `registry.add(createServerFn().middleware([auth]).handler(…))`) no longer makes the server-function provider throw `Cannot access … before initialization` when it loads (Rsbuild): code the compiler places after a statement now comes before the next one in every output it renders in, as it already did in the route module.
