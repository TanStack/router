---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

On the server, each server function has one executing instance (its validator, middleware and module state), as before the compiler rewrite: a server function's handler module imports it from its file instead of copying it, and a split route chunk's copy of it is a caller, as in the browser, that reaches that instance through the server-function registry.
