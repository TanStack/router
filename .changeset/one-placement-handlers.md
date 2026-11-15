---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Server function handler modules and the code Start removes for the other environment are now placed by the same rules as route splitting. On the server, a top-level statement a handler's code depends on (`table.set('a', handler)`, `db = connect()`, `if (…) { url = … }`) stays in its module and runs when the module loads, as it did before the compiler rewrite. The lazy handler module holds its own copy of the module state its handler reads, with the statements naming it, as the provider module before the rewrite did, so a handler sees the values the code before it computed at load. A function only a handler calls leaves the client even when it assigns a variable other code reads. An `enum` or `namespace` only removed code (a split route option, a removed handler) reads leaves the module like any other declaration, and a value only a type-only export reads (`export type User = typeof UserSchema`) is removed with its imports, as before the rewrite.
