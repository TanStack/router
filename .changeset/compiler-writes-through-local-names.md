---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Code splitting keeps the order of writes made through a local name and of writes in a function a split option calls. A write through a function's parameter, a `for…of` or `catch` variable, or a function's own alias (`function set(o) { o.theme = 'dark' }` with `set(prefs)`) is a write of the object it names, so a value read from that object when the module loads, before the write, stays in the route module with a warning instead of moving into a chunk that reads the written value. A split option whose value calls a wrapper that writes state the route module keeps (`component: withLog(Page)`, `withLog` pushing to a module array) stays in place with a warning, as it does when the wrapper assigns a `let`; a wrapper writing state only the chunk uses still splits.
