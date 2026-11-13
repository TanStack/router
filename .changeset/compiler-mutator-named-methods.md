---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting no longer takes a call of a method named like an array's or a map's mutator (`push`, `set`, `add`, …) on an object the module defines (an object literal, a class, a function given that method, a call's result) as a plain write of that object: it is a call of the module's own code. `push` on an array literal and `set`/`add` on a `new Map()`/`new Set()` are still writes.
