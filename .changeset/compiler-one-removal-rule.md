---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

A declaration inside a function that only code removed for the client names, in a type (`const cfg = loadConfig()` read by `typeof cfg` in a `createServerOnlyFn` body), is now removed from the client with the imports only it uses, as the same declaration at the top of the module already was: a `.server` module it reads no longer loads in the browser. Internal cleanups of the compiler core and its planners, with unchanged output.
