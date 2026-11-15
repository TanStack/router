---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

On the server, a split route chunk and a server function's handler module import a server function from its file instead of copying it, so each server function has one instance (its validator, middleware and module state) as before the compiler rewrite.
