---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

Route code splitting: a split chunk that copies a binding of the route file also runs an `export default <expression>` that reads or writes it, as on `main` (`let ready = false; export default (ready = true)` reads `true` in the chunk, not `false`); the chunk runs the expression as a statement and exports no default. A declaration a chunk copies keeps its comments, so an annotation written before `export` (`/* #__NO_SIDE_EFFECTS__ */ export function f`) still lets the bundler drop an unused call in the chunk.
