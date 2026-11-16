---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

A declaration inside a function that only removed server code reads now leaves with its initialiser, as before the rewrite: in `function dbMiddleware() { const sql = connect(); return createMiddleware().server(() => … sql …) }`, the client no longer calls `connect()`, and the helper and the server-only package it imports are not in the client bundle.
