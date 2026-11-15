---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

An `enum` or `namespace` that only removed code reads (a split route option, a server function's handler on the client) is now removed from the module like any other declaration, with the imports only it read.
