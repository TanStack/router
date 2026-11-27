---
'@tanstack/start-plugin-core': patch
---

Fix `Server function info not found` in Vite production builds when a server function is only ever called from inside another server function. Such a function is reachable only through the server-function provider modules, which the resolver manifest imports, so it was discovered after the manifest had already been generated. The manifest now loads the provider modules and what they reach before it is generated.
