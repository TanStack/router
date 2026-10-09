---
'@tanstack/router-utils': patch
---

Stop the Start compiler's module cache from retaining parsed ASTs. `extractModuleInfoFromAst` now stores a detached clone of each binding's initializer, so a cached module no longer keeps the `@babel/traverse` `NodePath` and `Scope` graph of the file it came from reachable.
