---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Stop the Start compiler's module cache from retaining parsed ASTs. `extractModuleInfoFromAst` now stores a small summary of each binding's initializer instead of the `t.Expression` node itself, so a cached module no longer keeps the `@babel/traverse` `NodePath` and `Scope` graph of the file it came from reachable.
