---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Server function handler modules and the code Start removes for the other environment are now placed by the same rules as route splitting. On the server, a top-level statement that a handler's code depends on (`table.set('a', handler)`, `db = connect()`, `if (…) { url = … }`) stays in its module and runs when the module loads, once, as it did before the compiler rewrite; the lazy handler module imports what the module keeps. A function only a handler calls leaves the client even when it assigns a variable other code reads; such a handler then stays in its module on the server. An `enum` or `namespace` only removed code (a split route option, a removed handler) reads leaves the module like any other declaration, and a value only a type-only export reads (`export type User = typeof UserSchema`) is removed with its imports, as before the rewrite.
