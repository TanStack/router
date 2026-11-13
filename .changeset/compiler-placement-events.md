---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting keeps an exported declaration that reads, when the route module loads, state the module's functions write (`let n = 0; export function inc() { n++ }; export const initial = [n]`) in the route module, with an `eager-export:state` warning naming the binding: its own module would evaluate with the first chunk importing it, after `inc()` may have run, so a build showed a later value than dev or the unsplit code. A declaration whose load calls, through another function, a function a later statement attaches to an object or assigns (`handlers.count = () => n`, then `const x = run('count')`) now stays in the route module with its warning; before, it moved to the chunk and read the state late. A planner region spanning whole statements is refused (no planner registers one).
