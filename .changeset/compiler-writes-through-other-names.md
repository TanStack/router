---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting no longer moves a declaration that reads a module object past a write of that object through another name (`const alias = cfg; alias.v = 11`, `holder.c.v = 3`, `Object.assign(alias, …)`, `delete alias.v`, a function writing `holder[0].v`), where the split code read the written value instead of the one the source reads. Such a declaration stays in the route module with an `eager-split:state` warning, as when the write names the object directly; a write through another name in a split option value keeps the value in place when other code reads the object. A reader, the object and its writes that only one split option needs still move together, in source order.
