---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting no longer moves a declaration that reads a module object through another name (`const alias = cfg; const y = alias.v`, `holder.cfg.v`, `{ ...alias }`, `const { v } = alias`) past a later write of the original binding (`cfg.v = 'NEW'`), where the split code read the new value instead of the one the source reads. Such a declaration stays in the route module with an `eager-split:state` warning, as when it reads the binding directly.
