---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

A middleware link called on a `const` middleware (`mw.middleware([auth])`, `mw.server(…)`) counts as a write of that middleware wherever it stands, not only as a top-level statement or a declaration's initialiser: inside a function, a declaration that reads the middleware's options stays in the route module (`eager-split:state`); in a split route option value, the value stays in place when other code reads the middleware (`not-split:ordered-effect`). Before, the split code could read the options before or after the link ran, unlike the source.
