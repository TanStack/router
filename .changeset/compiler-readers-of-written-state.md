---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting places a declaration that reads state the module writes when it loads on its own: one that reads a binding after its last write (`const a = {}; a.v = 1; const x = [a]`) now moves with the split code that needs it instead of staying in the route module with the binding, and its `eager-split:state` warning goes. One that reads it before a later write keeps its value: it moves only together with that write. A declaration whose initialiser writes a member of a binding (`const y = f(cfg.x = 1)`) stays with that binding. A route module of many statements filling a registry read by many declarations compiles in quadratic time instead of cubic. The compiler's placement self-check now also runs on a module whose planner kept a fallback it did not act on.
